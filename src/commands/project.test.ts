import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

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

  test('exports a command group named "project" with create, set, list, show subcommands', async () => {
    const { projectCommand } = await import('./project.ts')
    expect(projectCommand.name()).toBe('project')
    const subcommandNames = projectCommand.commands.map((c) => c.name())
    expect(subcommandNames).toContain('create')
    expect(subcommandNames).toContain('set')
    expect(subcommandNames).toContain('list')
    expect(subcommandNames).toContain('show')
    expect(projectCommand.commands).toHaveLength(4)
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
})
