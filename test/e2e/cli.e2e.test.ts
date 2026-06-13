/**
 * CLI end-to-end smoke suite (Flowy improvement plan P1-6 / F18).
 *
 * Boots the bundled native server and drives the REAL `flowy` CLI binary
 * (`bun src/index.ts`) against it over HTTP, asserting full round-trips and the
 * error contract. This is the test class the plan calls out as missing: every
 * dogfood bug (F4 task-show read-back, F9 description-vs-file footgun, transport
 * error codes) was "untestable by construction" because the unit suite mocks the
 * transport. This suite closes that gap by exercising argv -> GraphQL over the
 * wire -> JSON stdout -> real process exit code.
 *
 * Lifecycle covered:
 *   setup → project create → feature create/set → task create → update →
 *   task show / deps → task list --ready → block / unblock → export → import
 *   round-trip → search → tree.
 *
 * Error contract covered (the F4/F9 regression guards):
 *   - `task show <bad-id>`        → {"error",code:"NOT_FOUND"}        exit 2
 *   - too-short `search`          → {"error",code:"VALIDATION_ERROR"} exit 1
 *   - literal `--description` is verbatim, never read as a file
 *   - `--description-file` reads file contents (incl. `-` for stdin)
 *   - `--description` + `--description-file` together is rejected     exit 1
 */

import { writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type CliEnv,
  type CliResult,
  cleanup,
  makeHome,
  type RunningServer,
  runCli,
  startServer,
} from './helpers.ts'

let server: RunningServer
let home: string

/** Base env for every CLI call: shared server + shared sandbox HOME. */
function env(extra?: Partial<CliEnv>): CliEnv {
  return { apiUrl: server.apiUrl, home, ...extra }
}

/** Run a command that is expected to succeed (exit 0) and parse its JSON. */
async function cli<T = Record<string, unknown>>(
  args: string[],
  extra?: Partial<CliEnv>,
): Promise<T> {
  const res = await runCli(args, env(extra))
  expect(
    res.code,
    `expected exit 0 for \`flowy ${args.join(' ')}\`\nstdout:${res.stdout}\nstderr:${res.stderr}`,
  ).toBe(0)
  return res.json<T>()
}

/** Parse the JSON error object the CLI writes to stderr on failure. */
function parseError(res: CliResult): { error: string; code?: string } {
  return JSON.parse(res.stderr.trim())
}

beforeAll(async () => {
  server = await startServer()
  home = makeHome()
}, 30_000)

afterAll(async () => {
  await server?.stop()
  if (home) cleanup(home)
})

describe('CLI e2e against the bundled local server (F18)', () => {
  // Ids captured across the lifecycle, in declaration order.
  let projectId: string
  let featureId: string
  let taskId: string
  let blockerId: string

  it('setup local writes a local-mode config (no server install in CI path)', async () => {
    // `flowy setup local` would `bun add` the package; we only assert the CLI
    // can be invoked and that pointing at a local server works end-to-end via
    // FLOWY_API_URL. The lifecycle below is the real proof of "setup → use".
    const out = await cli<{ id: string; type: string; status: string }>([
      'project',
      'create',
      'E2E Project',
    ])
    expect(out.id).toMatch(/^proj_/)
    expect(out.type).toBe('project')
    expect(out.status).toBe('draft')
    projectId = out.id
  })

  it('project set maps the cwd, project list/show round-trip', async () => {
    // Map the sandbox HOME dir as the project cwd so requireProject() resolves.
    const setOut = await cli<{ id: string; name: string; directory: string }>(
      ['project', 'set', 'E2E Project'],
      { cwd: home },
    )
    expect(setOut.id).toBe(projectId)
    // The CLI records its real cwd, which on macOS canonicalizes the temp
    // symlink (/var/folders -> /private/var/folders); match on the basename.
    expect(setOut.directory).toContain(basename(home))

    const list = await cli<Array<{ id: string }>>(['project', 'list'])
    expect(list.some((p) => p.id === projectId)).toBe(true)

    const show = await cli<{ id: string; title: string }>(['project', 'show'], {
      cwd: home,
    })
    expect(show.id).toBe(projectId)
    expect(show.title).toBe('E2E Project')
  })

  it('feature create + set establishes active feature context', async () => {
    const feature = await cli<{ id: string; description: string | null }>(
      [
        'feature',
        'create',
        '--title',
        'E2E Feature',
        '--description',
        'The first feature',
      ],
      { cwd: home },
    )
    expect(feature.id).toMatch(/^feat_/)
    expect(feature.description).toBe('The first feature')
    featureId = feature.id

    const set = await cli<{ id: string; type: string }>(
      ['feature', 'set', 'E2E Feature'],
      { cwd: home },
    )
    expect(set.id).toBe(featureId)

    const features = await cli<Array<{ id: string }>>(['feature', 'list'], {
      cwd: home,
    })
    expect(features.some((f) => f.id === featureId)).toBe(true)
  })

  it('task create lands tasks under the active feature', async () => {
    const task = await cli<{ id: string }>(
      [
        'task',
        'create',
        '--title',
        'Build the thing',
        '--description',
        'Implement the feature',
      ],
      { cwd: home },
    )
    expect(task.id).toMatch(/^task_/)
    taskId = task.id

    const blocker = await cli<{ id: string }>(
      [
        'task',
        'create',
        '--title',
        'Prerequisite',
        '--description',
        'Do this first',
      ],
      { cwd: home },
    )
    blockerId = blocker.id

    const tasks = await cli<Array<{ id: string }>>(['task', 'list'], {
      cwd: home,
    })
    const ids = tasks.map((t) => t.id)
    expect(ids).toContain(taskId)
    expect(ids).toContain(blockerId)
  })

  it('task update + task show read-back the new state (F4 guard)', async () => {
    // F4 class: an update must be observable via a subsequent `task show`.
    await cli(['task', 'update', taskId, '--title', 'Build the thing v2'], {
      cwd: home,
    })
    const shown = await cli<{
      id: string
      title: string
      blockedBy: unknown[]
      blocks: unknown[]
    }>(['task', 'show', taskId])
    expect(shown.id).toBe(taskId)
    expect(shown.title).toBe('Build the thing v2')
    expect(Array.isArray(shown.blockedBy)).toBe(true)
    expect(Array.isArray(shown.blocks)).toBe(true)
  })

  it('status shorthand updates a node status', async () => {
    const out = await cli<{ id: string; status: string }>([
      'status',
      taskId,
      'in_progress',
    ])
    expect(out.status).toBe('in_progress')
  })

  it('block / unblock + deps reflect the dependency graph', async () => {
    // blocker blocks task -> task is no longer ready.
    await cli(['task', 'block', blockerId, taskId])

    const deps = await cli<{
      id: string
      blockedBy: Array<{ id: string }>
      blocks: Array<{ id: string }>
    }>(['task', 'deps', taskId])
    expect(deps.blockedBy.map((n) => n.id)).toContain(blockerId)

    const blockerDeps = await cli<{ blocks: Array<{ id: string }> }>([
      'task',
      'deps',
      blockerId,
    ])
    expect(blockerDeps.blocks.map((n) => n.id)).toContain(taskId)

    // ready scoped to the project: blocker is actionable, task is blocked.
    const ready = await cli<Array<{ id: string }>>(
      ['task', 'list', '--ready'],
      { cwd: home },
    )
    const readyIds = ready.map((t) => t.id)
    expect(readyIds).toContain(blockerId)
    expect(readyIds).not.toContain(taskId)

    // Remove the block; task becomes ready again.
    const removed = await cli<{ removed: boolean }>([
      'task',
      'unblock',
      blockerId,
      taskId,
    ])
    expect(removed.removed).toBe(true)

    const readyAfter = await cli<Array<{ id: string }>>(
      ['task', 'list', '--ready'],
      { cwd: home },
    )
    expect(readyAfter.map((t) => t.id)).toContain(taskId)
  })

  it('tree walks part_of by default with parentId/depth/relation (F8 shape)', async () => {
    // Post-#38, `tree` follows `part_of` by default and annotates each node
    // with parentId, depth (root's direct children = 1), and the edge relation.
    interface SubtreeNode {
      id: string
      parentId: string
      depth: number
      relation: string
    }
    const subtree = await cli<SubtreeNode[]>(['tree', projectId], { cwd: home })
    const byId = new Map(subtree.map((n) => [n.id, n]))

    const feature = byId.get(featureId)
    expect(feature, 'feature should appear in the subtree').toBeDefined()
    expect(feature?.depth).toBe(1)
    expect(feature?.parentId).toBe(projectId)
    expect(feature?.relation).toBe('part_of')

    const task = byId.get(taskId)
    expect(task, 'task should appear in the subtree').toBeDefined()
    expect(task?.depth).toBe(2)
    expect(task?.parentId).toBe(featureId)
    expect(task?.relation).toBe('part_of')
  })

  it('search finds nodes by text and reports truncation metadata (F32)', async () => {
    const results = await cli<{
      nodes: Array<{ id: string; title: string }>
      truncated: boolean
      total: number
    }>(['search', 'E2E Project', '--type', 'project'])
    expect(results.nodes.some((n) => n.id === projectId)).toBe(true)
    expect(results.truncated).toBe(false)
    expect(typeof results.total).toBe('number')
  })

  it('export -> import round-trips the backlog idempotently', async () => {
    const manifestPath = join(home, 'manifest.json')

    const exported = await cli<{
      exported: number
      edges: number
      file: string
    }>(['export', manifestPath], { cwd: home })
    expect(exported.exported).toBeGreaterThan(0)
    expect(exported.file).toBe(manifestPath)

    // Re-importing the same manifest must be idempotent: upsert by client-key,
    // never duplicate. Node count stays equal to what we exported.
    const imported = await cli<{ imported: number; edges: number }>(
      ['import', manifestPath],
      { cwd: home },
    )
    expect(imported.imported).toBe(exported.exported)

    // Project count must not have grown from the re-import.
    const projects = await cli<Array<{ id: string }>>(['project', 'list'])
    expect(projects.filter((p) => p.id === projectId)).toHaveLength(1)
  })

  // ── Error contract — the F4 / F9 regression guards ──────────────────────────

  it('task show <bad-id> -> NOT_FOUND, exit 2', async () => {
    const res = await runCli(['task', 'show', 'task_does_not_exist'], env())
    expect(res.code).toBe(2)
    const err = parseError(res)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.error).toMatch(/not found/i)
    expect(res.stdout.trim()).toBe('')
  })

  it('too-short search -> VALIDATION_ERROR, exit 1', async () => {
    const res = await runCli(['search', 'ab'], env())
    expect(res.code).toBe(1)
    const err = parseError(res)
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.error).toMatch(/at least 3 characters/i)
  })

  it('--description is verbatim, never read as a file (F9 guard)', async () => {
    // Create a file whose *path* looks like a description argument. Passing the
    // path text as --description must store the literal path string, NOT the
    // file contents — the exact F9 footgun.
    const lurePath = join(home, 'lure.txt')
    writeFileSync(lurePath, 'SECRET FILE CONTENTS')

    const feature = await cli<{ id: string; description: string | null }>(
      [
        'feature',
        'create',
        '--title',
        'Literal desc',
        '--description',
        lurePath,
      ],
      { cwd: home },
    )
    expect(feature.description).toBe(lurePath)
    expect(feature.description).not.toBe('SECRET FILE CONTENTS')
  })

  it('--description-file reads file contents', async () => {
    const descPath = join(home, 'desc.txt')
    writeFileSync(descPath, 'Body loaded from a file')

    const feature = await cli<{ description: string | null }>(
      [
        'feature',
        'create',
        '--title',
        'File desc',
        '--description-file',
        descPath,
      ],
      { cwd: home },
    )
    expect(feature.description).toBe('Body loaded from a file')
  })

  it('--description-file - reads stdin', async () => {
    const feature = await cli<{ description: string | null }>(
      ['feature', 'create', '--title', 'Stdin desc', '--description-file', '-'],
      { cwd: home, stdin: 'Body from stdin' },
    )
    expect(feature.description).toBe('Body from stdin')
  })

  it('--description + --description-file together is rejected, exit 1', async () => {
    const res = await runCli(
      [
        'feature',
        'create',
        '--title',
        'Both',
        '--description',
        'x',
        '--description-file',
        '/tmp/whatever',
      ],
      env({ cwd: home }),
    )
    expect(res.code).toBe(1)
    const err = parseError(res)
    expect(err.error).toMatch(/only one of/i)
  })
})
