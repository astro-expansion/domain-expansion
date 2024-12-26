import type * as Runtime from 'astro/compiler-runtime';
import hashSum from 'hash-sum';
import { rootDebug } from './debug.js';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import type { SSRMetadata, SSRResult } from 'astro';
import { runtime } from './utils.js';
import type { RenderDestination } from 'astro/runtime/server/render/common.js';
import type { PersistedMetadata } from './renderFileStore.js';
import { isDeepStrictEqual, types } from 'node:util';
import {
	computeEntryHash,
	getCachingOptions,
	getCurrentContext,
	makeContextTracking,
} from './contextTracking.js';

const debug = rootDebug.extend('render-caching');

const ASSET_SERVICE_CALLS = Symbol('@domain-expansion:astro-assets-service-calls');

interface ExtendedSSRResult extends SSRResult {
	[ASSET_SERVICE_CALLS]: PersistedMetadata['assetServiceCalls'];
}

(globalThis as any)[Symbol.for('@domain-expansion:astro-component-caching')] = (
	originalFn: typeof Runtime.createComponent
): typeof Runtime.createComponent => {
	return function cachedCreateComponent(factoryOrOptions, moduleId, propagation) {
		const options =
			typeof factoryOrOptions === 'function'
				? ({ factory: factoryOrOptions, moduleId, propagation } as Exclude<
						typeof factoryOrOptions,
						Function
					>)
				: factoryOrOptions;

		const context = getCurrentContext();

		let cacheScope = options.moduleId || '';

		const { componentHashes } = getCachingOptions();

		if (!options.moduleId || !componentHashes.has(options.moduleId)) {
			if (!context) return originalFn(options);
			delete options.moduleId;

			if (!context.renderingEntry) {
				context.doNotCache = true;
				return originalFn(options);
			}

			const ccRenderCall = context.renderEntryCalls.at(-1)!;
			cacheScope = `ccEntry:${ccRenderCall.id}:${ccRenderCall.hash}`;
		} else {
			const hash = componentHashes.get(options.moduleId)!;
			cacheScope = hash;
		}

		return originalFn(
			cacheFn(cacheScope, options.factory, options.moduleId),
			options.moduleId,
			options.propagation
		);
	};

	function cacheFn(
		cacheScope: string,
		factory: AstroComponentFactory,
		moduleId?: string
	): AstroComponentFactory {
		const { cache, routeEntrypoints, componentHashes, componentsHaveSharedState, ...cacheOptions } =
			getCachingOptions();

		const isEntrypoint = routeEntrypoints.includes(moduleId!);
		const cacheParams: Record<'persist' | 'skipInMemory', boolean> = {
			persist:
				(isEntrypoint && cacheOptions.cachePages) ||
				(!isEntrypoint && cacheOptions.cacheComponents === 'persistent'),
			skipInMemory: isEntrypoint || cacheOptions.cacheComponents === false,
		};

		debug('Creating cached component', {
			cacheScope,
			moduleId,
			isEntrypoint,
			cacheParams,
		});

		return async (result: ExtendedSSRResult, props, slots) => {
			const context = getCurrentContext();

			if (context) {
				if (moduleId) {
					context.nestedComponents[moduleId] = componentHashes.get(moduleId)!;
				}
			}

			if (!cacheParams.persist && cacheParams.skipInMemory) return factory(result, props, slots);

			if (slots !== undefined && Object.keys(slots).length > 0) {
				debug('Skip caching of component instance with children', { moduleId });
				return factory(result, props, slots);
			}

			// TODO: Handle edge-cases involving Object.defineProperty
			const resolvedProps = Object.fromEntries(
				(
					await Promise.all(
						Object.entries(props).map(async ([key, value]) => [
							key,
							types.isProxy(value) ? undefined : await value,
						])
					)
				).filter(([_key, value]) => !!value)
			);

			// We need to delete this because otherwise scopes from outside of a component can be globally
			// restricted to the inside of a child component through a slot and to support that the component
			// has to depend on its parent. Don't do that.
			//
			// This is required because this block in Astro doesn't return the `transformResult.scope`:
			// https://github.com/withastro/astro/blob/799c8676dfba0d281faf2a3f2d9513518b57593b/packages/astro/src/vite-plugin-astro/index.ts?plain=1#L246-L257
			// TODO: This might no longer be necessary, try removing it
			const scopeProp = Object.keys(resolvedProps).find((prop) =>
				prop.startsWith('data-astro-cid-')
			);
			if (scopeProp !== undefined) {
				delete resolvedProps[scopeProp];
			}

			const url = new URL(result.request.url);

			const hash = hashSum(
				isEntrypoint || componentsHaveSharedState
					? [moduleId, result.compressHTML, result.params, url.pathname, resolvedProps]
					: [moduleId, result.compressHTML, resolvedProps]
			);
			const cacheKey = `${cacheScope}:${hash}`;

			const { runIn: enterTrackingScope, collect: collectTracking } = makeContextTracking();

			return enterTrackingScope(async () => {
				const cachedMetadata = await getValidMetadata(cacheKey);

				const cachedValue = await cache.getRenderValue({
					key: cacheKey,
					loadFresh: () => factory(result, props, slots),
					force: !cachedMetadata,
					...cacheParams,
				});

				const resultValue = cachedValue.value();

				if (resultValue instanceof Response) return resultValue;

				const templateResult = runtime.isRenderTemplateResult(resultValue)
					? resultValue
					: resultValue.content;

				const originalRender = templateResult.render;

				if (cachedMetadata && cachedValue.cached) {
					const { metadata } = cachedMetadata;

					Object.assign(templateResult, {
						render: async (destination: RenderDestination) => {
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
						},
					});

					return resultValue;
				}

				const previousExtraHeadLength = result._metadata.extraHead.length;
				const renderedScriptsDiff = delayedSetDifference(result._metadata.renderedScripts);
				const hasDirectivedDiff = delayedSetDifference(result._metadata.hasDirectives);
				const rendererSpecificHydrationScriptsDiff = delayedSetDifference(
					result._metadata.rendererSpecificHydrationScripts
				);

				Object.assign(templateResult, {
					render: (destination: RenderDestination) =>
						enterTrackingScope(async () => {
							// Renderer was not cached, so we need to cache the metadata as well

							const context = collectTracking();

							cache.saveMetadata({
								key: cacheKey,
								metadata: {
									...context,
									metadata: {
										...result._metadata,
										extraHead: result._metadata.extraHead.slice(previousExtraHeadLength),
										renderedScripts: renderedScriptsDiff(result._metadata.renderedScripts),
										hasDirectives: hasDirectivedDiff(result._metadata.hasDirectives),
										rendererSpecificHydrationScripts: rendererSpecificHydrationScriptsDiff(
											result._metadata.rendererSpecificHydrationScripts
										),
									},
								},
								...cacheParams,
							});

							return originalRender.call(templateResult, destination);
						}),
				});

				return resultValue;
			});
		};

		async function getValidMetadata(cacheKey: string): Promise<PersistedMetadata | null> {
			const cachedMetadata = await cache.getMetadata({
				key: cacheKey,
				...cacheParams,
			});
			if (!cachedMetadata) return null;

			for (const [component, hash] of Object.entries(cachedMetadata.nestedComponents)) {
				const currentHash = componentHashes.get(component);
				if (currentHash !== hash) return null;
			}

			for (const entry of cachedMetadata.renderEntryCalls) {
				const currentHash = await computeEntryHash(entry.filePath);
				if (currentHash !== entry.hash) return null;
			}

			for (const { options, resultingAttributes } of cachedMetadata.assetServiceCalls) {
				debug('Replaying getImage call', { options });
				const result = await runtime.getImage(options);

				if (!isDeepStrictEqual(result.attributes, resultingAttributes)) {
					debug('Image call mismatch, bailing out of cache');
					return null;
				}
			}

			return cachedMetadata;
		}
	}
};

function delayedSetDifference(previous: Set<string>): (next: Set<string>) => Set<string> {
	const storedPrevious = new Set(previous);
	return (next) => {
		const newSet = new Set(next);
		for (const k of storedPrevious.values()) {
			newSet.delete(k);
		}
		return newSet;
	};
}
