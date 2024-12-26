import { defineTests } from '../common.ts';

await defineTests({
	fixtureName: 'basic',
	prefix: 'persistent-component',
	integrationOptions: {
		cachePages: false,
		cacheComponents: 'persistent',
	},
	coldMetrics: {
		'fs-cache-hit': 0,
		'fs-cache-miss': 2,
		'in-memory-cache-hit': 4,
		'in-memory-cache-miss': 4,
	},
	hotMetrics: {
		'fs-cache-hit': 4,
		'fs-cache-miss': 0,
		'in-memory-cache-hit': 4,
		'in-memory-cache-miss': 4,
	},
	changeFiles: [
		{
			changes: [
				{
					path: 'src/other.ts',
					updater: 'export const other = "updated transitive value";',
				},
			],
			metricsAfter: {
				'fs-cache-hit': 4,
				'fs-cache-miss': 0,
				'in-memory-cache-hit': 4,
				'in-memory-cache-miss': 4,
			},
		},
		{
			changes: [
				{
					path: 'src/Component.astro',
					updater: '<p>Updated component</p>\n<slot />',
				},
			],
			metricsAfter: {
				'fs-cache-hit': 0,
				'fs-cache-miss': 2,
				'in-memory-cache-hit': 4,
				'in-memory-cache-miss': 4,
			},
		},
		{
			changes: [
				{
					path: 'src/module.ts',
					updater: 'export const value = "updated direct value";',
				},
			],
			metricsAfter: {
				'fs-cache-hit': 4,
				'fs-cache-miss': 0,
				'in-memory-cache-hit': 4,
				'in-memory-cache-miss': 4,
			},
		},
	],
});
