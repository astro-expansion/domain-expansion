import { addIntegration, defineIntegration } from "astro-integration-kit";
import { interceptorPlugin } from "./interceptor.js";
import { clearMetrics, collectMetrics } from "./metrics.js";
import chalk from "chalk";
import humanFormat from "human-format";
import { z } from "astro/zod";

function getDefaultCacheComponents(): false | 'in-memory' | 'persistent' {
	const env = process.env.DOMAIN_EXPANSION_CACHE_COMPONENT;

	switch (env) {
		case 'false':
			return false;
		case 'in-memory':
			return 'in-memory';
		case 'persistent':
			return 'persistent';
		case '':
		case undefined:
			return false;
		default:
			console.warn(chalk.bold.redBright(`Invalid environment variable value for component cache: ${env}`));
			console.warn(chalk.italic.yellow('Assuming "in-memory" as default.'));
			return 'in-memory';
	}
}

export const INTEGRATION_NAME = '@domain-expansion/astro';

export const integration = defineIntegration({
	name: INTEGRATION_NAME,
	optionsSchema: z.object({
		/**
		 * Whether non-page components should be cached.
		 *
		 * - `false` (default) means not caching at all
		 * - `in-memory` means deduplicating repeated uses of components
		 *   without persisting them to disk
		 * - `persistent` means persisting all uses of components to disk
		 *   just like pages. Changes to other segments of a page will use
		 *   the cached result of all unchanged components
		 *
		 * Components receiving slots are never cached.
		 * If your component relies on state provided through Astro.locals
		 * or any other means (like Starlight), you should also enable
		 * `componentHasSharedState` to make sure the component is only
		 * reused when the shared state is not expected to change.
		 */
		cacheComponents: z.enum(['in-memory', 'persistent'])
			.or(z.literal(false))
			.default(getDefaultCacheComponents()),
		componentsHaveSharedState: z.boolean().default(false),
		cachePages: z.boolean()
			.default((process.env.DOMAIN_EXPANSION_CACHE_PAGES || 'true') === 'true'),
		/**
		 * Cache prefix used to store independent cache data across multiple runs.
		 *
		 * @internal
		 */
		cachePrefix: z.string()
			.optional()
			.default('')
	})
		.default({}),
	setup({ options }) {
		const routeEntrypoints: string[] = [];
		let cleanup: undefined | (() => Promise<void>);

		return {
			hooks: {
				'astro:routes:resolved': (params) => {
					routeEntrypoints.length = 0;
					routeEntrypoints.push(...params.routes.map(route => route.entrypoint));
				},
				'astro:build:setup': ({ updateConfig, target }) => {
					if (target === 'server') {
						const interceptor = interceptorPlugin({
							...options,
							routeEntrypoints,
						});
						cleanup = interceptor.cleanup;
						updateConfig({
							plugins: [interceptor.plugin],
						});
					}
				},
				'astro:build:done': async () => {
					await cleanup?.();
				},
				'astro:config:setup': (params) => {
					if (params.command !== 'build') return;

					clearMetrics();

					addIntegration(params, {
						ensureUnique: true,
						integration: {
							name: '@domain-expansion/astro:reporting',
							hooks: {
								'astro:build:done': ({ logger }) => {
									if (!['debug', 'info'].includes(logger.options.level)) return;

									const metrics = collectMetrics();

									const fsCacheTotal = metrics['fs-cache-hit'] + metrics['fs-cache-miss'];
									const fsHitRatio = 100 * metrics['fs-cache-hit'] / fsCacheTotal;

									const inMemoryCacheTotal = metrics['in-memory-cache-hit'] + metrics['in-memory-cache-miss'];
									const inMemoryHitRatio = 100 * metrics['in-memory-cache-hit'] / inMemoryCacheTotal;

									// TODO: Add metrics for rollup time

									console.log(`
${chalk.bold.cyan('[Domain Expansion report]')}
  ${chalk.bold.green('FS hit ratio:')}         ${fsHitRatio.toFixed(2)}%
  ${chalk.bold.green('FS hit total:')}         ${humanFormat(metrics['fs-cache-hit'])}
  ${chalk.bold.green('FS miss total:')}        ${humanFormat(metrics['fs-cache-miss'])}
  ${chalk.bold.green('In-Memory hit ratio:')}  ${inMemoryHitRatio.toFixed(2)}%
  ${chalk.bold.green('In-Memory hit total:')}  ${humanFormat(metrics['in-memory-cache-hit'])}
  ${chalk.bold.green('In-Memory miss total:')} ${humanFormat(metrics['in-memory-cache-miss'])}

  ${chalk.bold.green('Stored data in FS:')}        ${humanFormat.bytes(metrics['stored-compressed-size'])}
  ${chalk.bold.green('Loaded data from FS:')}      ${humanFormat.bytes(metrics['loaded-compressed-size'])}
  ${chalk.bold.green('Stored data uncompressed:')} ${humanFormat.bytes(metrics['stored-data-size'])}
  ${chalk.bold.green('Loaded data uncompressed:')} ${humanFormat.bytes(metrics['loaded-data-size'])}
`);
								}
							}
						},
					})
				},
			},
		};
	},
});
