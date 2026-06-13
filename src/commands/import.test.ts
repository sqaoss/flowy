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

const FLOWY_KEY = '__flowy'

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
          const key = metaOf(variables ?? {})[FLOWY_KEY] as {
            key: string
          }
          return { createNode: { id: `srv_${key.key}` } }
        }
        if (query.includes('updateNode')) {
          return { updateNode: { id: variables?.id } }
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

    // Every manifest node already exists, each carrying its client-key and the
    // edges recorded on the first import (so edges are also already present).
    const existing = (type: string) => {
      const byType: Record<string, Array<Record<string, unknown>>> = {
        project: [node('proj', 'srv_proj')],
        feature: [node('feat-1', 'srv_feat-1', [['proj', 'part_of']])],
        task: [
          node('task-1', 'srv_task-1', [['feat-1', 'part_of']]),
          node('task-2', 'srv_task-2', [
            ['feat-1', 'part_of'],
            ['task-1', 'blocks'],
          ]),
        ],
      }
      return byType[type] ?? []
    }

    vi.mocked(graphql).mockImplementation(
      async (query: string, variables?: Record<string, unknown>) => {
        if (query.includes('nodes(')) {
          return { nodes: existing(variables?.type as string) }
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

    // Every edge already exists (recorded in metadata) → none re-created.
    expect(edges).toHaveLength(0)
  })

  test('does not re-create an edge that already exists server-side', async () => {
    const { graphql } = await import('../util/client.ts')
    const { readFileSync } = await import('node:fs')
    const { importCommand } = await import('./import.ts')

    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(MANIFEST))

    // Nodes exist but only the part_of edges were recorded; the blocks edge
    // was not — so exactly that one edge should be (re)created.
    const existing = (type: string) => {
      const byType: Record<string, Array<Record<string, unknown>>> = {
        project: [node('proj', 'srv_proj')],
        feature: [node('feat-1', 'srv_feat-1', [['proj', 'part_of']])],
        task: [
          node('task-1', 'srv_task-1', [['feat-1', 'part_of']]),
          node('task-2', 'srv_task-2', [['feat-1', 'part_of']]),
        ],
      }
      return byType[type] ?? []
    }

    vi.mocked(graphql).mockImplementation(
      async (query: string, variables?: Record<string, unknown>) => {
        if (query.includes('nodes(')) {
          return { nodes: existing(variables?.type as string) }
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

/**
 * Build a server node row with an embedded `__flowy` key + recorded edges.
 * Edge tuples are `[targetClientKey, relation]` — the same client-key space
 * the manifest uses, so the dedup path can match without id translation.
 */
function node(
  key: string,
  id: string,
  edges: Array<[string, string]> = [],
): Record<string, unknown> {
  return {
    id,
    type: 'x',
    title: key,
    metadata: JSON.stringify({
      [FLOWY_KEY]: {
        key,
        edges: edges.map(([target, relation]) => ({ target, relation })),
      },
    }),
  }
}
