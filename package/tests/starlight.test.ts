import { defineTests } from './common.ts';

await defineTests({
  fixtureName: 'starlight',
  prefix: 'starlight',
  coldMetrics: {
    'fs-cache-hit': 0,
    'fs-cache-miss': 4,
    'in-memory-cache-hit': 0,
    'in-memory-cache-miss': 8,
  },
  hotMetrics: {
    'fs-cache-hit': 8,
    'fs-cache-miss': 0,
    'in-memory-cache-hit': 0,
    'in-memory-cache-miss': 8,
  },
});
