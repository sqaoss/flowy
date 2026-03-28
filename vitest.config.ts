import { VitestReporter } from 'tdd-guard-vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    reporters: [
      'default',
      new VitestReporter('/Users/separatio/Documents/flowy'),
    ],
  },
})
