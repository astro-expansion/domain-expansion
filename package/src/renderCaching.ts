import type * as Runtime from "astro/compiler-runtime";
import hashSum from "hash-sum";
import { Cache } from "./cache.js";
import { rootDebug } from "./debug.js";
import { relative } from 'pathe';
import type { AstroComponentFactory } from "astro/runtime/server/index.js";
import type { SSRMetadata, SSRResult } from "astro";
import { fileURLToPath } from "url";
import { runtime } from "./utils.js";
import type { RenderDestination } from "astro/runtime/server/render/common.js";
import type { PersistedMetadata } from "./renderFileStore.ts";
import type { getImage } from "astro/assets";
import { Lazy } from "@inox-tools/utils/lazy";
import { isDeepStrictEqual, types } from "util";
import { AsyncLocalStorage } from "async_hooks";

type GetImageFn = typeof getImage;

type CacheRenderingFn = (originalFn: typeof Runtime.createComponent) => typeof Runtime.createComponent;

const debug = rootDebug.extend('render-caching');

function getCallSites(): NodeJS.CallSite[] {
  const previous = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = (_, css) => {
      return css;
    }

    return (new Error().stack as unknown as NodeJS.CallSite[]).slice(1);
  } finally {
    Error.prepareStackTrace = previous;
  }
}

const ASSET_SERVICE_CALLS = Symbol('@domain-expansion:astro-assets-service-calls');

interface ExtendedSSRResult extends SSRResult {
  [ASSET_SERVICE_CALLS]: PersistedMetadata['assetServiceCalls'];
}

export const makeCaching = (cache: Cache, root: string, routeEntrypoints: string[]): CacheRenderingFn => (originalFn) => {
  debug('Render caching called with:', { routeEntrypoints });

  return (factoryOrOptions, moduleId, propagation) => {
    const scriptPath = relative(root, fileURLToPath(getCallSites()[1]!.getScriptNameOrSourceURL()));
    const modulePath = relative(root, moduleId || '');

    const cacheScope = `${modulePath}:${scriptPath}`;

    if (typeof factoryOrOptions === 'function') {
      return originalFn(cacheFn(cacheScope, factoryOrOptions, moduleId), moduleId, propagation);
    }

    return originalFn({
      ...factoryOrOptions,
      factory: cacheFn(cacheScope, factoryOrOptions.factory, factoryOrOptions.moduleId),
    });
  }

  function cacheFn(cacheScope: string, factory: AstroComponentFactory, moduleId?: string): AstroComponentFactory {
    return async (result: ExtendedSSRResult, props, slots) => {
      if (result[ASSET_SERVICE_CALLS] === undefined) {
        result[ASSET_SERVICE_CALLS] = [];
      }

      if (slots !== undefined && Object.keys(slots).length > 0) return factory(result, props, slots);

      // TODO: Handle edge-cases involving Object.defineProperty
      const resolvedProps = Object.fromEntries((await Promise.all(
        Object.entries(props)
          .map(async ([key, value]) => [key, types.isProxy(value) ? undefined : await value])
      )).filter((_key, value) => !!value));

      // We need to delete this because otherwise scopes from outside of a component can be globally
      // restricted to the inside of a child component through a slot and to support that the component
      // has to depend on its parent. Don't do that.
      //
      // This is required because this block in Astro doesn't return the `transformResult.scope`:
      // https://github.com/withastro/astro/blob/799c8676dfba0d281faf2a3f2d9513518b57593b/packages/astro/src/vite-plugin-astro/index.ts?plain=1#L246-L257
      const scopeProp = Object.keys(resolvedProps).find(prop => prop.startsWith('data-astro-cid-'));
      if (scopeProp !== undefined) {
        delete resolvedProps[scopeProp];
      }

      const url = new URL(result.request.url);

      const hash = hashSum([result.compressHTML, result.params, url.pathname, url.search, resolvedProps]);
      const cacheKey = `${cacheScope}:${hash}`;

      const { runIn: enterAssetScope, collect: getAssetCallsRecord } = makeAssetCallRecordCollector();

      return enterAssetScope(async () => {
        const cachedValue = await cache.getRenderValue(
          cacheKey,
          () => factory(result, props, slots),
        );

        const resultValue = cachedValue.value()

        if (resultValue instanceof Response) return resultValue;

        const templateResult = runtime.isRenderTemplateResult(resultValue)
          ? resultValue
          : resultValue.content;

        const originalRender = templateResult.render;

        if (cachedValue.cached) {
          const cachedMetadata = await cache.getMetadata(cacheKey);
          if (!cachedMetadata) return factory(result, props, slots);
          const { metadata } = cachedMetadata;

          const bailOut = Lazy.of(() => factory(result, props, slots));

          Object.assign(templateResult, {
            render: async (destination: RenderDestination) => {
              // result.styles = cachedValue.styles;
              // result.scripts = cachedValue.scripts;
              // result.links = cachedValue.links;
              // result.componentMetadata = cachedValue.componentMetadata;
              // result.inlinedScripts = cachedValue.inlinedScripts;

              if (moduleId?.endsWith('TestStyle.astro')) {
                debugger;
              }

              for (const { options, config, resultingAttributes } of cachedMetadata.assetServiceCalls) {
                debug('Replaying getImage call', { options, config });
                const result = await runtime.getImage(options, config);

                if (!isDeepStrictEqual(result.attributes, resultingAttributes)) {
                  debug('Image call mismatch, bailing out of cache');
                  const bailed = await bailOut.get();
                  if (bailed instanceof Response) {
                    destination.write(bailed);
                    return
                  }

                  if (runtime.isRenderTemplateResult(bailed)) {
                    return bailed.render(destination);
                  }

                  if (runtime.isHeadAndContent(bailed)) {
                    return bailed.content.render(destination);
                  }

                  throw new Error('Unexpected bail out result');
                }
              }

              const newMetadata: SSRMetadata = {
                ...metadata,
                extraHead: result._metadata.extraHead.concat(metadata.extraHead),
                renderedScripts: new Set([
                  ...result._metadata.renderedScripts.values(),
                  ...metadata.renderedScripts.values(),
                ]),
                hasDirectives: new Set([
                  ...result._metadata.hasDirectives.values(),
                  ...metadata.hasDirectives.values(),
                ]),
                rendererSpecificHydrationScripts: new Set([
                  ...result._metadata.rendererSpecificHydrationScripts.values(),
                  ...metadata.rendererSpecificHydrationScripts.values(),
                ]),
                propagators: result._metadata.propagators,
              };

              Object.assign(result._metadata, newMetadata);

              return originalRender.call(templateResult, destination);
            }
          })

          return resultValue;
        }

        const previousExtraHeadLength = result._metadata.extraHead.length;
        const renderedScriptsDiff = delayedSetDifference(result._metadata.renderedScripts);
        const hasDirectivedDiff = delayedSetDifference(result._metadata.hasDirectives);
        const rendererSpecificHydrationScriptsDiff = delayedSetDifference(result._metadata.rendererSpecificHydrationScripts);

        Object.assign(templateResult, {
          render: (destination: RenderDestination) => enterAssetScope(async () => {
            // Renderer was not cached, so we need to cache the metadata as well

            if (moduleId?.endsWith('TestStyle.astro')) {
              debugger;
            }

            await cache.saveMetadata(cacheKey, {
              // styles: result.styles,
              // scripts: result.scripts,
              // links: result.links,
              // componentMetadata: result.componentMetadata,
              // inlinedScripts: result.inlinedScripts,
              assetServiceCalls: getAssetCallsRecord(),
              metadata: {
                ...result._metadata,
                extraHead: result._metadata.extraHead.slice(previousExtraHeadLength),
                renderedScripts: renderedScriptsDiff(result._metadata.renderedScripts),
                hasDirectives: hasDirectivedDiff(result._metadata.hasDirectives),
                rendererSpecificHydrationScripts: rendererSpecificHydrationScriptsDiff(result._metadata.rendererSpecificHydrationScripts),
              },
            });

            return originalRender.call(templateResult, destination);
          }),
        });


        return resultValue;
      });
    }
  }
}

function delayedSetDifference(previous: Set<string>): (next: Set<string>) => Set<string> {
  const storedPrevious = new Set(previous);
  return (next) => {
    const newSet = new Set(next);
    for (const k of storedPrevious.values()) {
      newSet.delete(k);
    }
    return newSet;
  }
}

const assetTrackingSym = Symbol.for('@domain-expansion:astro-asset-tracking');

const assetCollector = new AsyncLocalStorage<PersistedMetadata['assetServiceCalls']>();

(globalThis as any)[assetTrackingSym] = (getImage: GetImageFn): GetImageFn => {
  runtime.getImage = getImage;
  debug('Wrapping getImage');
  return async (options, config) => {
    debug('Get image called');
    const result = await getImage(options, config);

    const collector = assetCollector.getStore();

    if (collector) {
      const val: PersistedMetadata['assetServiceCalls'][number] = {
        options, config,
        resultingAttributes: result.attributes,
      };
      debug('Collected getImage call', val);
      collector.push(val);
    }

    return result;
  }
}

function makeAssetCallRecordCollector(): {
  runIn: <T>(fn: () => T) => T,
  collect: () => PersistedMetadata['assetServiceCalls'],
} {
  debug('Initializing asset collector');
  const parent = assetCollector.getStore();
  const collector: PersistedMetadata['assetServiceCalls'] = [];

  return {
    runIn: <T>(fn: () => T): T => {
      return assetCollector.run(collector, fn);
    },
    collect: () => {
      if (collector.length) debug('Retrieving collected images', { callCount: collector.length });
      parent?.push(...collector);
      return collector;
    },
  };
}
