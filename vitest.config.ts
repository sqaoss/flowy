import { VitestReporter } from 'tdd-guard-vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    exclude: ['server/**', 'node_modules/**'],
    reporters: [
      'default',
      new VitestReporter('/Users/separatio/Documents/flowy'),
    ],
  },
})
