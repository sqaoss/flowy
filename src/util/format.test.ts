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

  test('exits 1 for VALIDATION_ERROR (usage/validation class)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never)

    outputError(
      Object.assign(new Error('bad input'), { code: 'VALIDATION_ERROR' }),
    )

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  test('exits 1 for CONFLICT (usage/validation class)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never)

    outputError(Object.assign(new Error('conflict'), { code: 'CONFLICT' }))

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  test('exits 2 for NOT_FOUND', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never)

    outputError(
      Object.assign(new Error('Node bad-id not found'), { code: 'NOT_FOUND' }),
    )

    expect(exitSpy).toHaveBeenCalledWith(2)
  })

  test('exits 3 for SERVER_ERROR', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never)

    outputError(
      Object.assign(new Error('Server returned HTTP 502'), {
        code: 'SERVER_ERROR',
      }),
    )

    expect(exitSpy).toHaveBeenCalledWith(3)
  })

  test('exits 4 for NETWORK_ERROR', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never)

    outputError(
      Object.assign(new Error('Request timed out'), { code: 'NETWORK_ERROR' }),
    )

    expect(exitSpy).toHaveBeenCalledWith(4)
  })
})
