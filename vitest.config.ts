import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    // `test/e2e/**` is the slow, real-process CLI suite — run it via its own
    // config (`bun run test:e2e`), never as part of the fast mocked unit suite.
    exclude: ['server/**', 'test/e2e/**', 'node_modules/**', '.worktrees/**'],
    reporters: ['default'],
  },
})
