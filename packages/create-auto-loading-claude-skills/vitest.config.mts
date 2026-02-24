import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
    // default pool (threads) works best for tests that spawn subprocesses
    // do NOT use pool: 'forks' - it causes 4x slowdown
    testTimeout: 60000, // reasonable timeout for subprocess tests
  },
});
