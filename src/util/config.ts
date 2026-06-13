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

/** The two configuration profiles. `saas` is a back-compat alias for `remote`. */
export type Mode = 'local' | 'remote'

const LOCAL_API_URL = 'http://localhost:4000/graphql'
const REMOTE_API_URL = 'https://flowy-ai.fly.dev/graphql'

export interface ProjectConfig {
  id: string
  name: string
  activeFeature?: string
}

/** Per-mode settings — isolated so local creds never bleed into remote. */
interface Profile {
  apiUrl: string
  apiKey: string
  projects: Record<string, ProjectConfig>
}

/** On-disk shape (current). */
interface StoredConfig {
  mode: Mode
  client: { name: string }
  profiles: Record<Mode, Profile>
}

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

/** Map any historical mode token onto the canonical vocabulary (F25). */
function canonicalMode(raw: unknown): Mode {
  // "saas" was the old name for the hosted service; "remote" is canonical now.
  return raw === 'local' ? 'local' : 'remote'
}

function defaultProfile(mode: Mode): Profile {
  return {
    apiUrl: mode === 'local' ? LOCAL_API_URL : REMOTE_API_URL,
    apiKey: '',
    projects: {},
  }
}

function emptyStored(mode: Mode = 'remote'): StoredConfig {
  return {
    mode,
    client: { name: '' },
    profiles: {
      local: defaultProfile('local'),
      remote: defaultProfile('remote'),
    },
  }
}

/**
 * Read raw JSON off disk and normalize it into the current {mode, client,
 * profiles} shape. Handles three eras gracefully:
 *  - missing file           → defaults (remote mode, empty profiles)
 *  - legacy flat config     → {mode, apiUrl, apiKey, projects} migrated into
 *                             the active-mode profile
 *  - current profiled config
 * The migration is non-destructive: an old user's key/projects land in the
 * profile matching their (canonicalized) mode, so nothing is lost.
 */
function readStored(): StoredConfig {
  if (!existsSync(CONFIG_PATH)) return emptyStored()

  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {
    return emptyStored()
  }

  const mode = canonicalMode(raw.mode)
  const clientName =
    typeof (raw.client as { name?: unknown })?.name === 'string'
      ? (raw.client as { name: string }).name
      : ''

  const stored = emptyStored(mode)
  stored.client.name = clientName

  if (raw.profiles && typeof raw.profiles === 'object') {
    // Current profiled shape — merge each known profile over the defaults.
    const profiles = raw.profiles as Partial<Record<string, Partial<Profile>>>
    // Fold a legacy "saas" profile onto "remote" if one is ever present.
    for (const key of ['local', 'remote', 'saas'] as const) {
      const p = profiles[key]
      if (!p) continue
      const target: Mode = key === 'saas' ? 'remote' : key
      stored.profiles[target] = {
        apiUrl:
          typeof p.apiUrl === 'string'
            ? p.apiUrl
            : defaultProfile(target).apiUrl,
        apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
        projects: (p.projects as Record<string, ProjectConfig>) ?? {},
      }
    }
    return stored
  }

  // Legacy flat config — migrate apiUrl/apiKey/projects into the active profile.
  const profile = stored.profiles[mode]
  if (typeof raw.apiUrl === 'string') profile.apiUrl = raw.apiUrl
  if (typeof raw.apiKey === 'string') profile.apiKey = raw.apiKey
  if (raw.projects && typeof raw.projects === 'object') {
    profile.projects = raw.projects as Record<string, ProjectConfig>
  }
  return stored
}

/**
 * A live, backward-compatible view over the stored config. Reading/writing
 * `apiUrl`/`apiKey`/`projects` transparently targets the *active* mode's
 * profile, so every existing command keeps working unchanged. Reassigning
 * `mode` re-points those accessors at the other profile — the mechanism that
 * keeps local and remote credentials from cross-contaminating (F25).
 */
export interface Config {
  mode: Mode
  client: { name: string }
  apiUrl: string
  apiKey: string
  projects: Record<string, ProjectConfig>
  /** @internal — the underlying per-mode storage, persisted by saveConfig. */
  readonly profiles: Record<Mode, Profile>
}

function makeConfig(stored: StoredConfig): Config {
  let mode = stored.mode
  const view = {
    client: stored.client,
    get profiles() {
      return stored.profiles
    },
    get mode() {
      return mode
    },
    set mode(next: Mode) {
      mode = canonicalMode(next)
    },
    get apiUrl() {
      return stored.profiles[mode].apiUrl
    },
    set apiUrl(value: string) {
      stored.profiles[mode].apiUrl = value
    },
    get apiKey() {
      return stored.profiles[mode].apiKey
    },
    set apiKey(value: string) {
      stored.profiles[mode].apiKey = value
    },
    get projects() {
      return stored.profiles[mode].projects
    },
    set projects(value: Record<string, ProjectConfig>) {
      stored.profiles[mode].projects = value
    },
  }
  return view as Config
}

export function loadConfig(): Config {
  return makeConfig(readStored())
}

export function saveConfig(config: Config): void {
  const stored: StoredConfig = {
    mode: canonicalMode(config.mode),
    client: { name: config.client.name },
    profiles: config.profiles,
  }
  mkdirSync(CONFIG_DIR, { recursive: true, mode: DIR_MODE })
  // `mode` on writeFileSync only applies to *newly created* files and is
  // masked by umask, so an explicit chmod afterward both corrects a
  // pre-existing world-readable (0644) config and survives a tight umask.
  writeFileSync(CONFIG_PATH, JSON.stringify(stored, null, 2), {
    mode: FILE_MODE,
  })
  if (!isWindows) {
    chmodSync(CONFIG_DIR, DIR_MODE)
    chmodSync(CONFIG_PATH, FILE_MODE)
  }
}

/**
 * Guard SaaS-only commands. The bundled local server has no whoami/billing/key
 * endpoints, so running them in local mode used to fail with an obscure
 * GraphQL error. Fail fast with a clear message + a distinct code (F25).
 */
export function requireRemoteMode(commandName: string): void {
  const { mode } = loadConfig()
  if (mode === 'local') {
    const err = new Error(
      `"flowy ${commandName}" is only available in remote mode. ` +
        `The active mode is local mode — run "flowy setup remote" to connect ` +
        `to the hosted Flowy service.`,
    ) as Error & { code?: string }
    err.code = 'LOCAL_MODE'
    throw err
  }
}

export function resolveProject(): ProjectConfig | null {
  const envProject = process.env.FLOWY_PROJECT
  const config = loadConfig()

  if (envProject) {
    return (
      (Object.values(config.projects).find(
        (p) => p.name === envProject,
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
      bestMatch = project
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
      updater(project)
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
