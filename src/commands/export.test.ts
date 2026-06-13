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

const FLOWY_KEY = '__flowy'

/** A server node row carrying its client-key and recorded edges in metadata. */
function srv(
  id: string,
  type: string,
  title: string,
  key: string,
  edges: Array<[string, string]> = [],
  extraMeta: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    type,
    title,
    description: null,
    status: 'draft',
    metadata: JSON.stringify({
      ...extraMeta,
      [FLOWY_KEY]: {
        key,
        edges: edges.map(([target, relation]) => ({ target, relation })),
      },
    }),
  }
}

describe('export command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('exports a no-argument export command (optional output path)', async () => {
    const { exportCommand } = await import('./export.ts')
    expect(exportCommand.name()).toBe('export')
  })

  test('emits a manifest with client-keys and reconstructed edges', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { exportCommand } = await import('./export.ts')

    const project = srv('srv_proj', 'project', 'Demo', 'proj')
    const feature = srv('srv_feat-1', 'feature', 'Auth', 'feat-1', [
      ['proj', 'part_of'],
    ])
    const task1 = srv(
      'srv_task-1',
      'task',
      'Login',
      'task-1',
      [['feat-1', 'part_of']],
      { priority: 'high' },
    )
    const task2 = srv('srv_task-2', 'task', 'Logout', 'task-2', [
      ['feat-1', 'part_of'],
      ['task-1', 'blocks'],
    ])

    vi.mocked(graphql).mockImplementation(async (query: string) => {
      if (query.includes('node(')) return { node: project }
      if (query.includes('descendants')) {
        return { descendants: [feature, task1, task2] }
      }
      return {}
    })

    await exportCommand.parseAsync([], { from: 'user' })

    const manifest = vi.mocked(output).mock.calls.at(-1)?.[0] as {
      version: number
      nodes: Array<Record<string, unknown>>
      edges: Array<Record<string, unknown>>
    }

    expect(manifest.version).toBe(1)
    // 1 project + 1 feature + 2 tasks.
    expect(manifest.nodes).toHaveLength(4)

    const byKey = Object.fromEntries(manifest.nodes.map((n) => [n.key, n]))
    expect(byKey.proj).toMatchObject({ type: 'project', title: 'Demo' })
    // The reserved __flowy namespace is stripped from exported metadata.
    expect(byKey['task-1']).toMatchObject({
      type: 'task',
      parent: 'feat-1',
      metadata: { priority: 'high' },
    })

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

  test('writes to a file when an output path is given', async () => {
    const { graphql } = await import('../util/client.ts')
    const { writeFileSync } = await import('node:fs')
    const { exportCommand } = await import('./export.ts')

    const project = srv('srv_proj', 'project', 'Demo', 'proj')
    vi.mocked(graphql).mockImplementation(async (query: string) => {
      if (query.includes('node(')) return { node: project }
      if (query.includes('descendants')) return { descendants: [] }
      return {}
    })

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
    const feature = srv('srv_feat-1', 'feature', 'Auth', 'feat-1', [
      ['proj', 'part_of'],
    ])
    const task = srv('srv_task-1', 'task', 'Login', 'task-1', [
      ['feat-1', 'part_of'],
    ])

    vi.mocked(graphql).mockImplementation(async (query: string) => {
      if (query.includes('node(')) return { node: project }
      if (query.includes('descendants')) {
        return { descendants: [feature, task] }
      }
      return {}
    })

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
