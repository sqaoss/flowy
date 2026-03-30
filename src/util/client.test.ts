import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

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
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            data: { whoami: { id: '1' } },
          }),
      }),
    )

    const { graphql } = await import('./client.ts')
    const result = await graphql('query { whoami { id } }')
    expect(result).toEqual({ whoami: { id: '1' } })
  })

  test('throws original server message for unknown error codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            errors: [
              {
                message: 'Something broke',
                extensions: { code: 'UNKNOWN_CODE' },
              },
            ],
          }),
      }),
    )

    const { graphql } = await import('./client.ts')
    await expect(graphql('query { whoami { id } }')).rejects.toThrow(
      'Something broke',
    )
  })

  test('throws error message when extensions are absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            errors: [{ message: 'Auth required' }],
          }),
      }),
    )

    const { graphql } = await import('./client.ts')
    await expect(graphql('query { whoami { id } }')).rejects.toThrow(
      'Auth required',
    )
  })

  test('omits Authorization header when no apiKey configured', async () => {
    vi.doMock('./config.ts', () => ({
      getConfig: () => ({
        apiUrl: 'http://test/graphql',
        apiKey: '',
      }),
    }))

    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: { whoami: { id: '1' } },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { graphql } = await import('./client.ts')
    await graphql('query { whoami { id } }')

    const callHeaders = mockFetch.mock.calls[0]![1].headers
    expect(callHeaders).not.toHaveProperty('Authorization')
  })

  test('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))

    const { graphql } = await import('./client.ts')
    await expect(graphql('query { whoami { id } }')).rejects.toThrow(
      'fetch failed',
    )
  })

  test('throws friendly message for SUBSCRIPTION_REQUIRED error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            errors: [
              {
                message: 'Active subscription required.',
                extensions: { code: 'SUBSCRIPTION_REQUIRED' },
              },
            ],
          }),
      }),
    )

    const { graphql } = await import('./client.ts')
    await expect(graphql('query { whoami { id } }')).rejects.toThrow(
      /flowy billing checkout/,
    )
  })

  test('throws friendly message for SUBSCRIPTION_EXPIRED error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            errors: [
              {
                message: 'Subscription has expired.',
                extensions: { code: 'SUBSCRIPTION_EXPIRED' },
              },
            ],
          }),
      }),
    )

    const { graphql } = await import('./client.ts')
    await expect(graphql('query { whoami { id } }')).rejects.toThrow(
      /flowy billing checkout/,
    )
  })

  test('throws friendly message for SUBSCRIPTION_SUSPENDED error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            errors: [
              {
                message: 'Subscription is suspended.',
                extensions: { code: 'SUBSCRIPTION_SUSPENDED' },
              },
            ],
          }),
      }),
    )

    const { graphql } = await import('./client.ts')
    await expect(graphql('query { whoami { id } }')).rejects.toThrow(
      /suspended.*contact support/,
    )
  })
})
