import { rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('resolveDescription', () => {
  const TEST_FILE = resolve(__dirname, '../../.test-desc.md')

  afterEach(() => {
    try {
      rmSync(TEST_FILE)
    } catch {}
  })

  test('returns file content when path exists', async () => {
    writeFileSync(TEST_FILE, '# Test\nSome content')
    const { resolveDescription } = await import('./description.ts')
    const result = await resolveDescription(TEST_FILE)
    expect(result).toBe('# Test\nSome content')
  })

  test('returns value as-is when path does not exist', async () => {
    const { resolveDescription } = await import('./description.ts')
    const result = await resolveDescription('Just a plain description')
    expect(result).toBe('Just a plain description')
  })
})
