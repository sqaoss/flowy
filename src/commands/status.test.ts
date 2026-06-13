import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let mockGraphql: ReturnType<typeof vi.fn>
let mockOutput: ReturnType<typeof vi.fn>
let mockOutputError: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockOutput = vi.fn()
  mockOutputError = vi.fn()
  mockGraphql = vi.fn().mockResolvedValue({
    updateNode: { id: 'task_1', type: 'task', title: 'T', status: 'done' },
  })

  vi.doMock('../util/format.ts', () => ({
    output: mockOutput,
    outputError: mockOutputError,
  }))
  vi.doMock('../util/client.ts', () => ({
    graphql: mockGraphql,
  }))
})

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('status command', () => {
  test('accepts a valid status and sends the update', async () => {
    const { statusCommand } = await import('./status.ts')
    await statusCommand.parseAsync(['task_1', 'in_progress'], { from: 'user' })

    expect(mockGraphql).toHaveBeenCalledOnce()
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({
      id: 'task_1',
      status: 'in_progress',
    })
    expect(mockOutput).toHaveBeenCalledOnce()
  })

  test('rejects an invalid status client-side (.choices) without a request', async () => {
    const { statusCommand } = await import('./status.ts')
    // Commander throws on an invalid choice; configure it not to exit the
    // process so the test can assert.
    statusCommand.exitOverride()
    statusCommand.configureOutput({ writeErr: () => {}, writeOut: () => {} })

    await expect(
      statusCommand.parseAsync(['task_1', 'bogus'], { from: 'user' }),
    ).rejects.toThrow(/Allowed choices|bogus/i)

    expect(mockGraphql).not.toHaveBeenCalled()
  })

  test('exposes the full canonical status vocabulary as choices', async () => {
    const { statusCommand, STATUS_CHOICES } = await import('./status.ts')
    expect(STATUS_CHOICES).toEqual([
      'draft',
      'pending_review',
      'approved',
      'in_progress',
      'done',
      'blocked',
      'cancelled',
    ])
    const statusArg = statusCommand.registeredArguments.find(
      (a) => a.name() === 'status',
    )
    expect(statusArg?.argChoices).toEqual([...STATUS_CHOICES])
  })
})
