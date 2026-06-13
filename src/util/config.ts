import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { homedir, platform } from 'node:os'
import { resolve } from 'node:path'

const CONFIG_DIR = resolve(homedir(), '.config', 'flowy')
const CONFIG_PATH = resolve(CONFIG_DIR, 'config.json')

// Owner-only modes for the config dir/file, which hold the FLOWY_API_KEY.
// POSIX-only; chmod is a no-op on Windows so we skip it to avoid surprises.
const DIR_MODE = 0o700
const FILE_MODE = 0o600
const isWindows = platform() === 'win32'

/**
 * Non-reversible fingerprint of an API key, safe to print to stdout/logs.
 * A short SHA-256 prefix lets a human confirm *which* key is configured
 * without exposing the secret itself (F35).
 */
export function fingerprintKey(apiKey: string): string {
  if (!apiKey) return '(none)'
  const digest = createHash('sha256').update(apiKey).digest('hex')
  return `sha256:${digest.slice(0, 12)}`
}

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return {
      mode: 'saas' as const,
      apiUrl: 'https://flowy-ai.fly.dev/graphql',
      apiKey: '',
      client: { name: '' },
      projects: {} as Record<string, unknown>,
    }
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
}

export function saveConfig(config: ReturnType<typeof loadConfig>): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: DIR_MODE })
  // `mode` on writeFileSync only applies to *newly created* files and is
  // masked by umask, so an explicit chmod afterward both corrects a
  // pre-existing world-readable (0644) config and survives a tight umask.
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), {
    mode: FILE_MODE,
  })
  if (!isWindows) {
    chmodSync(CONFIG_DIR, DIR_MODE)
    chmodSync(CONFIG_PATH, FILE_MODE)
  }
}

export interface ProjectConfig {
  id: string
  name: string
  activeFeature?: string
}

export function resolveProject(): ProjectConfig | null {
  const envProject = process.env.FLOWY_PROJECT
  const config = loadConfig()

  if (envProject) {
    return (
      (Object.values(config.projects).find(
        (p) => (p as ProjectConfig).name === envProject,
      ) as ProjectConfig) ?? null
    )
  }

  const cwd = process.cwd()
  let bestMatch: ProjectConfig | null = null
  let bestLength = 0

  for (const [path, project] of Object.entries(config.projects)) {
    if (
      (cwd === path || cwd.startsWith(`${path}/`)) &&
      path.length > bestLength
    ) {
      bestMatch = project as ProjectConfig
      bestLength = path.length
    }
  }

  return bestMatch
}

export function resolveFeature(): string | null {
  const envFeature = process.env.FLOWY_FEATURE
  if (envFeature) return envFeature
  const project = resolveProject()
  return project?.activeFeature ?? null
}

export function requireFeature(): string {
  const feature = resolveFeature()
  if (!feature) {
    throw new Error(
      'No active feature. Run "flowy feature set <name-or-id>" or set FLOWY_FEATURE.',
    )
  }
  return feature
}

export function requireProject(): ProjectConfig {
  const project = resolveProject()
  if (!project) {
    throw new Error(
      'No active project. Run "flowy project set <name>" or set FLOWY_PROJECT.',
    )
  }
  return project
}

export function updateProjectConfig(
  updater: (project: ProjectConfig) => void,
): void {
  const config = loadConfig()
  const cwd = process.cwd()

  for (const [path, project] of Object.entries(config.projects)) {
    if (cwd === path || cwd.startsWith(`${path}/`)) {
      updater(project as ProjectConfig)
      saveConfig(config)
      return
    }
  }

  throw new Error('No directory mapping. Run "flowy project set <name>" first.')
}

export function getConfig() {
  const config = loadConfig()
  const apiUrl = process.env.FLOWY_API_URL ?? config.apiUrl
  const apiKey = process.env.FLOWY_API_KEY ?? config.apiKey
  return { apiUrl, apiKey }
}
