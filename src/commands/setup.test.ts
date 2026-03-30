import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let mockLoadConfig: ReturnType<typeof vi.fn>
let mockSaveConfig: ReturnType<typeof vi.fn>
let mockOutput: ReturnType<typeof vi.fn>
let mockOutputError: ReturnType<typeof vi.fn>
let mockSpawnSync: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockLoadConfig = vi.fn(() => ({
    mode: 'saas',
    apiUrl: 'https://flowy-ai.fly.dev/graphql',
    apiKey: '',
    client: { name: '' },
    projects: {},
  }))
  mockSaveConfig = vi.fn()
  mockOutput = vi.fn()
  mockOutputError = vi.fn()
  mockSpawnSync = vi.fn()

  vi.doMock('../util/config.ts', () => ({
    loadConfig: mockLoadConfig,
    saveConfig: mockSaveConfig,
  }))

  vi.doMock('../util/format.ts', () => ({
    output: mockOutput,
    outputError: mockOutputError,
  }))

  vi.doMock('node:child_process', () => ({
    spawnSync: mockSpawnSync,
  }))
})

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('setup command', () => {
  test('exports a command named "setup"', async () => {
    const { setupCommand } = await import('./setup.ts')
    expect(setupCommand.name()).toBe('setup')
  })

  test('has local and remote subcommands', async () => {
    const { setupCommand } = await import('./setup.ts')
    const subcommandNames = setupCommand.commands.map((c) => c.name())
    expect(subcommandNames).toContain('local')
    expect(subcommandNames).toContain('remote')
    expect(setupCommand.commands).toHaveLength(2)
  })

  test('setup local checks for docker and errors if not found', async () => {
    mockSpawnSync.mockReturnValue({ status: 1 })

    const { setupCommand } = await import('./setup.ts')
    await setupCommand.parseAsync(['local'], { from: 'user' })

    expect(mockSpawnSync).toHaveBeenCalledWith('docker', ['--version'], {
      stdio: 'ignore',
    })
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Docker is required'),
      }),
    )
  })

  test('setup local saves config with mode "local" and apiUrl on success', async () => {
    mockSpawnSync.mockReturnValue({ status: 0 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
      return { ...actual, existsSync: () => true }
    })

    const { setupCommand } = await import('./setup.ts')
    await setupCommand.parseAsync(['local'], { from: 'user' })

    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'local',
        apiUrl: 'http://localhost:4000/graphql',
      }),
    )
  })

  test('setup remote requires --email', async () => {
    const { setupCommand } = await import('./setup.ts')
    await setupCommand.parseAsync(['remote'], { from: 'user' })

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('--email is required'),
      }),
    )
  })

  test('setup remote requires --tier', async () => {
    const { setupCommand } = await import('./setup.ts')
    await setupCommand.parseAsync(['remote', '--email', 'test@example.com'], {
      from: 'user',
    })

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('--tier is required'),
      }),
    )
  })

  test('setup remote outputs error when registration fails', async () => {
    const mockGraphql = vi
      .fn()
      .mockRejectedValue(new Error('Registration is temporarily closed.'))
    vi.doMock('../util/client.ts', () => ({
      graphql: mockGraphql,
    }))

    const { setupCommand } = await import('./setup.ts')
    await setupCommand.parseAsync(
      ['remote', '--email', 'test@example.com', '--tier', 'explorer'],
      { from: 'user' },
    )

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Registration is temporarily closed.',
      }),
    )
    expect(mockSaveConfig).toHaveBeenCalledTimes(1)
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'remote',
        apiUrl: 'https://flowy-ai.fly.dev/graphql',
      }),
    )
  })

  test('setup remote sends correct email and tier in mutation', async () => {
    const mockGraphql = vi.fn().mockResolvedValue({
      register: {
        user: {
          id: 'user_1',
          email: 'a@b.com',
          tier: 'pro',
          createdAt: '2026-01-01T00:00:00Z',
          graceEndsAt: null,
        },
        apiKey: 'flowy_key',
        checkoutUrl: null,
      },
    })
    vi.doMock('../util/client.ts', () => ({
      graphql: mockGraphql,
    }))
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: Buffer.from(''),
    })

    const { setupCommand } = await import('./setup.ts')
    await setupCommand.parseAsync(
      ['remote', '--email', 'a@b.com', '--tier', 'pro'],
      { from: 'user' },
    )

    expect(mockGraphql).toHaveBeenCalledOnce()
    const [, variables] = mockGraphql.mock.calls[0]!
    expect(variables).toEqual({ email: 'a@b.com', tier: 'pro' })
  })

  test('setup remote registers, saves API key, and outputs result', async () => {
    const mockGraphql = vi.fn().mockResolvedValue({
      register: {
        user: {
          id: 'user_1',
          email: 'test@example.com',
          tier: 'explorer',
          createdAt: '2026-03-30T00:00:00Z',
          graceEndsAt: '2026-04-13T00:00:00Z',
        },
        apiKey: 'flowy_test_key_123',
        checkoutUrl: 'https://checkout.stripe.com/session_123',
      },
    })
    vi.doMock('../util/client.ts', () => ({
      graphql: mockGraphql,
    }))
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: Buffer.from(''),
    })

    const { setupCommand } = await import('./setup.ts')
    await setupCommand.parseAsync(
      ['remote', '--email', 'test@example.com', '--tier', 'explorer'],
      { from: 'user' },
    )

    expect(mockGraphql).toHaveBeenCalledWith(
      expect.stringContaining('register(email: $email, tier: $tier)'),
      { email: 'test@example.com', tier: 'explorer' },
    )
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'remote',
        apiKey: 'flowy_test_key_123',
      }),
    )
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          email: 'test@example.com',
          tier: 'explorer',
          graceEndsAt: '2026-04-13T00:00:00Z',
        }),
        apiKey: 'flowy_test_key_123',
        checkoutUrl: 'https://checkout.stripe.com/session_123',
      }),
    )
  })
})
