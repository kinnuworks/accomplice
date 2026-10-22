import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One worker: Z3 runs its own threads, and the bulk test prints timing we want to be honest.
    pool: 'forks',
    fileParallelism: false,
  },
});
