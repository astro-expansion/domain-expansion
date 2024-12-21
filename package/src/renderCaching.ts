import type * as Runtime from "astro/compiler-runtime";
import hashSum from "hash-sum";
import { Cache } from "./cache.ts";
import { rootDebug } from "./debug.ts";
import { relative } from 'pathe';
import type { AstroComponentFactory } from "astro/runtime/server/index.js";
import type { SSRResult } from "astro";
import { fileURLToPath } from "url";

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

export const makeCaching = (cache: Cache, root: string, routeEntrypoints: string[]): CacheRenderingFn => (originalFn) => {
  debug('Render caching called with:', { routeEntrypoints });

  return (factoryOrOptions, moduleId, propagation) => {
    const scriptPath = relative(root, fileURLToPath(getCallSites()[1]!.getScriptNameOrSourceURL()));
    const modulePath = relative(root, moduleId || '');

    const cacheScope = `${modulePath}:${scriptPath}`.replaceAll('/', '__').replaceAll('.', '_');

    if (typeof factoryOrOptions === 'function') {
      return originalFn(cacheFn(cacheScope, factoryOrOptions), moduleId, propagation);
    }

    return originalFn({
      ...factoryOrOptions,
      factory: cacheFn(cacheScope, factoryOrOptions.factory),
    });
  }

  function cacheFn(cacheScope: string, factory: AstroComponentFactory): AstroComponentFactory {
    return async (result: SSRResult, props, slots) => {
      if (slots !== undefined && Object.keys(slots).length > 0) return factory(result, props, slots);

      const resolvedProps = Object.fromEntries(await Promise.all(
        Object.entries(props)
          .map(async ([key, value]) => [key, await value])
      ));

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

      const hash = hashSum([result.params, url.pathname, url.search, resolvedProps]);

      return cache.getValue(`${cacheScope}:${hash}`, () => factory(result, props, slots));

    }
  }
}
