import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

describe('tree command', () => {
  test('exports a flat command with id argument and depth option', async () => {
    const { treeCommand } = await import('./tree.ts')
    expect(treeCommand.name()).toBe('tree')
    expect(treeCommand.commands).toHaveLength(0)
  })

  test('exposes a --relation option defaulting to part_of', async () => {
    const { treeCommand } = await import('./tree.ts')
    const relationOpt = treeCommand.options.find((o) => o.long === '--relation')
    expect(relationOpt).toBeDefined()
    expect(relationOpt?.defaultValue).toBe('part_of')
  })

  describe('action', () => {
    beforeEach(() => {
      vi.resetModules()
    })

    afterEach(() => {
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
    })

    test('sends the SUBTREE op with the relation filter and renders depth/relation', async () => {
      const calls: Array<{ query: string; variables: unknown }> = []
      vi.doMock('../util/client.ts', () => ({
        graphql: vi.fn(async (query: string, variables: unknown) => {
          calls.push({ query, variables })
          return {
            subtree: [
              {
                id: 'feat_1',
                type: 'feature',
                title: 'F1',
                status: 'draft',
                parentId: 'proj_1',
                depth: 1,
                relation: 'part_of',
              },
            ],
          }
        }),
      }))
      const outputs: unknown[] = []
      vi.doMock('../util/format.ts', () => ({
        output: vi.fn((data: unknown) => outputs.push(data)),
        outputError: vi.fn(),
      }))

      const { SUBTREE } = await import('../util/operations.ts')
      const { treeCommand } = await import('./tree.ts')
      await treeCommand.parseAsync(['proj_1'], { from: 'user' })

      expect(calls).toHaveLength(1)
      expect(calls[0]!.query).toBe(SUBTREE)
      expect(calls[0]!.variables).toMatchObject({
        nodeId: 'proj_1',
        relation: 'part_of',
      })

      const rendered = outputs[0] as Array<Record<string, unknown>>
      expect(rendered[0]).toMatchObject({
        id: 'feat_1',
        parentId: 'proj_1',
        depth: 1,
        relation: 'part_of',
      })
    })

    test('passes an overridden relation through to the op', async () => {
      const calls: Array<{ variables: unknown }> = []
      vi.doMock('../util/client.ts', () => ({
        graphql: vi.fn(async (_query: string, variables: unknown) => {
          calls.push({ variables })
          return { subtree: [] }
        }),
      }))
      vi.doMock('../util/format.ts', () => ({
        output: vi.fn(),
        outputError: vi.fn(),
      }))

      const { treeCommand } = await import('./tree.ts')
      await treeCommand.parseAsync(['task_1', '--relation', 'blocks'], {
        from: 'user',
      })

      expect(calls[0]!.variables).toMatchObject({
        nodeId: 'task_1',
        relation: 'blocks',
      })
    })
  })
})
