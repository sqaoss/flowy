import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let mockLoadConfig: ReturnType<typeof vi.fn>
let mockSaveConfig: ReturnType<typeof vi.fn>
let mockOutput: ReturnType<typeof vi.fn>
let mockOutputError: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockLoadConfig = vi.fn(() => ({
    mode: 'saas',
    apiUrl: 'https://flowy-ai.fly.dev/graphql',
    apiKey: 'old-key',
    client: { name: '' },
    projects: {},
  }))
  mockSaveConfig = vi.fn()
  mockOutput = vi.fn()
  mockOutputError = vi.fn()

  vi.doMock('../util/config.ts', async () => {
    const actual =
      await vi.importActual<typeof import('../util/config.ts')>(
        '../util/config.ts',
      )
    return {
      loadConfig: mockLoadConfig,
      saveConfig: mockSaveConfig,
      fingerprintKey: actual.fingerprintKey,
    }
  })

  vi.doMock('../util/format.ts', () => ({
    output: mockOutput,
    outputError: mockOutputError,
  }))
})

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('key command', () => {
  test('exports a command named "key"', async () => {
    const { keyCommand } = await import('./key.ts')
    expect(keyCommand.name()).toBe('key')
  })

  test('has rotate subcommand', async () => {
    const { keyCommand } = await import('./key.ts')
    const subcommandNames = keyCommand.commands.map((c) => c.name())
    expect(subcommandNames).toContain('rotate')
    expect(keyCommand.commands).toHaveLength(1)
  })

  test('rotate calls rotateApiKey mutation, saves new key to config, and outputs a fingerprint (not the secret)', async () => {
    const mockGraphql = vi.fn().mockResolvedValue({
      rotateApiKey: {
        user: {
          id: 'user_1',
          email: 'test@example.com',
          tier: 'free',
          createdAt: '2025-01-01T00:00:00Z',
          graceEndsAt: null,
        },
        apiKey: 'flowy_new_key_456',
      },
    })
    vi.doMock('../util/client.ts', () => ({
      graphql: mockGraphql,
    }))

    const { keyCommand } = await import('./key.ts')
    await keyCommand.parseAsync(['rotate'], { from: 'user' })

    expect(mockGraphql).toHaveBeenCalledWith(
      expect.stringContaining('rotateApiKey'),
    )
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'flowy_new_key_456',
      }),
    )

    // Default output must NOT leak the full secret.
    const outputArg = mockOutput.mock.calls[0]![0]
    expect(JSON.stringify(outputArg)).not.toContain('flowy_new_key_456')
    expect(outputArg).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ email: 'test@example.com' }),
        keyFingerprint: expect.stringMatching(/sha256:[0-9a-f]{12}/),
      }),
    )
    expect(outputArg).not.toHaveProperty('apiKey')
  })

  test('rotate --show-key reveals the full secret', async () => {
    const mockGraphql = vi.fn().mockResolvedValue({
      rotateApiKey: {
        user: {
          id: 'user_1',
          email: 'test@example.com',
          tier: 'free',
          createdAt: '2025-01-01T00:00:00Z',
          graceEndsAt: null,
        },
        apiKey: 'flowy_new_key_456',
      },
    })
    vi.doMock('../util/client.ts', () => ({
      graphql: mockGraphql,
    }))

    const { keyCommand } = await import('./key.ts')
    await keyCommand.parseAsync(['rotate', '--show-key'], { from: 'user' })

    const outputArg = mockOutput.mock.calls[0]![0]
    expect(outputArg).toEqual(
      expect.objectContaining({ apiKey: 'flowy_new_key_456' }),
    )
  })

  test('rotate saves the exact new apiKey to config', async () => {
    const newKey = 'flowy_rotated_key_789'
    const mockGraphql = vi.fn().mockResolvedValue({
      rotateApiKey: {
        user: {
          id: 'user_1',
          email: 'dev@example.com',
          tier: 'pro',
          createdAt: '2025-06-01T00:00:00Z',
          graceEndsAt: null,
        },
        apiKey: newKey,
      },
    })
    vi.doMock('../util/client.ts', () => ({
      graphql: mockGraphql,
    }))

    const { keyCommand } = await import('./key.ts')
    await keyCommand.parseAsync(['rotate'], { from: 'user' })

    expect(mockSaveConfig).toHaveBeenCalledOnce()
    const savedConfig = mockSaveConfig.mock.calls[0]![0]
    expect(savedConfig.apiKey).toBe(newKey)
    expect(savedConfig.apiKey).not.toBe('old-key')
  })

  test('rotate outputs error when mutation fails', async () => {
    const mockGraphql = vi.fn().mockRejectedValue(new Error('Unauthorized'))
    vi.doMock('../util/client.ts', () => ({
      graphql: mockGraphql,
    }))

    const { keyCommand } = await import('./key.ts')
    await keyCommand.parseAsync(['rotate'], { from: 'user' })

    expect(mockOutputError).toHaveBeenCalledWith(expect.any(Error))
    expect(mockSaveConfig).not.toHaveBeenCalled()
    expect(mockOutput).not.toHaveBeenCalled()
  })
})
