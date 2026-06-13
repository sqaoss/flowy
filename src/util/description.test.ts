import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test, vi } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('resolveDescription', () => {
  const TEST_FILE = resolve(__dirname, '../../.test-desc.md')

  afterEach(() => {
    try {
      rmSync(TEST_FILE)
    } catch {}
    vi.restoreAllMocks()
  })

  test('returns --description verbatim, never as a file path', async () => {
    // A literal value that also happens to be an existing path must NOT be read.
    writeFileSync(TEST_FILE, '# File body\nshould not be used')
    expect(existsSync(TEST_FILE)).toBe(true)

    const { resolveDescription } = await import('./description.ts')
    const result = await resolveDescription({ description: TEST_FILE })
    expect(result).toBe(TEST_FILE)
  })

  test('returns the literal string identically regardless of CWD collisions', async () => {
    const { resolveDescription } = await import('./description.ts')
    const result = await resolveDescription({
      description: 'Just a plain description',
    })
    expect(result).toBe('Just a plain description')
  })

  test('reads file contents when --description-file is given', async () => {
    writeFileSync(TEST_FILE, '# Test\nSome content')
    const { resolveDescription } = await import('./description.ts')
    const result = await resolveDescription({ descriptionFile: TEST_FILE })
    expect(result).toBe('# Test\nSome content')
  })

  test('reads stdin when --description-file is "-"', async () => {
    const { resolveDescription } = await import('./description.ts')
    const fakeStdin = (async function* () {
      yield Buffer.from('piped ')
      yield Buffer.from('description')
    })()
    const result = await resolveDescription(
      { descriptionFile: '-' },
      // biome-ignore lint/suspicious/noExplicitAny: test stub for stdin
      fakeStdin as any,
    )
    expect(result).toBe('piped description')
  })

  test('errors when --description-file points at a missing file', async () => {
    const { resolveDescription } = await import('./description.ts')
    await expect(
      resolveDescription({ descriptionFile: resolve(__dirname, '../../nope') }),
    ).rejects.toThrow(/not found|no such file|ENOENT/i)
  })

  test('errors when both --description and --description-file are given', async () => {
    writeFileSync(TEST_FILE, 'body')
    const { resolveDescription } = await import('./description.ts')
    await expect(
      resolveDescription({
        description: 'literal',
        descriptionFile: TEST_FILE,
      }),
    ).rejects.toThrow(/both|either|only one/i)
  })

  test('errors when neither --description nor --description-file is given', async () => {
    const { resolveDescription } = await import('./description.ts')
    await expect(resolveDescription({})).rejects.toThrow(
      /--description|description-file|required/i,
    )
  })
})
