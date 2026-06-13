import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

describe('history command', () => {
  test('exports a flat command with id argument and limit option', async () => {
    const { historyCommand } = await import('./history.ts')
    expect(historyCommand.name()).toBe('history')
    expect(historyCommand.commands).toHaveLength(0)
    const limitOpt = historyCommand.options.find((o) => o.long === '--limit')
    expect(limitOpt).toBeDefined()
  })

  describe('action', () => {
    beforeEach(() => {
      vi.resetModules()
    })

    afterEach(() => {
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
    })

    test('sends the AUDIT_LOG op with the node id and prints results', async () => {
      const calls: Array<{ query: string; variables: unknown }> = []
      vi.doMock('../util/client.ts', () => ({
        graphql: vi.fn(async (query: string, variables: unknown) => {
          calls.push({ query, variables })
          return {
            auditLog: [
              {
                id: 'audit_1',
                action: 'create',
                field: null,
                oldValue: null,
                newValue: null,
                snapshot: '{"id":"task_1"}',
                changedBy: 'local',
                createdAt: '2026-06-13T00:00:00.000Z',
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

      const { AUDIT_LOG } = await import('../util/operations.ts')
      const { historyCommand } = await import('./history.ts')
      await historyCommand.parseAsync(['task_1'], { from: 'user' })

      expect(calls).toHaveLength(1)
      expect(calls[0]!.query).toBe(AUDIT_LOG)
      expect(calls[0]!.variables).toMatchObject({ nodeId: 'task_1' })

      const rendered = outputs[0] as Array<Record<string, unknown>>
      expect(rendered[0]).toMatchObject({ id: 'audit_1', action: 'create' })
    })

    test('passes --limit through to the op', async () => {
      const calls: Array<{ variables: unknown }> = []
      vi.doMock('../util/client.ts', () => ({
        graphql: vi.fn(async (_query: string, variables: unknown) => {
          calls.push({ variables })
          return { auditLog: [] }
        }),
      }))
      vi.doMock('../util/format.ts', () => ({
        output: vi.fn(),
        outputError: vi.fn(),
      }))

      const { historyCommand } = await import('./history.ts')
      await historyCommand.parseAsync(['task_1', '--limit', '5'], {
        from: 'user',
      })

      expect(calls[0]!.variables).toMatchObject({ nodeId: 'task_1', limit: 5 })
    })

    test('reports errors via outputError', async () => {
      vi.doMock('../util/client.ts', () => ({
        graphql: vi.fn(async () => {
          throw new Error('boom')
        }),
      }))
      const errors: unknown[] = []
      vi.doMock('../util/format.ts', () => ({
        output: vi.fn(),
        outputError: vi.fn((e: unknown) => errors.push(e)),
      }))

      const { historyCommand } = await import('./history.ts')
      await historyCommand.parseAsync(['task_1'], { from: 'user' })
      expect(errors).toHaveLength(1)
    })
  })
})
