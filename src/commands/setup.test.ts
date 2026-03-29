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

  test('setup remote prints not-yet-implemented message', async () => {
    const { setupCommand } = await import('./setup.ts')
    await setupCommand.parseAsync(['remote'], { from: 'user' })

    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('not yet implemented'),
      }),
    )
  })
})
