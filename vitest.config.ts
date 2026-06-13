import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    exclude: ['server/**', 'node_modules/**', '.worktrees/**'],
    reporters: ['default'],
  },
})
