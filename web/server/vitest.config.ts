import { defineConfig } from 'vitest/config';

// The engine kernel boots the full PoB2 engine (loads ModCache, tree data, etc.),
// which takes a couple of seconds — give integration tests generous budgets.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    fileParallelism: false,
  },
});
