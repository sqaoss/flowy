import { afterEach, describe, expect, test, vi } from 'vitest'
import { outputError } from './format.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('outputError', () => {
  test('includes code in JSON when error has a code property', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    const err = Object.assign(
      new Error('Search query must be at least 3 characters'),
      { code: 'VALIDATION_ERROR' },
    )
    outputError(err)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const printed = JSON.parse(errorSpy.mock.calls[0]![0] as string)
    expect(printed).toEqual({
      error: 'Search query must be at least 3 characters',
      code: 'VALIDATION_ERROR',
    })
  })

  test('omits code when error has no code property', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    outputError(new Error('plain failure'))

    const printed = JSON.parse(errorSpy.mock.calls[0]![0] as string)
    expect(printed).toEqual({ error: 'plain failure' })
    expect(printed).not.toHaveProperty('code')
  })

  test('exits with non-zero status', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never)

    outputError(new Error('boom'))

    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
