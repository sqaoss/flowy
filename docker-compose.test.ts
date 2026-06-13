import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const compose = readFileSync(
  new URL('./docker-compose.yml', import.meta.url).pathname,
  'utf-8',
)

describe('docker-compose.yml', () => {
  test('publishes the server port on loopback only, not all interfaces', () => {
    expect(compose).toContain('127.0.0.1:4000:4000')
    expect(compose).not.toMatch(/^\s*-\s*"4000:4000"\s*$/m)
  })

  test('pins the bundled package install to the current CLI version', () => {
    const pkg = JSON.parse(
      readFileSync(
        new URL('./package.json', import.meta.url).pathname,
        'utf-8',
      ),
    ) as { version: string }

    expect(compose).toContain(`bun add @sqaoss/flowy@${pkg.version}`)
    expect(compose).not.toMatch(/bun add @sqaoss\/flowy(?!@)/)
  })
})
