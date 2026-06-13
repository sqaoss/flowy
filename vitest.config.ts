import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    // `test/e2e/**` is the slow, real-process CLI suite — run it via its own
    // config (`bun run test:e2e`), never as part of the fast mocked unit suite.
    exclude: ['server/**', 'test/e2e/**', 'node_modules/**', '.worktrees/**'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      // Cover the CLI source only. `include` already scopes to `src/**`, so the
      // server (its own suite), the e2e harness (boots a real process, not
      // unit-coverable) and `.worktrees` siblings are out of scope by
      // construction. We only need to drop the colocated test files.
      //
      // NOTE: vitest matches `exclude` against the *absolute* path with
      // picomatch `contains: true`, so a pattern like `.worktrees/**` would
      // wrongly match every file in this worktree (whose path contains
      // `.worktrees/`). Keep excludes anchored to the `src/` tree.
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      // Ratchet, not a wall. Set a few points below the measured baseline
      // (stmts 80.8 / branch 76.8 / funcs 82.1 / lines 81.1 on 2026-06-13) so
      // a regression that drops coverage fails CI, but normal churn doesn't.
      // Raise these as coverage climbs; never set them above current.
      thresholds: {
        statements: 78,
        branches: 74,
        functions: 80,
        lines: 78,
      },
    },
  },
})
