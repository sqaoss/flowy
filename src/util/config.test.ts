import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const CONFIG_PATH = resolve(homedir(), '.config', 'flowy', 'config.json')

describe('config', () => {
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
    delete process.env.FLOWY_PROJECT
    delete process.env.FLOWY_FEATURE
    vi.resetModules()
  })
  test('loadConfig returns defaults when no config file exists', async () => {
    const { loadConfig } = await import('./config.ts')
    const config = loadConfig()
    expect(config.mode).toBe('saas')
    expect(config.apiUrl).toBe('https://flowy-ai.fly.dev/graphql')
    expect(config.apiKey).toBe('')
    expect(config.client.name).toBe('')
    expect(config.projects).toEqual({})
  })

  test('getConfig uses env var overrides', async () => {
    process.env.FLOWY_API_URL = 'http://localhost:4000/graphql'
    process.env.FLOWY_API_KEY = 'test-key'
    const { getConfig } = await import('./config.ts')
    const { apiUrl, apiKey } = getConfig()
    expect(apiUrl).toBe('http://localhost:4000/graphql')
    expect(apiKey).toBe('test-key')
    delete process.env.FLOWY_API_URL
    delete process.env.FLOWY_API_KEY
  })

  test('saveConfig writes and loadConfig reads from disk', async () => {
    const { saveConfig, loadConfig } = await import('./config.ts')
    const config = loadConfig()
    config.client.name = 'Test Client'
    saveConfig(config)
    const reloaded = loadConfig()
    expect(reloaded.client.name).toBe('Test Client')
  })

  test('resolveProject returns null when no project configured', async () => {
    const { resolveProject } = await import('./config.ts')
    expect(resolveProject()).toBeNull()
  })

  test('resolveProject matches cwd against project paths', async () => {
    const { saveConfig, loadConfig, resolveProject } = await import(
      './config.ts'
    )
    const config = loadConfig()
    const cwd = process.cwd()
    config.projects[cwd] = { id: 'proj_1', name: 'Test Project' }
    saveConfig(config)
    const project = resolveProject()
    expect(project).not.toBeNull()
    expect(project?.id).toBe('proj_1')
    expect(project?.name).toBe('Test Project')
  })

  test('resolveProject uses FLOWY_PROJECT env var', async () => {
    const { saveConfig, loadConfig, resolveProject } = await import(
      './config.ts'
    )
    const config = loadConfig()
    config.projects['/other/path'] = { id: 'proj_2', name: 'Env Project' }
    saveConfig(config)
    process.env.FLOWY_PROJECT = 'Env Project'
    const project = resolveProject()
    expect(project?.name).toBe('Env Project')
  })

  test('requireProject throws when no project configured', async () => {
    const { requireProject } = await import('./config.ts')
    expect(() => requireProject()).toThrow('No active project')
  })

  test('resolveFeature returns FLOWY_FEATURE env var', async () => {
    process.env.FLOWY_FEATURE = 'feat_123'
    const { resolveFeature } = await import('./config.ts')
    expect(resolveFeature()).toBe('feat_123')
  })

  test('resolveFeature falls back to activeFeature from project config', async () => {
    const { saveConfig, loadConfig, resolveFeature } = await import(
      './config.ts'
    )
    const config = loadConfig()
    const cwd = process.cwd()
    config.projects[cwd] = {
      id: 'proj_1',
      name: 'Test',
      activeFeature: 'feat_abc',
    }
    saveConfig(config)
    expect(resolveFeature()).toBe('feat_abc')
  })

  test('requireFeature throws when no feature set', async () => {
    const { requireFeature } = await import('./config.ts')
    expect(() => requireFeature()).toThrow('No active feature')
  })

  test('updateProjectConfig modifies project entry for cwd', async () => {
    const { saveConfig, loadConfig, updateProjectConfig } = await import(
      './config.ts'
    )
    const config = loadConfig()
    const cwd = process.cwd()
    config.projects[cwd] = { id: 'proj_1', name: 'Test' }
    saveConfig(config)
    updateProjectConfig((p) => {
      p.activeFeature = 'feat_999'
    })
    const updated = loadConfig()
    expect(
      (updated.projects[cwd] as { activeFeature?: string }).activeFeature,
    ).toBe('feat_999')
  })
})
