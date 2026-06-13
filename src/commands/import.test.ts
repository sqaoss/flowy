import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../util/client.ts', () => ({
  graphql: vi.fn(),
}))

vi.mock('../util/format.ts', () => ({
  output: vi.fn(),
  outputError: vi.fn(),
}))

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}))

const FLOWY_KEY_FIELD = '__flowyKey'

/** A small representative backlog: 1 project, 1 feature, 2 tasks, 1 blocks edge. */
const MANIFEST = {
  version: 1,
  nodes: [
    { key: 'proj', type: 'project', title: 'Demo' },
    { key: 'feat-1', type: 'feature', title: 'Auth', parent: 'proj' },
    {
      key: 'task-1',
      type: 'task',
      title: 'Login',
      parent: 'feat-1',
      status: 'draft',
      metadata: { priority: 'high' },
    },
    { key: 'task-2', type: 'task', title: 'Logout', parent: 'feat-1' },
  ],
  edges: [{ source: 'task-2', target: 'task-1', relation: 'blocks' }],
}

/** Parse the JSON metadata string a CLI mutation sent to the server. */
function metaOf(variables: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(variables.metadata as string)
}

describe('import command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('exports a single-argument import command', async () => {
    const { importCommand } = await import('./import.ts')
    expect(importCommand.name()).toBe('import')
  })

  test('metadata carries only the client-key, never edge data', async () => {
    const { graphql } = await import('../util/client.ts')
    const { readFileSync } = await import('node:fs')
    const { importCommand } = await import('./import.ts')

    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(MANIFEST))
    vi.mocked(graphql).mockImplementation(async (query: string) => {
      if (query.includes('nodes(')) return { nodes: [] }
      if (query.includes('createNode')) return { createNode: { id: 'srv_x' } }
      if (query.includes('createEdge')) return { createEdge: {} }
      return {}
    })

    await importCommand.parseAsync(['manifest.json'], { from: 'user' })

    for (const [q, vars] of vi.mocked(graphql).mock.calls) {
      if (!q.includes('createNode')) continue
      const meta = metaOf(vars ?? {})
      expect(typeof meta[FLOWY_KEY_FIELD]).toBe('string')
      // The dropped edge-stamp hack must not reappear in any form.
      expect(meta.__flowy).toBeUndefined()
      expect(meta.edges).toBeUndefined()
    }
  })

  test('first run: creates every node and edge, returns a key→id map', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { readFileSync } = await import('node:fs')
    const { importCommand } = await import('./import.ts')

    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(MANIFEST))

    // No existing nodes for any type.
    vi.mocked(graphql).mockImplementation(
      async (query: string, variables?: Record<string, unknown>) => {
        if (query.includes('nodes(')) return { nodes: [] }
        if (query.includes('createNode')) {
          const key = metaOf(variables ?? {})[FLOWY_KEY_FIELD] as string
          return { createNode: { id: `srv_${key}` } }
        }
        if (query.includes('updateNode')) {
          return { updateNode: { id: variables?.id } }
        }
        // No pre-existing nodes → the existing-edges query should never run.
        if (query.includes('edges(')) {
          throw new Error(
            'edges() should not be queried with no existing nodes',
          )
        }
        if (query.includes('createEdge')) return { createEdge: {} }
        return {}
      },
    )

    await importCommand.parseAsync(['manifest.json'], { from: 'user' })

    const calls = vi.mocked(graphql).mock.calls
    const created = calls.filter(([q]) => q.includes('createNode'))
    const updated = calls.filter(([q]) => q.includes('updateNode'))
    const edges = calls.filter(([q]) => q.includes('createEdge'))

    // All 4 nodes created, none updated on a clean import.
    expect(created).toHaveLength(4)
    expect(updated).toHaveLength(0)

    // part_of edges (feat-1→proj, task-1→feat-1, task-2→feat-1) + 1 blocks = 4.
    expect(edges).toHaveLength(4)

    // Output is the key→id map.
    const mapArg = vi.mocked(output).mock.calls.at(-1)?.[0] as {
      map: Record<string, string>
    }
    expect(mapArg.map).toMatchObject({
      proj: 'srv_proj',
      'feat-1': 'srv_feat-1',
      'task-1': 'srv_task-1',
      'task-2': 'srv_task-2',
    })
  })

  test('re-import is idempotent: existing keys update, never re-create', async () => {
    const { graphql } = await import('../util/client.ts')
    const { readFileSync } = await import('node:fs')
    const { importCommand } = await import('./import.ts')

    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(MANIFEST))

    // Every manifest node already exists (carrying its client-key), and every
    // edge already exists in the real edge model.
    const existing = (type: string) => {
      const byType: Record<string, Array<Record<string, unknown>>> = {
        project: [node('proj', 'srv_proj')],
        feature: [node('feat-1', 'srv_feat-1')],
        task: [node('task-1', 'srv_task-1'), node('task-2', 'srv_task-2')],
      }
      return byType[type] ?? []
    }
    const edgesOf = (nodeId: string, relation: string) =>
      EDGES.filter((e) => e.source === nodeId && e.relation === relation).map(
        (e) => ({ id: e.target }),
      )

    vi.mocked(graphql).mockImplementation(
      async (query: string, variables?: Record<string, unknown>) => {
        if (query.includes('nodes(')) {
          return { nodes: existing(variables?.type as string) }
        }
        if (query.includes('edges(')) {
          return {
            edges: edgesOf(
              variables?.nodeId as string,
              variables?.relation as string,
            ),
          }
        }
        if (query.includes('updateNode')) {
          return { updateNode: { id: variables?.id } }
        }
        if (query.includes('createNode')) {
          throw new Error('createNode must not be called on re-import')
        }
        if (query.includes('createEdge')) return { createEdge: {} }
        return {}
      },
    )

    await importCommand.parseAsync(['manifest.json'], { from: 'user' })

    const calls = vi.mocked(graphql).mock.calls
    const created = calls.filter(([q]) => q.includes('createNode'))
    const updated = calls.filter(([q]) => q.includes('updateNode'))
    const edges = calls.filter(([q]) => q.includes('createEdge'))

    // No node is re-created; all four are updated in place.
    expect(created).toHaveLength(0)
    expect(updated).toHaveLength(4)

    // Every edge already exists in the edge model → none re-created.
    expect(edges).toHaveLength(0)
  })

  test('does not re-create an edge that already exists in the edge model', async () => {
    const { graphql } = await import('../util/client.ts')
    const { readFileSync } = await import('node:fs')
    const { importCommand } = await import('./import.ts')

    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(MANIFEST))

    const existing = (type: string) => {
      const byType: Record<string, Array<Record<string, unknown>>> = {
        project: [node('proj', 'srv_proj')],
        feature: [node('feat-1', 'srv_feat-1')],
        task: [node('task-1', 'srv_task-1'), node('task-2', 'srv_task-2')],
      }
      return byType[type] ?? []
    }
    // Only the part_of edges exist server-side; the blocks edge does not.
    const present = EDGES.filter((e) => e.relation === 'part_of')
    const edgesOf = (nodeId: string, relation: string) =>
      present
        .filter((e) => e.source === nodeId && e.relation === relation)
        .map((e) => ({ id: e.target }))

    vi.mocked(graphql).mockImplementation(
      async (query: string, variables?: Record<string, unknown>) => {
        if (query.includes('nodes(')) {
          return { nodes: existing(variables?.type as string) }
        }
        if (query.includes('edges(')) {
          return {
            edges: edgesOf(
              variables?.nodeId as string,
              variables?.relation as string,
            ),
          }
        }
        if (query.includes('updateNode')) {
          return { updateNode: { id: variables?.id } }
        }
        if (query.includes('createEdge')) return { createEdge: {} }
        return {}
      },
    )

    await importCommand.parseAsync(['manifest.json'], { from: 'user' })

    const edges = vi
      .mocked(graphql)
      .mock.calls.filter(([q]) => q.includes('createEdge'))
    expect(edges).toHaveLength(1)
    expect(edges[0]?.[1]).toMatchObject({
      sourceId: 'srv_task-2',
      targetId: 'srv_task-1',
      relation: 'blocks',
    })
  })

  test('reports a parse error via outputError', async () => {
    const { outputError } = await import('../util/format.ts')
    const { readFileSync } = await import('node:fs')
    const { importCommand } = await import('./import.ts')

    vi.mocked(readFileSync).mockReturnValue('{not json')

    await importCommand.parseAsync(['bad.json'], { from: 'user' })

    expect(outputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/invalid json/i),
      }),
    )
  })
})

/** The full edge set this manifest implies, expressed in SERVER ids. */
const EDGES = [
  { source: 'srv_feat-1', target: 'srv_proj', relation: 'part_of' },
  { source: 'srv_task-1', target: 'srv_feat-1', relation: 'part_of' },
  { source: 'srv_task-2', target: 'srv_feat-1', relation: 'part_of' },
  { source: 'srv_task-2', target: 'srv_task-1', relation: 'blocks' },
]

/**
 * Build an existing server node row stamped with its client-key only.
 * Edges are NOT stored in metadata — they live in the real edge model and are
 * mocked separately via the `edges()` query.
 */
function node(key: string, id: string): Record<string, unknown> {
  return {
    id,
    type: 'x',
    title: key,
    metadata: JSON.stringify({ [FLOWY_KEY_FIELD]: key }),
  }
}
