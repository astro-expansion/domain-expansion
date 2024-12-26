import { defineTests } from '../common.ts';

await defineTests({
  fixtureName: 'basic',
  prefix: 'persistent-component',
  integrationOptions: {
    cachePages: true,
    cacheComponents: false,
  },
  coldMetrics: {
    'fs-cache-hit': 0,
    'fs-cache-miss': 7,
    'in-memory-cache-hit': 0,
    'in-memory-cache-miss': 14,
  },
  hotMetrics: {
    'fs-cache-hit': 14,
    'fs-cache-miss': 0,
    'in-memory-cache-hit': 0,
    'in-memory-cache-miss': 14,
  },
  changeFiles: [
    {
      changes: [{
        path: 'src/other.ts',
        updater: 'export const other = "updated transitive value";'
      }],
      metricsAfter: {
        'fs-cache-hit': 14,
        'fs-cache-miss': 0,
        'in-memory-cache-hit': 0,
        'in-memory-cache-miss': 14,
      },
    },
    {
      changes: [{
        path: 'src/Component.astro',
        updater: '<p>Updated component</p>\n<slot />'
      }],
      metricsAfter: {
        'fs-cache-hit': 14,
        'fs-cache-miss': 0,
        'in-memory-cache-hit': 0,
        'in-memory-cache-miss': 14,
      },
    },
    {
      changes: [{
        path: 'src/module.ts',
        updater: 'export const value = "updated direct value";'
      }],
      metricsAfter: {
        'fs-cache-hit': 12,
        'fs-cache-miss': 1,
        'in-memory-cache-hit': 0,
        'in-memory-cache-miss': 14,
      },
    },
  ],
});
