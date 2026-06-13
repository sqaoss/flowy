import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

function ok(json: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(JSON.stringify(json)),
  }
}

function httpError(status: number, body = '<html>error</html>') {
  return {
    ok: false,
    status,
    headers: { get: () => 'text/html' },
    json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    text: () => Promise.resolve(body),
  }
}

beforeEach(() => {
  vi.doMock('./config.ts', () => ({
    getConfig: () => ({
      apiUrl: 'http://test/graphql',
      apiKey: 'test-key',
    }),
  }))
})

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('graphql client', () => {
  test('returns data on successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ok({ data: { whoami: { id: '1' } } })),
    )

    const { graphql } = await import('./client.ts')
    const result = await graphql('query { whoami { id } }')
    expect(result).toEqual({ whoami: { id: '1' } })
  })

  test('attaches extensions.code to the thrown error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        ok({
          errors: [
            {
              message: 'Search query must be at least 3 characters',
              extensions: { code: 'VALIDATION_ERROR' },
            },
          ],
        }),
      ),
    )

    const { graphql } = await import('./client.ts')
    await expect(
      graphql('query { search(query: "ab") { id } }'),
    ).rejects.toMatchObject({
      message: 'Search query must be at least 3 characters',
      code: 'VALIDATION_ERROR',
    })
  })

  test('throws original server message for unknown error codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        ok({
          errors: [
            {
              message: 'Something broke',
              extensions: { code: 'UNKNOWN_CODE' },
            },
          ],
        }),
      ),
    )

    const { graphql } = await import('./client.ts')
    await expect(graphql('query { whoami { id } }')).rejects.toThrow(
      'Something broke',
    )
  })

  test('throws error message when extensions are absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ok({ errors: [{ message: 'Auth required' }] })),
    )

    const { graphql } = await import('./client.ts')
    await expect(graphql('query { whoami { id } }')).rejects.toThrow(
      'Auth required',
    )
  })

  test('omits Authorization header when no apiKey configured', async () => {
    vi.doMock('./config.ts', () => ({
      getConfig: () => ({ apiUrl: 'http://test/graphql', apiKey: '' }),
    }))

    const mockFetch = vi
      .fn()
      .mockResolvedValue(ok({ data: { whoami: { id: '1' } } }))
    vi.stubGlobal('fetch', mockFetch)

    const { graphql } = await import('./client.ts')
    await graphql('query { whoami { id } }')

    const callHeaders = mockFetch.mock.calls[0]![1].headers
    expect(callHeaders).not.toHaveProperty('Authorization')
  })

  test('throws a NETWORK_ERROR-coded error on fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))

    const { graphql } = await import('./client.ts')
    await expect(
      graphql('query { whoami { id } }', undefined, { retryDelayMs: 0 }),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })

  test('throws friendly message for SUBSCRIPTION_REQUIRED error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        ok({
          errors: [
            {
              message: 'Active subscription required.',
              extensions: { code: 'SUBSCRIPTION_REQUIRED' },
            },
          ],
        }),
      ),
    )

    const { graphql } = await import('./client.ts')
    await expect(graphql('query { whoami { id } }')).rejects.toThrow(
      /flowy billing checkout/,
    )
  })

  test('throws friendly message for SUBSCRIPTION_EXPIRED error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        ok({
          errors: [
            {
              message: 'Subscription has expired.',
              extensions: { code: 'SUBSCRIPTION_EXPIRED' },
            },
          ],
        }),
      ),
    )

    const { graphql } = await import('./client.ts')
    await expect(graphql('query { whoami { id } }')).rejects.toThrow(
      /flowy billing checkout/,
    )
  })

  test('throws friendly message for SUBSCRIPTION_SUSPENDED error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        ok({
          errors: [
            {
              message: 'Subscription is suspended.',
              extensions: { code: 'SUBSCRIPTION_SUSPENDED' },
            },
          ],
        }),
      ),
    )

    const { graphql } = await import('./client.ts')
    await expect(graphql('query { whoami { id } }')).rejects.toThrow(
      /suspended.*contact support/,
    )
  })

  describe('transport hardening (F11)', () => {
    test('throws a SERVER_ERROR-coded error on a non-retryable non-2xx (e.g. 500) without crashing on HTML body', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(httpError(500)))

      const { graphql } = await import('./client.ts')
      await expect(
        graphql('query { whoami { id } }', undefined, { retryDelayMs: 0 }),
      ).rejects.toMatchObject({ code: 'SERVER_ERROR' })
      // Must surface a real message, not a raw SyntaxError about "<"
      await expect(
        graphql('query { whoami { id } }', undefined, { retryDelayMs: 0 }),
      ).rejects.toThrow(/500/)
    })

    test('throws SERVER_ERROR (no crash) when a 200 body is not JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: { get: () => 'text/html' },
          json: () => Promise.reject(new SyntaxError('Unexpected token <')),
          text: () => Promise.resolve('<html>proxy</html>'),
        }),
      )

      const { graphql } = await import('./client.ts')
      await expect(graphql('query { whoami { id } }')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
      })
    })

    test('retries on a transient 429 then succeeds', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(httpError(429))
        .mockResolvedValueOnce(ok({ data: { whoami: { id: '1' } } }))
      vi.stubGlobal('fetch', mockFetch)

      const { graphql } = await import('./client.ts')
      const result = await graphql('query { whoami { id } }', undefined, {
        retryDelayMs: 0,
      })
      expect(result).toEqual({ whoami: { id: '1' } })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    test('retries on 503 then gives up with a SERVER_ERROR-coded error', async () => {
      const mockFetch = vi.fn().mockResolvedValue(httpError(503))
      vi.stubGlobal('fetch', mockFetch)

      const { graphql } = await import('./client.ts')
      await expect(
        graphql('query { whoami { id } }', undefined, {
          retries: 2,
          retryDelayMs: 0,
        }),
      ).rejects.toMatchObject({ code: 'SERVER_ERROR' })
      // initial attempt + 2 retries = 3 calls
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    test('does NOT retry on a non-transient 400', async () => {
      const mockFetch = vi.fn().mockResolvedValue(httpError(400))
      vi.stubGlobal('fetch', mockFetch)

      const { graphql } = await import('./client.ts')
      await expect(
        graphql('query { whoami { id } }', undefined, { retryDelayMs: 0 }),
      ).rejects.toMatchObject({ code: 'SERVER_ERROR' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('aborts and throws NETWORK_ERROR on timeout', async () => {
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          const signal = (init as { signal?: AbortSignal }).signal
          signal?.addEventListener('abort', () => {
            reject(
              Object.assign(new Error('The operation was aborted'), {
                name: 'AbortError',
              }),
            )
          })
        })
      })
      vi.stubGlobal('fetch', mockFetch)

      const { graphql } = await import('./client.ts')
      await expect(
        graphql('query { whoami { id } }', undefined, {
          timeoutMs: 10,
          retries: 0,
          retryDelayMs: 0,
        }),
      ).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    })

    test('passes a timeout signal to fetch', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(ok({ data: { whoami: { id: '1' } } }))
      vi.stubGlobal('fetch', mockFetch)

      const { graphql } = await import('./client.ts')
      await graphql('query { whoami { id } }')

      const init = mockFetch.mock.calls[0]![1]
      expect(init.signal).toBeInstanceOf(AbortSignal)
    })
  })
})
