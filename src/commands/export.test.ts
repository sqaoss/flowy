import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../util/client.ts', () => ({
  graphql: vi.fn(),
}))

vi.mock('../util/config.ts', () => ({
  requireProject: vi.fn(() => ({ id: 'srv_proj', name: 'Demo' })),
}))

vi.mock('../util/format.ts', () => ({
  output: vi.fn(),
  outputError: vi.fn(),
}))

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
}))

const FLOWY_KEY_FIELD = '__flowyKey'

/** A server node row stamped with its client-key only (no edges in metadata). */
function srv(
  id: string,
  type: string,
  title: string,
  key: string,
  extraMeta: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    type,
    title,
    description: null,
    status: 'draft',
    metadata: JSON.stringify({ ...extraMeta, [FLOWY_KEY_FIELD]: key }),
  }
}

/**
 * Build a graphql mock backed by a node set and a real-edge-model edge set.
 * `edges` are SERVER-id triples; the `edges()` query returns connected nodes
 * (with metadata) so export can resolve their client-keys.
 */
function mockServer(
  graphql: ReturnType<typeof vi.fn>,
  project: Record<string, unknown>,
  descendants: Array<Record<string, unknown>>,
  edges: Array<{ source: string; target: string; relation: string }> = [],
) {
  const byId = new Map<string, Record<string, unknown>>()
  for (const n of [project, ...descendants]) byId.set(n.id as string, n)
  graphql.mockImplementation(
    async (query: string, variables?: Record<string, unknown>) => {
      if (query.includes('descendants')) return { descendants }
      if (query.includes('node(')) return { node: project }
      if (query.includes('edges(')) {
        const out = edges
          .filter(
            (e) =>
              e.source === variables?.nodeId &&
              e.relation === variables?.relation,
          )
          .map((e) => {
            const n = byId.get(e.target)
            return { id: e.target, metadata: n?.metadata ?? null }
          })
        return { edges: out }
      }
      return {}
    },
  )
}

describe('export command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('exports a no-argument export command (optional output path)', async () => {
    const { exportCommand } = await import('./export.ts')
    expect(exportCommand.name()).toBe('export')
  })

  test('emits a manifest with client-keys and edges read from the edge model', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { exportCommand } = await import('./export.ts')

    const project = srv('srv_proj', 'project', 'Demo', 'proj')
    const feature = srv('srv_feat-1', 'feature', 'Auth', 'feat-1')
    const task1 = srv('srv_task-1', 'task', 'Login', 'task-1', {
      priority: 'high',
    })
    const task2 = srv('srv_task-2', 'task', 'Logout', 'task-2')

    mockServer(
      vi.mocked(graphql),
      project,
      [feature, task1, task2],
      [
        { source: 'srv_feat-1', target: 'srv_proj', relation: 'part_of' },
        { source: 'srv_task-1', target: 'srv_feat-1', relation: 'part_of' },
        { source: 'srv_task-2', target: 'srv_feat-1', relation: 'part_of' },
        { source: 'srv_task-2', target: 'srv_task-1', relation: 'blocks' },
      ],
    )

    await exportCommand.parseAsync([], { from: 'user' })

    const manifest = vi.mocked(output).mock.calls.at(-1)?.[0] as {
      version: number
      nodes: Array<Record<string, unknown>>
      edges: Array<Record<string, unknown>>
    }

    expect(manifest.version).toBe(1)
    expect(manifest.nodes).toHaveLength(4)

    const byKey = Object.fromEntries(manifest.nodes.map((n) => [n.key, n]))
    expect(byKey.proj).toMatchObject({ type: 'project', title: 'Demo' })
    // The reserved client-key field is stripped from exported user metadata.
    expect(byKey['task-1']).toMatchObject({
      type: 'task',
      parent: 'feat-1',
      metadata: { priority: 'high' },
    })
    expect(
      (byKey['task-1'] as { metadata: Record<string, unknown> }).metadata
        .__flowyKey,
    ).toBeUndefined()

    // 3 part_of edges + 1 blocks edge, expressed in client-keys.
    expect(manifest.edges).toHaveLength(4)
    expect(manifest.edges).toContainEqual({
      source: 'task-2',
      target: 'task-1',
      relation: 'blocks',
    })
    expect(manifest.edges).toContainEqual({
      source: 'feat-1',
      target: 'proj',
      relation: 'part_of',
    })
  })

  test('captures an externally-created (task block) edge, not just import edges', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { exportCommand } = await import('./export.ts')

    const project = srv('srv_proj', 'project', 'Demo', 'proj')
    const task1 = srv('srv_task-1', 'task', 'A', 'task-1')
    const task2 = srv('srv_task-2', 'task', 'B', 'task-2')

    mockServer(
      vi.mocked(graphql),
      project,
      [task1, task2],
      [
        { source: 'srv_task-1', target: 'srv_proj', relation: 'part_of' },
        { source: 'srv_task-2', target: 'srv_proj', relation: 'part_of' },
        // This edge exists only in the edge model (e.g. created by `task block`),
        // never recorded in any node metadata — export must still capture it.
        { source: 'srv_task-1', target: 'srv_task-2', relation: 'blocks' },
      ],
    )

    await exportCommand.parseAsync([], { from: 'user' })

    const manifest = vi.mocked(output).mock.calls.at(-1)?.[0] as {
      edges: Array<Record<string, unknown>>
    }
    expect(manifest.edges).toContainEqual({
      source: 'task-1',
      target: 'task-2',
      relation: 'blocks',
    })
  })

  test('writes to a file when an output path is given', async () => {
    const { graphql } = await import('../util/client.ts')
    const { writeFileSync } = await import('node:fs')
    const { exportCommand } = await import('./export.ts')

    const project = srv('srv_proj', 'project', 'Demo', 'proj')
    mockServer(vi.mocked(graphql), project, [])

    await exportCommand.parseAsync(['out.json'], { from: 'user' })

    expect(writeFileSync).toHaveBeenCalledWith(
      'out.json',
      expect.stringContaining('"version": 1'),
    )
  })

  test('export output round-trips: it is a valid import manifest', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { parseManifest, serializeManifest } = await import(
      '../util/manifest.ts'
    )
    const { exportCommand } = await import('./export.ts')

    const project = srv('srv_proj', 'project', 'Demo', 'proj')
    const feature = srv('srv_feat-1', 'feature', 'Auth', 'feat-1')
    const task = srv('srv_task-1', 'task', 'Login', 'task-1')

    mockServer(
      vi.mocked(graphql),
      project,
      [feature, task],
      [
        { source: 'srv_feat-1', target: 'srv_proj', relation: 'part_of' },
        { source: 'srv_task-1', target: 'srv_feat-1', relation: 'part_of' },
        { source: 'srv_task-1', target: 'srv_feat-1', relation: 'blocks' },
      ],
    )

    await exportCommand.parseAsync([], { from: 'user' })

    const manifest = vi.mocked(output).mock.calls.at(-1)?.[0]
    // Re-parsing the exported manifest through the import parser must succeed
    // and preserve structure — the export→import contract.
    const reparsed = parseManifest(serializeManifest(manifest as never))
    expect(reparsed).toEqual(manifest)
  })

  test('reports errors via outputError', async () => {
    const { graphql } = await import('../util/client.ts')
    const { outputError } = await import('../util/format.ts')
    const { exportCommand } = await import('./export.ts')

    vi.mocked(graphql).mockRejectedValueOnce(new Error('boom'))

    await exportCommand.parseAsync([], { from: 'user' })

    expect(outputError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
    )
  })
})
