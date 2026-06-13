import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let mockGraphql: ReturnType<typeof vi.fn>
let mockOutput: ReturnType<typeof vi.fn>
let mockOutputError: ReturnType<typeof vi.fn>
let mockLoadConfig: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockOutput = vi.fn()
  mockOutputError = vi.fn()
  mockLoadConfig = vi.fn(() => ({
    mode: 'remote',
    apiUrl: 'https://flowy-ai.fly.dev/graphql',
    apiKey: 'flowy_secret_abcdef0123456789',
    client: { name: '' },
    projects: {},
  }))
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

  vi.doMock('../util/config.ts', async () => {
    const actual =
      await vi.importActual<typeof import('../util/config.ts')>(
        '../util/config.ts',
      )
    return {
      loadConfig: mockLoadConfig,
      fingerprintKey: actual.fingerprintKey,
      requireRemoteMode: (commandName: string) => {
        const cfg = (mockLoadConfig as unknown as () => { mode: string })()
        if (cfg.mode === 'local') {
          const err = new Error(
            `"flowy ${commandName}" is only available in remote mode. The active mode is local mode.`,
          ) as Error & { code?: string }
          err.code = 'LOCAL_MODE'
          throw err
        }
      },
    }
  })
})

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('whoami command', () => {
  test('whoami outputs user data plus a non-reversible key fingerprint', async () => {
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

    const outputArg = mockOutput.mock.calls[0]![0]
    expect(outputArg).toEqual(
      expect.objectContaining({
        ...userData,
        keyFingerprint: expect.stringMatching(/sha256:[0-9a-f]{12}/),
      }),
    )
    // Fingerprint must not leak the configured secret.
    expect(JSON.stringify(outputArg)).not.toContain(
      'flowy_secret_abcdef0123456789',
    )
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

  test('whoami errors cleanly in local mode without hitting the server', async () => {
    mockLoadConfig.mockReturnValue({
      mode: 'local',
      apiUrl: 'http://localhost:4000/graphql',
      apiKey: '',
      client: { name: '' },
      projects: {},
    })

    const { whoamiCommand } = await import('./whoami.ts')
    await whoamiCommand.parseAsync([], { from: 'user' })

    // No GraphQL call against the local server.
    expect(mockGraphql).not.toHaveBeenCalled()
    expect(mockOutput).not.toHaveBeenCalled()
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/local mode/i),
        code: 'LOCAL_MODE',
      }),
    )
  })
})
