import { addIntegration, defineIntegration } from "astro-integration-kit";
import { interceptorPlugin } from "./interceptor.js";
import { collectMetrics } from "./metrics.js";
import chalk from "chalk";
import humanFormat from "human-format";

export const integration = defineIntegration({
	name: "@domain-expansion/astro",
	setup() {
		const routeEntrypoints: string[] = [];

		return {
			hooks: {
				'astro:config:setup': (params) => {
					if (params.command !== 'build') return;

					addIntegration(params, {
						ensureUnique: true,
						integration: {
							name: '@domain-expansion/astro:reporting',
							hooks: {
								'astro:build:done': () => {
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
				'astro:build:setup': ({ updateConfig, target }) => {
					if (target === 'server') {
						updateConfig({
							plugins: [interceptorPlugin(routeEntrypoints)],
						});
					}
				},
				'astro:routes:resolved': (params) => {
					routeEntrypoints.push(...params.routes.map(route => route.entrypoint));
				},
			},
		};
	},
});
