import { describe, expect, test, vi } from 'vitest'

vi.mock('../util/config.ts', () => ({
  requireFeature: vi.fn(() => {
    throw new Error(
      'No active feature. Run "flowy feature set <name-or-id>" or set FLOWY_FEATURE.',
    )
  }),
}))

vi.mock('../util/client.ts', () => ({
  graphql: vi.fn(),
}))

vi.mock('../util/format.ts', () => ({
  output: vi.fn(),
  outputError: vi.fn(),
}))

describe('task command', () => {
  test('exports a command group with 5 subcommands', async () => {
    const { taskCommand } = await import('./task.ts')
    expect(taskCommand.name()).toBe('task')
    expect(taskCommand.commands).toHaveLength(5)

    const names = taskCommand.commands.map((c) => c.name())
    expect(names).toContain('create')
    expect(names).toContain('list')
    expect(names).toContain('show')
    expect(names).toContain('block')
    expect(names).toContain('unblock')
  })

  test('create calls outputError when no active feature', async () => {
    const { taskCommand } = await import('./task.ts')
    const { outputError } = await import('../util/format.ts')

    const createCmd = taskCommand.commands.find((c) => c.name() === 'create')!
    await createCmd.parseAsync(['--title', 'Test', '--description', 'desc'], {
      from: 'user',
    })

    expect(outputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('No active feature'),
      }),
    )
  })
})
