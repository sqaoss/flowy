import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let mockGraphql: ReturnType<typeof vi.fn>
let mockOutput: ReturnType<typeof vi.fn>
let mockOutputError: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockOutput = vi.fn()
  mockOutputError = vi.fn()
  mockGraphql = vi.fn().mockResolvedValue({
    whoami: {
      id: 'user_1',
      email: 'test@example.com',
      tier: 'free',
      createdAt: '2026-01-01',
      graceEndsAt: null,
    },
  })

  vi.doMock('../util/format.ts', () => ({
    output: mockOutput,
    outputError: mockOutputError,
  }))

  vi.doMock('../util/client.ts', () => ({
    graphql: mockGraphql,
  }))
})

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('whoami command', () => {
  test('whoami outputs user data from query', async () => {
    const userData = {
      id: '1',
      email: 'a@b.com',
      tier: 'explorer',
      createdAt: '2026-01-01',
      graceEndsAt: null,
    }
    mockGraphql.mockResolvedValue({ whoami: userData })

    const { whoamiCommand } = await import('./whoami.ts')
    await whoamiCommand.parseAsync([], { from: 'user' })

    expect(mockOutput).toHaveBeenCalledWith(userData)
  })

  test('whoami outputs error when query fails', async () => {
    mockGraphql.mockRejectedValue(new Error('Auth required'))

    const { whoamiCommand } = await import('./whoami.ts')
    await whoamiCommand.parseAsync([], { from: 'user' })

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Auth required',
      }),
    )
    expect(mockOutput).not.toHaveBeenCalled()
  })

  test('whoami queries graceEndsAt field', async () => {
    const { whoamiCommand } = await import('./whoami.ts')
    await whoamiCommand.parseAsync([], { from: 'user' })

    expect(mockGraphql).toHaveBeenCalledOnce()
    const query = mockGraphql.mock.calls[0]?.[0] as string
    expect(query).toContain('graceEndsAt')
  })
})
