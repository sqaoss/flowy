import { VitestReporter } from 'tdd-guard-vitest'
import { defineConfig } from 'vitest/config'

const reporters: import('vitest').Reporter[] = ['default']
if (!process.env.CI) {
  reporters.push(new VitestReporter(import.meta.dirname))
}

export default defineConfig({
  test: {
    fileParallelism: false,
    exclude: ['server/**', 'node_modules/**'],
    reporters,
  },
})
