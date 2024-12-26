import { defineTests } from '../common.ts';

await defineTests({
	fixtureName: 'starlight',
	prefix: 'starlight',
	integrationOptions: {
		cachePages: false,
		cacheComponents: 'persistent',
		componentsHaveSharedState: true,
	},
	coldMetrics: {
		'fs-cache-hit': 0,
		'fs-cache-miss': 98,
		'in-memory-cache-hit': 0,
		'in-memory-cache-miss': 196,
	},
	hotMetrics: {
		'fs-cache-hit': 8,
		'fs-cache-miss': 0,
		'in-memory-cache-hit': 0,
		'in-memory-cache-miss': 8,
	},
	changeFiles: [
		{
			changes: [
				{
					path: 'src/content/docs/index.md',
					updater: '---\ntitle: Sample page\n---\n\nupdated page',
				},
			],
			metricsAfter: {
				'fs-cache-hit': 16,
				'fs-cache-miss': 30,
				'in-memory-cache-hit': 2,
				'in-memory-cache-miss': 76,
			},
		},
	],
});
