import { defineConfig } from 'vitest/config'

/**
 * Dedicated config for the CLI end-to-end smoke suite (P1-6 / F18).
 *
 * Kept separate from the root `vitest.config.ts` because these tests spawn the
 * real server + CLI as child processes (slow, side-effecting) and must NOT run
 * as part of the fast, mocked-transport unit suite. Invoke via
 * `bun run test:e2e`.
 */
export default defineConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    exclude: ['server/**', 'node_modules/**', '.worktrees/**'],
    // Each test spawns subprocesses; serialize files and allow generous time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default'],
  },
})
