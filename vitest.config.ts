import { VitestReporter } from 'tdd-guard-vitest'
import { defineConfig } from 'vitest/config'

// biome-ignore lint/suspicious/noExplicitAny: vitest Reporter type not reliably exported
const reporters: any[] = ['default']
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
