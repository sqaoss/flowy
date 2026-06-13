import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../util/client.ts', () => ({
  graphql: vi.fn(),
}))

const CONFIG_PATH = resolve(homedir(), '.config', 'flowy', 'config.json')

describe('project command', () => {
  let originalConfig: string | null = null

  beforeEach(() => {
    originalConfig = existsSync(CONFIG_PATH)
      ? readFileSync(CONFIG_PATH, 'utf-8')
      : null
  })

  afterEach(async () => {
    if (originalConfig !== null) {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(CONFIG_PATH, originalConfig)
    } else if (existsSync(CONFIG_PATH)) {
      rmSync(CONFIG_PATH)
    }
    vi.restoreAllMocks()
  })

  test('exports a command group named "project" with create, set, list, show, update, delete subcommands', async () => {
    const { projectCommand } = await import('./project.ts')
    expect(projectCommand.name()).toBe('project')
    const subcommandNames = projectCommand.commands.map((c) => c.name())
    expect(subcommandNames).toContain('create')
    expect(subcommandNames).toContain('set')
    expect(subcommandNames).toContain('list')
    expect(subcommandNames).toContain('show')
    expect(subcommandNames).toContain('update')
    expect(subcommandNames).toContain('delete')
    expect(projectCommand.commands).toHaveLength(6)
  })

  test('show without id calls requireProject which throws when no project configured', async () => {
    const mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never)
    const mockStderr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { showProject } = await import('./project.ts')
    await showProject(undefined)

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('No active project'),
    )
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  test('setProject saves cwd-to-project mapping in config', async () => {
    const { setProject } = await import('./project.ts')
    const { loadConfig } = await import('../util/config.ts')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await setProject('proj_42', 'My Project')

    const config = loadConfig()
    const cwd = process.cwd()
    expect(config.projects[cwd]).toEqual({
      id: 'proj_42',
      name: 'My Project',
    })
  })

  test('setProject overwrites existing mapping for same directory', async () => {
    const { setProject } = await import('./project.ts')
    const { loadConfig } = await import('../util/config.ts')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await setProject('proj_1', 'First')
    await setProject('proj_2', 'Second')

    const config = loadConfig()
    const cwd = process.cwd()
    expect(config.projects[cwd]).toEqual({
      id: 'proj_2',
      name: 'Second',
    })
  })

  test('update sends updateNode with only the title when title-only', async () => {
    const { graphql } = await import('../util/client.ts')
    const { projectCommand } = await import('./project.ts')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    vi.mocked(graphql).mockResolvedValueOnce({
      updateNode: { id: 'proj_1', title: 'New' },
    })

    const updateCmd = projectCommand.commands.find(
      (c) => c.name() === 'update',
    )!
    await updateCmd.parseAsync(['proj_1', '--title', 'New'], { from: 'user' })

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('updateNode'),
      {
        id: 'proj_1',
        title: 'New',
      },
    )
  })

  test('update sends updateNode with only the description when description-only', async () => {
    const { graphql } = await import('../util/client.ts')
    const { projectCommand } = await import('./project.ts')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    vi.mocked(graphql).mockResolvedValueOnce({ updateNode: { id: 'proj_1' } })

    const updateCmd = projectCommand.commands.find(
      (c) => c.name() === 'update',
    )!
    await updateCmd.parseAsync(['proj_1', '--description', 'Body'], {
      from: 'user',
    })

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('updateNode'),
      {
        id: 'proj_1',
        description: 'Body',
      },
    )
  })

  test('update sends updateNode with only the metadata when metadata-only', async () => {
    const { graphql } = await import('../util/client.ts')
    const { projectCommand } = await import('./project.ts')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    vi.mocked(graphql).mockResolvedValueOnce({ updateNode: { id: 'proj_1' } })

    const updateCmd = projectCommand.commands.find(
      (c) => c.name() === 'update',
    )!
    await updateCmd.parseAsync(['proj_1', '--metadata', '{"k":"v"}'], {
      from: 'user',
    })

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('updateNode'),
      {
        id: 'proj_1',
        metadata: '{"k":"v"}',
      },
    )
  })

  test('update sends updateNode with combined fields', async () => {
    const { graphql } = await import('../util/client.ts')
    const { projectCommand } = await import('./project.ts')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    vi.mocked(graphql).mockResolvedValueOnce({ updateNode: { id: 'proj_1' } })

    const updateCmd = projectCommand.commands.find(
      (c) => c.name() === 'update',
    )!
    await updateCmd.parseAsync(
      ['proj_1', '--title', 'New', '--description', 'Body', '--metadata', '{}'],
      { from: 'user' },
    )

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('updateNode'),
      {
        id: 'proj_1',
        title: 'New',
        description: 'Body',
        metadata: '{}',
      },
    )
  })

  test('delete sends deleteNode mutation', async () => {
    const { graphql } = await import('../util/client.ts')
    const { projectCommand } = await import('./project.ts')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    vi.mocked(graphql).mockResolvedValueOnce({ deleteNode: true })

    const deleteCmd = projectCommand.commands.find(
      (c) => c.name() === 'delete',
    )!
    await deleteCmd.parseAsync(['proj_1'], { from: 'user' })

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('deleteNode'),
      {
        id: 'proj_1',
      },
    )
  })

  test('delete surfaces CONFLICT with exit code 1', async () => {
    const { graphql } = await import('../util/client.ts')
    const { projectCommand } = await import('./project.ts')
    const mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never)
    const mockStderr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const conflict = Object.assign(new Error('has children'), {
      code: 'CONFLICT',
    })
    vi.mocked(graphql).mockRejectedValueOnce(conflict)

    const deleteCmd = projectCommand.commands.find(
      (c) => c.name() === 'delete',
    )!
    await deleteCmd.parseAsync(['proj_1'], { from: 'user' })

    expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('CONFLICT'))
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  test('delete surfaces NOT_FOUND with exit code 2', async () => {
    const { graphql } = await import('../util/client.ts')
    const { projectCommand } = await import('./project.ts')
    const mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never)
    const mockStderr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const notFound = Object.assign(new Error('Node proj_x not found'), {
      code: 'NOT_FOUND',
    })
    vi.mocked(graphql).mockRejectedValueOnce(notFound)

    const deleteCmd = projectCommand.commands.find(
      (c) => c.name() === 'delete',
    )!
    await deleteCmd.parseAsync(['proj_x'], { from: 'user' })

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('NOT_FOUND'),
    )
    expect(mockExit).toHaveBeenCalledWith(2)
  })
})
