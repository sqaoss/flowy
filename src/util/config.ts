import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const CONFIG_DIR = resolve(homedir(), '.config', 'flowy')
const CONFIG_PATH = resolve(CONFIG_DIR, 'config.json')

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
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
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
