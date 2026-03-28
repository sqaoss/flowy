# Flowy CLI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace node/edge graph primitives with domain-driven commands (client, project, feature, task) and add config-based context resolution.

**Architecture:** The CLI remains a thin GraphQL client. New commands map to existing server mutations (`createNode`, `createEdge`, `removeEdge`) but hide the graph model behind domain language. A config file at `~/.config/flowy/config.json` stores credentials and maps directories to projects. No server changes required.

**Tech Stack:** Bun, Commander.js, GraphQL (existing server API)

**Note:** This project has no test suite. Verification is `bun run typecheck` + `bun run check` + manual CLI testing.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Rewrite | `src/util/config.ts` | Config loading/saving, context resolution (project, feature) |
| Create | `src/util/description.ts` | Resolve `--description` from file path or inline string |
| Create | `src/commands/setup.ts` | Onboarding: SaaS vs self-hosted, registration |
| Create | `src/commands/client.ts` | `flowy client set name <name>` |
| Create | `src/commands/project.ts` | `flowy project create/set/list/show` |
| Create | `src/commands/feature.ts` | `flowy feature create/set/unset/list/show` |
| Create | `src/commands/task.ts` | `flowy task create/list/show/block/unblock` |
| Modify | `src/commands/tree.ts` | Simplify: remove subcommands, flat `flowy tree <id>` |
| Modify | `src/index.ts` | Wire new commands, remove old ones |
| Keep | `src/commands/status.ts` | No changes |
| Keep | `src/commands/approve.ts` | No changes |
| Keep | `src/commands/search.ts` | No changes |
| Keep | `src/commands/whoami.ts` | No changes |
| Keep | `src/util/client.ts` | No changes (`graphql()` function) |
| Keep | `src/util/format.ts` | No changes (`output()`, `outputError()`) |
| Delete | `src/commands/node.ts` | Replaced by project.ts, feature.ts, task.ts |
| Delete | `src/commands/edge.ts` | Replaced by task block/unblock |
| Delete | `src/commands/register.ts` | Replaced by setup.ts |
| Rename | `skills/flowy.md` → `skills/SKILL.md` | Updated with new command examples |

---

### Task 1: Rewrite Config System

**Files:**
- Rewrite: `src/util/config.ts`

- [ ] **Step 1: Replace config.ts with the new implementation**

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

export interface ProjectConfig {
  id: string
  name: string
  activeFeature?: string
}

export interface FlowyConfig {
  mode: 'saas' | 'local'
  apiUrl: string
  apiKey: string
  client: {
    name: string
  }
  projects: Record<string, ProjectConfig>
}

const CONFIG_DIR = resolve(homedir(), '.config', 'flowy')
const CONFIG_PATH = resolve(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: FlowyConfig = {
  mode: 'saas',
  apiUrl: 'https://flowy-ai.fly.dev/graphql',
  apiKey: '',
  client: { name: '' },
  projects: {},
}

export function loadConfig(): FlowyConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG, client: { ...DEFAULT_CONFIG.client }, projects: {} }
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
}

export function saveConfig(config: FlowyConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}

// Used by src/util/client.ts — maintains the same { apiUrl, apiKey } interface
export function getConfig() {
  const config = loadConfig()
  const apiUrl = process.env.FLOWY_API_URL ?? config.apiUrl
  const apiKey = process.env.FLOWY_API_KEY ?? config.apiKey
  return { apiUrl, apiKey }
}

export function resolveProject(): ProjectConfig | null {
  const envProject = process.env.FLOWY_PROJECT
  const config = loadConfig()

  if (envProject) {
    return Object.values(config.projects).find((p) => p.name === envProject) ?? null
  }

  const cwd = process.cwd()
  let bestMatch: ProjectConfig | null = null
  let bestLength = 0

  for (const [path, project] of Object.entries(config.projects)) {
    if ((cwd === path || cwd.startsWith(`${path}/`)) && path.length > bestLength) {
      bestMatch = project
      bestLength = path.length
    }
  }

  return bestMatch
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

export function updateProjectConfig(updater: (project: ProjectConfig) => void): void {
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
```

- [ ] **Step 2: Verify types**

Run: `bun run typecheck`
Expected: No errors (client.ts still imports `getConfig` — interface unchanged)

- [ ] **Step 3: Verify lint**

Run: `bun run check`

- [ ] **Step 4: Commit**

```bash
git add src/util/config.ts
git commit -m "refactor: rewrite config system with context resolution"
```

---

### Task 2: Add Description Resolver

**Files:**
- Create: `src/util/description.ts`

- [ ] **Step 1: Create description.ts**

```typescript
export async function resolveDescription(value: string): Promise<string> {
  const file = Bun.file(value)
  if (await file.exists()) {
    return file.text()
  }
  return value
}
```

- [ ] **Step 2: Verify**

Run: `bun run typecheck && bun run check`

- [ ] **Step 3: Commit**

```bash
git add src/util/description.ts
git commit -m "feat: add description resolver (file path or inline string)"
```

---

### Task 3: Setup Command

**Files:**
- Create: `src/commands/setup.ts`

- [ ] **Step 1: Create setup.ts**

```typescript
import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { loadConfig, saveConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'

export const setupCommand = new Command('setup')
  .description('Set up Flowy CLI')
  .option('--mode <mode>', 'Mode: saas or local')
  .option('--email <email>', 'Email for SaaS registration')
  .option('--api-url <url>', 'GraphQL endpoint for local mode')
  .option('--api-key <key>', 'API key (if you already have one)')
  .action(async (opts) => {
    try {
      const config = loadConfig()

      if (opts.apiKey) {
        config.apiKey = opts.apiKey
        if (opts.apiUrl) config.apiUrl = opts.apiUrl
        if (opts.mode) config.mode = opts.mode
        saveConfig(config)
        output({ status: 'configured', mode: config.mode, apiUrl: config.apiUrl })
        return
      }

      if (opts.mode === 'local') {
        if (!opts.apiUrl) {
          throw new Error('--api-url is required for local mode')
        }
        config.mode = 'local'
        config.apiUrl = opts.apiUrl
        saveConfig(config)
        output({ status: 'configured', mode: 'local', apiUrl: config.apiUrl })
        return
      }

      // SaaS mode: register
      if (!opts.email) {
        throw new Error('--email is required for SaaS registration')
      }

      config.mode = 'saas'
      config.apiUrl = opts.apiUrl ?? 'https://flowy-ai.fly.dev/graphql'
      saveConfig(config)

      const data = await graphql<{
        register: { user: { id: string; email: string }; apiKey: string }
      }>(
        `mutation Register($email: String!) {
          register(email: $email) {
            user { id email tier createdAt }
            apiKey
          }
        }`,
        { email: opts.email },
      )

      config.apiKey = data.register.apiKey
      saveConfig(config)
      output(data.register)
    } catch (error) {
      outputError(error)
    }
  })
```

- [ ] **Step 2: Verify**

Run: `bun run typecheck && bun run check`

- [ ] **Step 3: Commit**

```bash
git add src/commands/setup.ts
git commit -m "feat: add setup command (replaces register)"
```

---

### Task 4: Client Command

**Files:**
- Create: `src/commands/client.ts`

- [ ] **Step 1: Create client.ts**

```typescript
import { Command } from 'commander'
import { loadConfig, saveConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'

export const clientCommand = new Command('client').description(
  'Manage client settings',
)

clientCommand
  .command('set')
  .description('Set a client property')
  .argument('<property>', 'Property to set (name)')
  .argument('<value>', 'New value')
  .action((property: string, value: string) => {
    try {
      if (property !== 'name') {
        throw new Error(`Unknown property: ${property}. Available: name`)
      }
      const config = loadConfig()
      config.client.name = value
      saveConfig(config)
      output({ client: config.client })
    } catch (error) {
      outputError(error)
    }
  })
```

- [ ] **Step 2: Verify**

Run: `bun run typecheck && bun run check`

- [ ] **Step 3: Commit**

```bash
git add src/commands/client.ts
git commit -m "feat: add client command"
```

---

### Task 5: Project Command

**Files:**
- Create: `src/commands/project.ts`

- [ ] **Step 1: Create project.ts**

```typescript
import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { loadConfig, requireProject, saveConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'

export const projectCommand = new Command('project').description(
  'Manage projects',
)

projectCommand
  .command('create')
  .description('Create a new project')
  .argument('<name>', 'Project name')
  .action(async (name: string) => {
    try {
      const data = await graphql<{ createNode: unknown }>(
        `mutation CreateProject($type: String!, $title: String!) {
          createNode(type: $type, title: $title) {
            id type title status createdAt updatedAt
          }
        }`,
        { type: 'project', title: name },
      )
      output(data.createNode)
    } catch (error) {
      outputError(error)
    }
  })

projectCommand
  .command('set')
  .description('Map current directory to a project')
  .argument('<name>', 'Project name')
  .action(async (name: string) => {
    try {
      const data = await graphql<{
        nodes: Array<{ id: string; title: string }>
      }>(
        `query ListProjects($type: String) {
          nodes(type: $type) { id title }
        }`,
        { type: 'project' },
      )

      const project = data.nodes.find((n) => n.title === name)
      if (!project) {
        throw new Error(`Project "${name}" not found`)
      }

      const config = loadConfig()
      config.projects[process.cwd()] = {
        id: project.id,
        name: project.title,
      }
      saveConfig(config)
      output({ mapped: process.cwd(), project: project.title, id: project.id })
    } catch (error) {
      outputError(error)
    }
  })

projectCommand
  .command('list')
  .description('List all projects')
  .action(async () => {
    try {
      const data = await graphql<{ nodes: unknown[] }>(
        `query ListProjects($type: String) {
          nodes(type: $type) {
            id title status createdAt updatedAt
          }
        }`,
        { type: 'project' },
      )
      output(data.nodes)
    } catch (error) {
      outputError(error)
    }
  })

projectCommand
  .command('show')
  .description('Show project details')
  .argument('[id]', 'Project ID (default: active project)')
  .action(async (id?: string) => {
    try {
      const projectId = id ?? requireProject().id
      const data = await graphql<{ node: unknown }>(
        `query GetProject($id: String!) {
          node(id: $id) {
            id type title description status metadata createdAt updatedAt
          }
        }`,
        { id: projectId },
      )
      output(data.node)
    } catch (error) {
      outputError(error)
    }
  })
```

- [ ] **Step 2: Verify**

Run: `bun run typecheck && bun run check`

- [ ] **Step 3: Commit**

```bash
git add src/commands/project.ts
git commit -m "feat: add project command"
```

---

### Task 6: Feature Command

**Files:**
- Create: `src/commands/feature.ts`

- [ ] **Step 1: Create feature.ts**

```typescript
import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { requireProject, resolveFeature, updateProjectConfig } from '../util/config.ts'
import { resolveDescription } from '../util/description.ts'
import { output, outputError } from '../util/format.ts'

export const featureCommand = new Command('feature').description(
  'Manage features',
)

featureCommand
  .command('create')
  .description('Create a new feature in the active project')
  .requiredOption('--title <title>', 'Feature title')
  .requiredOption('--description <desc>', 'Description (string or file path)')
  .action(async (opts) => {
    try {
      const project = requireProject()
      const description = await resolveDescription(opts.description)

      const data = await graphql<{ createNode: { id: string } }>(
        `mutation CreateFeature($type: String!, $title: String!, $description: String) {
          createNode(type: $type, title: $title, description: $description) {
            id type title description status createdAt updatedAt
          }
        }`,
        { type: 'feature', title: opts.title, description },
      )

      await graphql(
        `mutation LinkToProject($sourceId: String!, $targetId: String!, $relation: String!) {
          createEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation) {
            sourceId targetId relation
          }
        }`,
        { sourceId: data.createNode.id, targetId: project.id, relation: 'part_of' },
      )

      output(data.createNode)
    } catch (error) {
      outputError(error)
    }
  })

featureCommand
  .command('set')
  .description('Set active feature for current project')
  .argument('<name-or-id>', 'Feature name or ID')
  .action(async (nameOrId: string) => {
    try {
      const project = requireProject()

      const data = await graphql<{
        descendants: Array<{ id: string; title: string; type: string }>
      }>(
        `query ProjectFeatures($nodeId: String!, $relation: String, $maxDepth: Int) {
          descendants(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
            id title type
          }
        }`,
        { nodeId: project.id, relation: 'part_of', maxDepth: 1 },
      )

      const features = data.descendants.filter((d) => d.type === 'feature')
      const feature = features.find(
        (f) => f.id === nameOrId || f.title === nameOrId,
      )
      if (!feature) {
        throw new Error(
          `Feature "${nameOrId}" not found in project "${project.name}"`,
        )
      }

      updateProjectConfig((p) => {
        p.activeFeature = feature.id
      })

      output({ activeFeature: feature.title, id: feature.id })
    } catch (error) {
      outputError(error)
    }
  })

featureCommand
  .command('unset')
  .description('Clear active feature')
  .action(() => {
    try {
      updateProjectConfig((p) => {
        delete p.activeFeature
      })
      output({ activeFeature: null })
    } catch (error) {
      outputError(error)
    }
  })

featureCommand
  .command('list')
  .description('List features in active project')
  .action(async () => {
    try {
      const project = requireProject()
      const data = await graphql<{
        descendants: Array<{ id: string; title: string; type: string; status: string }>
      }>(
        `query ProjectFeatures($nodeId: String!, $relation: String, $maxDepth: Int) {
          descendants(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
            id title type status createdAt updatedAt
          }
        }`,
        { nodeId: project.id, relation: 'part_of', maxDepth: 1 },
      )
      output(data.descendants.filter((d) => d.type === 'feature'))
    } catch (error) {
      outputError(error)
    }
  })

featureCommand
  .command('show')
  .description('Show feature details')
  .argument('[id]', 'Feature ID (default: active feature)')
  .action(async (id?: string) => {
    try {
      const featureId = id ?? resolveFeature()
      if (!featureId) {
        throw new Error('No active feature. Run "flowy feature set <name-or-id>".')
      }
      const data = await graphql<{ node: unknown }>(
        `query GetFeature($id: String!) {
          node(id: $id) {
            id type title description status metadata createdAt updatedAt
          }
        }`,
        { id: featureId },
      )
      output(data.node)
    } catch (error) {
      outputError(error)
    }
  })
```

- [ ] **Step 2: Verify**

Run: `bun run typecheck && bun run check`

- [ ] **Step 3: Commit**

```bash
git add src/commands/feature.ts
git commit -m "feat: add feature command"
```

---

### Task 7: Task Command

**Files:**
- Create: `src/commands/task.ts`

- [ ] **Step 1: Create task.ts**

```typescript
import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { requireFeature } from '../util/config.ts'
import { resolveDescription } from '../util/description.ts'
import { output, outputError } from '../util/format.ts'

export const taskCommand = new Command('task').description('Manage tasks')

taskCommand
  .command('create')
  .description('Create a new task in the active feature')
  .requiredOption('--title <title>', 'Task title')
  .requiredOption('--description <desc>', 'Description (string or file path)')
  .action(async (opts) => {
    try {
      const featureId = requireFeature()
      const description = await resolveDescription(opts.description)

      const data = await graphql<{ createNode: { id: string } }>(
        `mutation CreateTask($type: String!, $title: String!, $description: String) {
          createNode(type: $type, title: $title, description: $description) {
            id type title description status createdAt updatedAt
          }
        }`,
        { type: 'task', title: opts.title, description },
      )

      await graphql(
        `mutation LinkToFeature($sourceId: String!, $targetId: String!, $relation: String!) {
          createEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation) {
            sourceId targetId relation
          }
        }`,
        { sourceId: data.createNode.id, targetId: featureId, relation: 'part_of' },
      )

      output(data.createNode)
    } catch (error) {
      outputError(error)
    }
  })

taskCommand
  .command('list')
  .description('List tasks in active feature')
  .action(async () => {
    try {
      const featureId = requireFeature()
      const data = await graphql<{
        descendants: Array<{ id: string; type: string }>
      }>(
        `query FeatureTasks($nodeId: String!, $relation: String, $maxDepth: Int) {
          descendants(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
            id title type status createdAt updatedAt
          }
        }`,
        { nodeId: featureId, relation: 'part_of', maxDepth: 1 },
      )
      output(data.descendants.filter((d) => d.type === 'task'))
    } catch (error) {
      outputError(error)
    }
  })

taskCommand
  .command('show')
  .description('Show task details')
  .argument('<id>', 'Task ID')
  .action(async (id: string) => {
    try {
      const data = await graphql<{ node: unknown }>(
        `query GetTask($id: String!) {
          node(id: $id) {
            id type title description status metadata createdAt updatedAt
          }
        }`,
        { id },
      )
      output(data.node)
    } catch (error) {
      outputError(error)
    }
  })

taskCommand
  .command('block')
  .description('Mark a task as blocking another task')
  .argument('<id1>', 'Blocking task ID')
  .argument('<id2>', 'Blocked task ID')
  .action(async (id1: string, id2: string) => {
    try {
      const data = await graphql<{ createEdge: unknown }>(
        `mutation BlockTask($sourceId: String!, $targetId: String!, $relation: String!) {
          createEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation) {
            sourceId targetId relation createdAt
          }
        }`,
        { sourceId: id1, targetId: id2, relation: 'blocks' },
      )
      output(data.createEdge)
    } catch (error) {
      outputError(error)
    }
  })

taskCommand
  .command('unblock')
  .description('Remove block relationship between tasks')
  .argument('<id1>', 'Blocking task ID')
  .argument('<id2>', 'Blocked task ID')
  .action(async (id1: string, id2: string) => {
    try {
      const data = await graphql<{ removeEdge: boolean }>(
        `mutation UnblockTask($sourceId: String!, $targetId: String!, $relation: String!) {
          removeEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation)
        }`,
        { sourceId: id1, targetId: id2, relation: 'blocks' },
      )
      output({ unblocked: data.removeEdge })
    } catch (error) {
      outputError(error)
    }
  })
```

- [ ] **Step 2: Verify**

Run: `bun run typecheck && bun run check`

- [ ] **Step 3: Commit**

```bash
git add src/commands/task.ts
git commit -m "feat: add task command"
```

---

### Task 8: Simplify Tree Command

**Files:**
- Modify: `src/commands/tree.ts`

- [ ] **Step 1: Replace tree.ts with flat command**

```typescript
import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'

export const treeCommand = new Command('tree')
  .description('Show subtree from any entity')
  .argument('<id>', 'Root node ID')
  .option('--depth <n>', 'Max depth', '10')
  .action(async (id: string, opts) => {
    try {
      const data = await graphql<{ subtree: unknown[] }>(
        `query Subtree($nodeId: String!, $maxDepth: Int) {
          subtree(nodeId: $nodeId, maxDepth: $maxDepth) {
            id type title status
          }
        }`,
        { nodeId: id, maxDepth: Number.parseInt(opts.depth, 10) },
      )
      output(data.subtree)
    } catch (error) {
      outputError(error)
    }
  })
```

- [ ] **Step 2: Verify**

Run: `bun run typecheck && bun run check`

- [ ] **Step 3: Commit**

```bash
git add src/commands/tree.ts
git commit -m "refactor: simplify tree command to flat subtree"
```

---

### Task 9: Wire Up index.ts and Delete Old Files

**Files:**
- Modify: `src/index.ts`
- Delete: `src/commands/node.ts`, `src/commands/edge.ts`, `src/commands/register.ts`

- [ ] **Step 1: Replace index.ts**

```typescript
#!/usr/bin/env bun
import { Command } from 'commander'
import { approveCommand } from './commands/approve.ts'
import { clientCommand } from './commands/client.ts'
import { featureCommand } from './commands/feature.ts'
import { projectCommand } from './commands/project.ts'
import { searchCommand } from './commands/search.ts'
import { setupCommand } from './commands/setup.ts'
import { statusCommand } from './commands/status.ts'
import { taskCommand } from './commands/task.ts'
import { treeCommand } from './commands/tree.ts'
import { whoamiCommand } from './commands/whoami.ts'

const program = new Command()
  .name('flowy')
  .description('Project management for AI coding agents')
  .version('0.2.0')

program.addCommand(setupCommand)
program.addCommand(clientCommand)
program.addCommand(projectCommand)
program.addCommand(featureCommand)
program.addCommand(taskCommand)
program.addCommand(statusCommand)
program.addCommand(approveCommand)
program.addCommand(searchCommand)
program.addCommand(treeCommand)
program.addCommand(whoamiCommand)

program.parse()
```

- [ ] **Step 2: Delete old command files**

```bash
rm src/commands/node.ts src/commands/edge.ts src/commands/register.ts
```

- [ ] **Step 3: Verify**

Run: `bun run typecheck && bun run check`
Run: `bun run cli -- --help` — should show new command structure

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire new commands, remove node/edge/register"
```

---

### Task 10: Update Skill File, README, and CLAUDE.md

**Files:**
- Rename: `skills/flowy.md` → `skills/SKILL.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Rename and update skill file**

```bash
mv skills/flowy.md skills/SKILL.md
```

Then update `skills/SKILL.md` with new command examples matching the redesigned CLI. Use `/skill-creator` to review and refine the skill content.

- [ ] **Step 2: Update README.md**

Update the Quick Start, Command Reference, Data Model, and Configuration sections to reflect the new domain-driven commands. Key changes:
- Replace `node create/get/list/update/delete` with `project/feature/task` commands
- Replace `edge create/list/remove` with `task block/unblock`
- Add `flowy setup` replacing `flowy register`
- Add context resolution docs (`~/.config/flowy/`, `FLOWY_PROJECT`, `FLOWY_FEATURE`)
- Update entity hierarchy (client → project → feature → task, no epic)

- [ ] **Step 3: Update CLAUDE.md**

Update architecture section and command list to match new CLI structure.

- [ ] **Step 4: Verify**

Run: `bun run typecheck && bun run check`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: update skill, README, and CLAUDE.md for CLI redesign"
```

---

## Verification (end-to-end)

After all tasks are complete, run the full sequence against a live server:

1. `bun run cli -- setup --mode saas --api-key <key>` — configure
2. `bun run cli -- client set name "Test Client"` — set client name
3. `bun run cli -- project create "Test Project"` — create project
4. `bun run cli -- project set "Test Project"` — map current dir
5. `bun run cli -- feature create --title "Auth" --description "Build auth system"` — create feature
6. `bun run cli -- feature set "Auth"` — set active feature
7. `bun run cli -- task create --title "OAuth" --description "Implement Google OAuth"` — create task
8. `bun run cli -- task list` — shows task under active feature
9. `bun run cli -- tree <project-id> --depth 3` — shows full hierarchy
10. `bun run check && bun run typecheck` — clean
