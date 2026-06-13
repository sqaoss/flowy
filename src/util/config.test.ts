import {
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir, platform } from 'node:os'
import { resolve } from 'node:path'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'

const isWindows = platform() === 'win32'

const CONFIG_PATH = resolve(homedir(), '.config', 'flowy', 'config.json')

describe('config', () => {
  let originalConfig: string | null = null

  beforeAll(() => {
    originalConfig = existsSync(CONFIG_PATH)
      ? readFileSync(CONFIG_PATH, 'utf-8')
      : null
  })

  afterAll(() => {
    if (originalConfig !== null) {
      writeFileSync(CONFIG_PATH, originalConfig)
    } else if (existsSync(CONFIG_PATH)) {
      rmSync(CONFIG_PATH)
    }
  })

  beforeEach(() => {
    if (existsSync(CONFIG_PATH)) rmSync(CONFIG_PATH)
  })

  afterEach(() => {
    delete process.env.FLOWY_PROJECT
    delete process.env.FLOWY_FEATURE
    vi.resetModules()
  })
  test('loadConfig returns defaults when no config file exists', async () => {
    const { loadConfig } = await import('./config.ts')
    const config = loadConfig()
    // Canonical default mode is "remote" (was "saas" — kept as a back-compat
    // alias on read only).
    expect(config.mode).toBe('remote')
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

  test.skipIf(isWindows)(
    'saveConfig writes config with 0600 mode',
    async () => {
      const { saveConfig, loadConfig } = await import('./config.ts')
      saveConfig(loadConfig())
      const mode = statSync(CONFIG_PATH).mode & 0o777
      expect(mode).toBe(0o600)
    },
  )

  test.skipIf(isWindows)(
    'saveConfig corrects a pre-existing 0644 config to 0600',
    async () => {
      const { saveConfig, loadConfig } = await import('./config.ts')
      // Simulate a config written by an older CLI (world-readable).
      writeFileSync(CONFIG_PATH, JSON.stringify(loadConfig(), null, 2))
      chmodSync(CONFIG_PATH, 0o644)
      expect(statSync(CONFIG_PATH).mode & 0o777).toBe(0o644)

      saveConfig(loadConfig())
      expect(statSync(CONFIG_PATH).mode & 0o777).toBe(0o600)
    },
  )

  test('fingerprintKey is deterministic and non-reversible', async () => {
    const { fingerprintKey } = await import('./config.ts')
    const key = 'flowy_secret_abcdef0123456789'
    const fp = fingerprintKey(key)
    expect(fingerprintKey(key)).toBe(fp)
    expect(fp).not.toContain(key)
    expect(fp).not.toContain('abcdef0123456789')
    expect(fp).toMatch(/sha256:[0-9a-f]{12}/)
  })

  test('fingerprintKey returns a placeholder for an empty key', async () => {
    const { fingerprintKey } = await import('./config.ts')
    expect(fingerprintKey('')).toBe('(none)')
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

  describe('per-mode profiles (F25)', () => {
    test('default config canonicalizes mode to "remote"', async () => {
      const { loadConfig } = await import('./config.ts')
      const config = loadConfig()
      // Canonical vocab is "remote"; "saas" is only a back-compat alias.
      expect(config.mode).toBe('remote')
    })

    test('local apiKey/projects do not bleed into remote mode', async () => {
      const { saveConfig, loadConfig } = await import('./config.ts')

      // Configure the local profile with a key + a project mapping.
      const local = loadConfig()
      local.mode = 'local'
      local.apiKey = 'local-secret'
      local.apiUrl = 'http://localhost:4000/graphql'
      local.projects['/work/local'] = { id: 'proj_local', name: 'LocalProj' }
      saveConfig(local)

      // Switch to remote: the local key/projects must NOT be visible.
      const remote = loadConfig()
      remote.mode = 'remote'
      expect(remote.apiKey).toBe('')
      expect(remote.apiUrl).toBe('https://flowy-ai.fly.dev/graphql')
      expect(remote.projects['/work/local']).toBeUndefined()

      // Set a different key/project in remote mode and persist.
      remote.apiKey = 'remote-secret'
      remote.projects['/work/remote'] = {
        id: 'proj_remote',
        name: 'RemoteProj',
      }
      saveConfig(remote)

      // Back to local: local data intact, remote data not visible.
      const reloadLocal = loadConfig()
      reloadLocal.mode = 'local'
      expect(reloadLocal.apiKey).toBe('local-secret')
      expect(reloadLocal.projects['/work/local']?.name).toBe('LocalProj')
      expect(reloadLocal.projects['/work/remote']).toBeUndefined()
    })

    test('getConfig reads from the active mode profile, not the other', async () => {
      const { saveConfig, loadConfig, getConfig } = await import('./config.ts')

      const local = loadConfig()
      local.mode = 'local'
      local.apiKey = 'local-secret'
      local.apiUrl = 'http://localhost:4000/graphql'
      saveConfig(local)

      const remote = loadConfig()
      remote.mode = 'remote'
      remote.apiKey = 'remote-secret'
      saveConfig(remote)

      // Active mode is now remote (last saved). getConfig sees remote creds.
      const cfg = getConfig()
      expect(cfg.apiKey).toBe('remote-secret')
      expect(cfg.apiUrl).toBe('https://flowy-ai.fly.dev/graphql')
    })

    test('client name is shared across modes', async () => {
      const { saveConfig, loadConfig } = await import('./config.ts')
      const config = loadConfig()
      config.client.name = 'Acme'
      saveConfig(config)
      const reloaded = loadConfig()
      reloaded.mode = reloaded.mode === 'local' ? 'remote' : 'local'
      expect(reloaded.client.name).toBe('Acme')
    })

    test('migrates a legacy flat config into the active-mode profile', async () => {
      const { loadConfig } = await import('./config.ts')
      // Legacy shape written by an older CLI: flat apiKey/apiUrl/projects,
      // mode="saas" (the old vocab).
      writeFileSync(
        CONFIG_PATH,
        JSON.stringify({
          mode: 'saas',
          apiUrl: 'https://flowy-ai.fly.dev/graphql',
          apiKey: 'legacy-key',
          client: { name: 'Legacy Co' },
          projects: { '/legacy/path': { id: 'p1', name: 'Legacy' } },
        }),
      )

      const config = loadConfig()
      // "saas" canonicalizes to "remote".
      expect(config.mode).toBe('remote')
      // Flat fields land in the (remote) active profile.
      expect(config.apiKey).toBe('legacy-key')
      expect(config.projects['/legacy/path']?.name).toBe('Legacy')
      expect(config.client.name).toBe('Legacy Co')
    })

    test('resolveProject/resolveFeature use the active mode profile only', async () => {
      const { saveConfig, loadConfig, resolveProject, resolveFeature } =
        await import('./config.ts')
      const cwd = process.cwd()

      const local = loadConfig()
      local.mode = 'local'
      local.projects[cwd] = {
        id: 'proj_local',
        name: 'Local',
        activeFeature: 'feat_local',
      }
      saveConfig(local)

      const remote = loadConfig()
      remote.mode = 'remote'
      remote.projects[cwd] = {
        id: 'proj_remote',
        name: 'Remote',
        activeFeature: 'feat_remote',
      }
      saveConfig(remote)

      // Active mode is remote → resolution returns the remote project.
      expect(resolveProject()?.id).toBe('proj_remote')
      expect(resolveFeature()).toBe('feat_remote')
    })

    test('requireRemoteMode throws a coded error in local mode', async () => {
      const { saveConfig, loadConfig, requireRemoteMode } = await import(
        './config.ts'
      )
      const config = loadConfig()
      config.mode = 'local'
      saveConfig(config)

      expect(() => requireRemoteMode('whoami')).toThrow(/local mode/i)
      try {
        requireRemoteMode('whoami')
      } catch (error) {
        expect((error as { code?: string }).code).toBe('LOCAL_MODE')
      }
    })

    test('requireRemoteMode is a no-op in remote mode', async () => {
      const { saveConfig, loadConfig, requireRemoteMode } = await import(
        './config.ts'
      )
      const config = loadConfig()
      config.mode = 'remote'
      saveConfig(config)
      expect(() => requireRemoteMode('whoami')).not.toThrow()
    })

    test('a half-written config (mode set, key not yet) still loads cleanly', async () => {
      const { saveConfig, loadConfig } = await import('./config.ts')
      // Simulate save-after-mode-switch but before the key arrives.
      const config = loadConfig()
      config.mode = 'remote'
      saveConfig(config)

      const reloaded = loadConfig()
      expect(reloaded.mode).toBe('remote')
      expect(reloaded.apiKey).toBe('')
      expect(reloaded.apiUrl).toBe('https://flowy-ai.fly.dev/graphql')
      expect(reloaded.projects).toEqual({})
    })
  })
})
