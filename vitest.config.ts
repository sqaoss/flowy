import { VitestReporter } from 'tdd-guard-vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: [
      'default',
      new VitestReporter('/Users/separatio/Documents/flowy'),
    ],
  },
})
