import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../util/config.ts', () => ({
  requireFeature: vi.fn(() => {
    throw new Error(
      'No active feature. Run "flowy feature set <name-or-id>" or set FLOWY_FEATURE.',
    )
  }),
  resolveProject: vi.fn(() => ({ id: 'proj_active', name: 'active' })),
}))

vi.mock('../util/client.ts', () => ({
  graphql: vi.fn(),
}))

vi.mock('../util/format.ts', () => ({
  output: vi.fn(),
  outputError: vi.fn(),
}))

describe('task command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('exports a command group with 8 subcommands', async () => {
    const { taskCommand } = await import('./task.ts')
    expect(taskCommand.name()).toBe('task')
    expect(taskCommand.commands).toHaveLength(8)

    const names = taskCommand.commands.map((c) => c.name())
    expect(names).toContain('create')
    expect(names).toContain('list')
    expect(names).toContain('show')
    expect(names).toContain('block')
    expect(names).toContain('unblock')
    expect(names).toContain('update')
    expect(names).toContain('delete')
    expect(names).toContain('deps')
  })

  test('create exposes both --description and --description-file options', async () => {
    const { taskCommand } = await import('./task.ts')
    const createCmd = taskCommand.commands.find((c) => c.name() === 'create')!
    const optionFlags = createCmd.options.map((o) => o.long)
    expect(optionFlags).toContain('--description')
    expect(optionFlags).toContain('--description-file')
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

  test('show calls outputError when graphql throws network error', async () => {
    const { graphql } = await import('../util/client.ts')
    const { outputError } = await import('../util/format.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockRejectedValueOnce(new TypeError('fetch failed'))

    const showCmd = taskCommand.commands.find((c) => c.name() === 'show')!
    await showCmd.parseAsync(['task_abc123'], { from: 'user' })

    expect(outputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'fetch failed',
      }),
    )
  })

  test('show calls outputError when graphql returns error response', async () => {
    const { graphql } = await import('../util/client.ts')
    const { outputError } = await import('../util/format.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockRejectedValueOnce(new Error('Node not found'))

    const showCmd = taskCommand.commands.find((c) => c.name() === 'show')!
    await showCmd.parseAsync(['task_nonexistent'], { from: 'user' })

    expect(outputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Node not found',
      }),
    )
  })

  test('update sends updateNode with only the title when title-only', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockResolvedValueOnce({
      updateNode: { id: 'task_1', title: 'New' },
    })

    const updateCmd = taskCommand.commands.find((c) => c.name() === 'update')!
    await updateCmd.parseAsync(['task_1', '--title', 'New'], { from: 'user' })

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('updateNode'),
      { id: 'task_1', title: 'New' },
    )
    expect(output).toHaveBeenCalledWith({ id: 'task_1', title: 'New' })
  })

  test('update sends updateNode with only the description when description-only', async () => {
    const { graphql } = await import('../util/client.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockResolvedValueOnce({
      updateNode: { id: 'task_1' },
    })

    const updateCmd = taskCommand.commands.find((c) => c.name() === 'update')!
    await updateCmd.parseAsync(['task_1', '--description', 'Body'], {
      from: 'user',
    })

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('updateNode'),
      {
        id: 'task_1',
        description: 'Body',
      },
    )
  })

  test('update sends updateNode with only the metadata when metadata-only', async () => {
    const { graphql } = await import('../util/client.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockResolvedValueOnce({
      updateNode: { id: 'task_1' },
    })

    const updateCmd = taskCommand.commands.find((c) => c.name() === 'update')!
    await updateCmd.parseAsync(['task_1', '--metadata', '{"k":"v"}'], {
      from: 'user',
    })

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('updateNode'),
      {
        id: 'task_1',
        metadata: '{"k":"v"}',
      },
    )
  })

  test('update sends updateNode with combined fields', async () => {
    const { graphql } = await import('../util/client.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockResolvedValueOnce({
      updateNode: { id: 'task_1' },
    })

    const updateCmd = taskCommand.commands.find((c) => c.name() === 'update')!
    await updateCmd.parseAsync(
      ['task_1', '--title', 'New', '--description', 'Body', '--metadata', '{}'],
      { from: 'user' },
    )

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('updateNode'),
      {
        id: 'task_1',
        title: 'New',
        description: 'Body',
        metadata: '{}',
      },
    )
  })

  test('update surfaces NOT_FOUND via outputError with its code', async () => {
    const { graphql } = await import('../util/client.ts')
    const { outputError } = await import('../util/format.ts')
    const { taskCommand } = await import('./task.ts')

    const notFound = Object.assign(new Error('Node task_x not found'), {
      code: 'NOT_FOUND',
    })
    vi.mocked(graphql).mockRejectedValueOnce(notFound)

    const updateCmd = taskCommand.commands.find((c) => c.name() === 'update')!
    await updateCmd.parseAsync(['task_x', '--title', 'New'], { from: 'user' })

    expect(outputError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    )
  })

  test('delete sends deleteNode mutation', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockResolvedValueOnce({ deleteNode: true })

    const deleteCmd = taskCommand.commands.find((c) => c.name() === 'delete')!
    await deleteCmd.parseAsync(['task_1'], { from: 'user' })

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('deleteNode'),
      {
        id: 'task_1',
      },
    )
    expect(output).toHaveBeenCalledWith({ deleted: true })
  })

  test('delete surfaces CONFLICT via outputError with its code', async () => {
    const { graphql } = await import('../util/client.ts')
    const { outputError } = await import('../util/format.ts')
    const { taskCommand } = await import('./task.ts')

    const conflict = Object.assign(new Error('has children'), {
      code: 'CONFLICT',
    })
    vi.mocked(graphql).mockRejectedValueOnce(conflict)

    const deleteCmd = taskCommand.commands.find((c) => c.name() === 'delete')!
    await deleteCmd.parseAsync(['task_1'], { from: 'user' })

    expect(outputError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CONFLICT' }),
    )
  })

  test('delete surfaces NOT_FOUND via outputError with its code', async () => {
    const { graphql } = await import('../util/client.ts')
    const { outputError } = await import('../util/format.ts')
    const { taskCommand } = await import('./task.ts')

    const notFound = Object.assign(new Error('Node task_x not found'), {
      code: 'NOT_FOUND',
    })
    vi.mocked(graphql).mockRejectedValueOnce(notFound)

    const deleteCmd = taskCommand.commands.find((c) => c.name() === 'delete')!
    await deleteCmd.parseAsync(['task_x'], { from: 'user' })

    expect(outputError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    )
  })

  test('show includes blockedBy and blocks in its output', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockResolvedValueOnce({
      node: { id: 'task_a', title: 'A', status: 'draft' },
      blockedBy: [{ id: 'task_b', title: 'B', status: 'in_progress' }],
      blocks: [{ id: 'task_c', title: 'C', status: 'draft' }],
    })

    const showCmd = taskCommand.commands.find((c) => c.name() === 'show')!
    await showCmd.parseAsync(['task_a'], { from: 'user' })

    expect(output).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task_a',
        blockedBy: [{ id: 'task_b', title: 'B', status: 'in_progress' }],
        blocks: [{ id: 'task_c', title: 'C', status: 'draft' }],
      }),
    )
  })

  test('show queries edges for both directions of blocks', async () => {
    const { graphql } = await import('../util/client.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockResolvedValueOnce({
      node: { id: 'task_a', title: 'A', status: 'draft' },
      blockedBy: [],
      blocks: [],
    })

    const showCmd = taskCommand.commands.find((c) => c.name() === 'show')!
    await showCmd.parseAsync(['task_a'], { from: 'user' })

    const [query, variables] = vi.mocked(graphql).mock.calls[0]!
    expect(query).toContain('blockedBy')
    expect(query).toContain('blocks')
    expect(variables).toMatchObject({ id: 'task_a' })
  })

  test('deps lists blockedBy and blocks for a task', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockResolvedValueOnce({
      blockedBy: [{ id: 'task_b', title: 'B', status: 'draft' }],
      blocks: [{ id: 'task_c', title: 'C', status: 'done' }],
    })

    const depsCmd = taskCommand.commands.find((c) => c.name() === 'deps')!
    await depsCmd.parseAsync(['task_a'], { from: 'user' })

    expect(output).toHaveBeenCalledWith({
      id: 'task_a',
      blockedBy: [{ id: 'task_b', title: 'B', status: 'draft' }],
      blocks: [{ id: 'task_c', title: 'C', status: 'done' }],
    })
  })

  test('deps surfaces errors via outputError', async () => {
    const { graphql } = await import('../util/client.ts')
    const { outputError } = await import('../util/format.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockRejectedValueOnce(new Error('Node task_a not found'))

    const depsCmd = taskCommand.commands.find((c) => c.name() === 'deps')!
    await depsCmd.parseAsync(['task_a'], { from: 'user' })

    expect(outputError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Node task_a not found' }),
    )
  })

  test('list --ready queries readyTasks and prints them', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockResolvedValueOnce({
      readyTasks: [{ id: 'task_x', title: 'X', status: 'draft' }],
    })

    const listCmd = taskCommand.commands.find((c) => c.name() === 'list')!
    await listCmd.parseAsync(['--ready'], { from: 'user' })

    const [query] = vi.mocked(graphql).mock.calls[0]!
    expect(query).toContain('readyTasks')
    expect(output).toHaveBeenCalledWith([
      { id: 'task_x', title: 'X', status: 'draft' },
    ])
  })

  test('list --ready --project scopes readyTasks to the given project', async () => {
    const { graphql } = await import('../util/client.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockResolvedValueOnce({ readyTasks: [] })

    const listCmd = taskCommand.commands.find((c) => c.name() === 'list')!
    await listCmd.parseAsync(['--ready', '--project', 'proj_42'], {
      from: 'user',
    })

    const [query, variables] = vi.mocked(graphql).mock.calls[0]!
    expect(query).toContain('readyTasks')
    expect(variables).toMatchObject({ projectId: 'proj_42' })
  })

  test('list --all lists every task node', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { taskCommand } = await import('./task.ts')

    vi.mocked(graphql).mockResolvedValueOnce({
      nodes: [
        { id: 'task_1', type: 'task', title: 'One', status: 'draft' },
        { id: 'task_2', type: 'task', title: 'Two', status: 'done' },
      ],
    })

    const listCmd = taskCommand.commands.find((c) => c.name() === 'list')!
    await listCmd.parseAsync(['--all'], { from: 'user' })

    const [query, variables] = vi.mocked(graphql).mock.calls[0]!
    expect(query).toContain('nodes')
    expect(variables).toMatchObject({ type: 'task' })
    expect(output).toHaveBeenCalledWith([
      { id: 'task_1', type: 'task', title: 'One', status: 'draft' },
      { id: 'task_2', type: 'task', title: 'Two', status: 'done' },
    ])
  })
})
