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

  test('pins the bundled package install to an explicit semver, never floating', () => {
    // The compose file must pin an explicit version and never reference an
    // unpinned `@sqaoss/flowy`. We deliberately do NOT couple this to
    // package.json's version: semantic-release bumps package.json on every
    // release but never edits this static file, so coupling here would break
    // the release pipeline on every bump. The load-bearing exact-version pin
    // guarantee lives in setup.ts's pinnedInstallSpec(), which reads
    // package.json at runtime.
    expect(compose).toMatch(/bun add @sqaoss\/flowy@\d+\.\d+\.\d+/)
    expect(compose).not.toMatch(/bun add @sqaoss\/flowy(?!@)/)
  })
})
