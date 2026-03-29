import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let mockGraphql: ReturnType<typeof vi.fn>
let mockLoadConfig: ReturnType<typeof vi.fn>
let mockSaveConfig: ReturnType<typeof vi.fn>
let mockOutput: ReturnType<typeof vi.fn>
let mockOutputError: ReturnType<typeof vi.fn>
let mockSpawnSync: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockGraphql = vi.fn()
  mockLoadConfig = vi.fn(() => ({
    mode: 'saas',
    apiUrl: 'https://flowy-ai.fly.dev/graphql',
    apiKey: 'test-key',
    client: { name: '' },
    projects: {},
  }))
  mockSaveConfig = vi.fn()
  mockOutput = vi.fn()
  mockOutputError = vi.fn()
  mockSpawnSync = vi.fn()

  vi.doMock('../util/client.ts', () => ({
    graphql: mockGraphql,
  }))

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

describe('init command', () => {
  test('exports a command named "init" with no subcommands', async () => {
    const { initCommand } = await import('./init.ts')
    expect(initCommand.name()).toBe('init')
    expect(initCommand.commands).toHaveLength(0)
  })

  test('detects repo name from SSH git remote URL', async () => {
    mockSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: '/home/user/my-repo\n',
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: 'git@github.com:sqaoss/flowy.git\n',
      })
    mockGraphql.mockResolvedValue({
      createNode: { id: 'proj_123', title: 'flowy' },
    })

    const { initCommand } = await import('./init.ts')
    await initCommand.parseAsync([], { from: 'user' })

    expect(mockGraphql).toHaveBeenCalledWith(
      expect.stringContaining('createNode'),
      expect.objectContaining({ type: 'project', title: 'flowy' }),
    )
  })

  test('detects repo name from HTTPS git remote URL', async () => {
    mockSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: '/home/user/my-repo\n',
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: 'https://github.com/sqaoss/flowy.git\n',
      })
    mockGraphql.mockResolvedValue({
      createNode: { id: 'proj_123', title: 'flowy' },
    })

    const { initCommand } = await import('./init.ts')
    await initCommand.parseAsync([], { from: 'user' })

    expect(mockGraphql).toHaveBeenCalledWith(
      expect.stringContaining('createNode'),
      expect.objectContaining({ type: 'project', title: 'flowy' }),
    )
  })

  test('falls back to directory name when no remote', async () => {
    mockSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: '/home/user/my-cool-project\n',
      })
      .mockReturnValueOnce({
        status: 1,
        stdout: '',
      })
    mockGraphql.mockResolvedValue({
      createNode: { id: 'proj_456', title: 'my-cool-project' },
    })

    const { initCommand } = await import('./init.ts')
    await initCommand.parseAsync([], { from: 'user' })

    expect(mockGraphql).toHaveBeenCalledWith(
      expect.stringContaining('createNode'),
      expect.objectContaining({
        type: 'project',
        title: 'my-cool-project',
      }),
    )
  })

  test('calls graphql to create project and maps directory via config', async () => {
    mockSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: '/home/user/flowy\n',
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: 'git@github.com:sqaoss/flowy.git\n',
      })
    mockGraphql.mockResolvedValue({
      createNode: { id: 'proj_789', title: 'flowy' },
    })

    const { initCommand } = await import('./init.ts')
    await initCommand.parseAsync([], { from: 'user' })

    expect(mockGraphql).toHaveBeenCalledOnce()
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        projects: expect.objectContaining({
          [process.cwd()]: { id: 'proj_789', name: 'flowy' },
        }),
      }),
    )
    expect(mockOutput).toHaveBeenCalledWith({
      id: 'proj_789',
      name: 'flowy',
      directory: process.cwd(),
    })
  })

  test('throws when not in a git repo', async () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 128,
      stdout: '',
    })

    const { initCommand } = await import('./init.ts')
    await initCommand.parseAsync([], { from: 'user' })

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Not a git repository'),
      }),
    )
  })
})
