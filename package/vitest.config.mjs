import { defineConfig } from 'vite';

process.env.NODE_OPTIONS ??= '--enable-source-maps';
process.setSourceMapsEnabled(true);

export default defineConfig({
  keepProcessEnv: true,
  test: {
    setupFiles: ['./tests/vitest.setup.ts'],
    maxConcurrency: 1,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 15000,
    // hookTimeout: 30000,
    // pool: 'forks',
    // poolOptions: {
    //   forks: {
    //     isolate: true
    //   }
    // },
    coverage: {
      provider: 'v8',
    },
  },
});
