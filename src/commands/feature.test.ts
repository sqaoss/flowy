import { beforeEach, describe, expect, test, vi } from 'vitest'

const mockUpdateProjectConfig = vi.fn()

vi.mock('../util/config.ts', () => ({
  requireProject: vi.fn(() => {
    throw new Error(
      'No active project. Run "flowy project set <name>" or set FLOWY_PROJECT.',
    )
  }),
  resolveFeature: vi.fn(() => null),
  updateProjectConfig: (...args: unknown[]) => mockUpdateProjectConfig(...args),
}))

vi.mock('../util/client.ts', () => ({
  graphql: vi.fn(),
}))

vi.mock('../util/format.ts', () => ({
  output: vi.fn(),
  outputError: vi.fn(),
}))

describe('feature command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('exports a command group named "feature" with subcommands', async () => {
    const { featureCommand } = await import('./feature.ts')
    expect(featureCommand.name()).toBe('feature')
    const subcommandNames = featureCommand.commands.map((c) => c.name())
    expect(subcommandNames).toContain('create')
    expect(subcommandNames).toContain('set')
    expect(subcommandNames).toContain('unset')
    expect(subcommandNames).toContain('list')
    expect(subcommandNames).toContain('show')
    expect(subcommandNames).toContain('update')
    expect(subcommandNames).toContain('delete')
  })

  test('create calls outputError when no active project', async () => {
    const { featureCommand } = await import('./feature.ts')
    const { outputError } = await import('../util/format.ts')

    const createCmd = featureCommand.commands.find((c) => c.name() === 'create')
    expect(createCmd).toBeDefined()
    await createCmd?.parseAsync(['--title', 'Test', '--description', 'Desc'], {
      from: 'user',
    })

    expect(outputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('No active project'),
      }),
    )
  })

  test('create issues ONE createNode-with-parent call under the active project', async () => {
    const { graphql } = await import('../util/client.ts')
    const { requireProject } = await import('../util/config.ts')
    const { output } = await import('../util/format.ts')
    const { featureCommand } = await import('./feature.ts')

    vi.mocked(requireProject).mockReturnValueOnce({
      id: 'proj_active',
      name: 'active',
    })
    vi.mocked(graphql).mockResolvedValueOnce({
      createNode: { id: 'feat_new', title: 'Test' },
    })

    const createCmd = featureCommand.commands.find((c) => c.name() === 'create')
    await createCmd?.parseAsync(['--title', 'Test', '--description', 'Desc'], {
      from: 'user',
    })

    expect(graphql).toHaveBeenCalledTimes(1)
    const [query, variables] = vi.mocked(graphql).mock.calls[0]!
    expect(query).toContain('createNode')
    expect(query).toContain('parentId')
    expect(variables).toMatchObject({
      type: 'feature',
      title: 'Test',
      description: 'Desc',
      parentId: 'proj_active',
    })
    expect(output).toHaveBeenCalledWith({ id: 'feat_new', title: 'Test' })
  })

  test('create validates the project BEFORE any write (no createNode on bad project)', async () => {
    const { graphql } = await import('../util/client.ts')
    const { featureCommand } = await import('./feature.ts')

    const createCmd = featureCommand.commands.find((c) => c.name() === 'create')
    await createCmd?.parseAsync(['--title', 'Test', '--description', 'Desc'], {
      from: 'user',
    })

    expect(graphql).not.toHaveBeenCalled()
  })

  test('unset calls updateProjectConfig to delete activeFeature', async () => {
    const { featureCommand } = await import('./feature.ts')
    const { output } = await import('../util/format.ts')

    const unsetCmd = featureCommand.commands.find((c) => c.name() === 'unset')
    expect(unsetCmd).toBeDefined()
    await unsetCmd?.parseAsync([], { from: 'user' })

    expect(mockUpdateProjectConfig).toHaveBeenCalledWith(expect.any(Function))

    // Verify the updater function deletes activeFeature
    const updater = mockUpdateProjectConfig.mock.calls[0]?.[0]
    const fakeProject = { id: 'p1', name: 'Test', activeFeature: 'feat_abc' }
    updater(fakeProject)
    expect(fakeProject.activeFeature).toBeUndefined()

    expect(output).toHaveBeenCalledWith({ activeFeature: null })
  })

  test('update sends updateNode with only the title when title-only', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { featureCommand } = await import('./feature.ts')

    vi.mocked(graphql).mockResolvedValueOnce({
      updateNode: { id: 'feat_1', title: 'New' },
    })

    const updateCmd = featureCommand.commands.find(
      (c) => c.name() === 'update',
    )!
    await updateCmd.parseAsync(['feat_1', '--title', 'New'], { from: 'user' })

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('updateNode'),
      {
        id: 'feat_1',
        title: 'New',
      },
    )
    expect(output).toHaveBeenCalledWith({ id: 'feat_1', title: 'New' })
  })

  test('update sends updateNode with only the description when description-only', async () => {
    const { graphql } = await import('../util/client.ts')
    const { featureCommand } = await import('./feature.ts')

    vi.mocked(graphql).mockResolvedValueOnce({ updateNode: { id: 'feat_1' } })

    const updateCmd = featureCommand.commands.find(
      (c) => c.name() === 'update',
    )!
    await updateCmd.parseAsync(['feat_1', '--description', 'Body'], {
      from: 'user',
    })

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('updateNode'),
      {
        id: 'feat_1',
        description: 'Body',
      },
    )
  })

  test('update sends updateNode with only the metadata when metadata-only', async () => {
    const { graphql } = await import('../util/client.ts')
    const { featureCommand } = await import('./feature.ts')

    vi.mocked(graphql).mockResolvedValueOnce({ updateNode: { id: 'feat_1' } })

    const updateCmd = featureCommand.commands.find(
      (c) => c.name() === 'update',
    )!
    await updateCmd.parseAsync(['feat_1', '--metadata', '{"k":"v"}'], {
      from: 'user',
    })

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('updateNode'),
      {
        id: 'feat_1',
        metadata: '{"k":"v"}',
      },
    )
  })

  test('update sends updateNode with combined fields', async () => {
    const { graphql } = await import('../util/client.ts')
    const { featureCommand } = await import('./feature.ts')

    vi.mocked(graphql).mockResolvedValueOnce({ updateNode: { id: 'feat_1' } })

    const updateCmd = featureCommand.commands.find(
      (c) => c.name() === 'update',
    )!
    await updateCmd.parseAsync(
      ['feat_1', '--title', 'New', '--description', 'Body', '--metadata', '{}'],
      { from: 'user' },
    )

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('updateNode'),
      {
        id: 'feat_1',
        title: 'New',
        description: 'Body',
        metadata: '{}',
      },
    )
  })

  test('delete sends deleteNode mutation', async () => {
    const { graphql } = await import('../util/client.ts')
    const { output } = await import('../util/format.ts')
    const { featureCommand } = await import('./feature.ts')

    vi.mocked(graphql).mockResolvedValueOnce({ deleteNode: true })

    const deleteCmd = featureCommand.commands.find(
      (c) => c.name() === 'delete',
    )!
    await deleteCmd.parseAsync(['feat_1'], { from: 'user' })

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('deleteNode'),
      {
        id: 'feat_1',
      },
    )
    expect(output).toHaveBeenCalledWith({ deleted: true })
  })

  test('delete surfaces CONFLICT via outputError with its code', async () => {
    const { graphql } = await import('../util/client.ts')
    const { outputError } = await import('../util/format.ts')
    const { featureCommand } = await import('./feature.ts')

    const conflict = Object.assign(new Error('has children'), {
      code: 'CONFLICT',
    })
    vi.mocked(graphql).mockRejectedValueOnce(conflict)

    const deleteCmd = featureCommand.commands.find(
      (c) => c.name() === 'delete',
    )!
    await deleteCmd.parseAsync(['feat_1'], { from: 'user' })

    expect(outputError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CONFLICT' }),
    )
  })

  test('delete surfaces NOT_FOUND via outputError with its code', async () => {
    const { graphql } = await import('../util/client.ts')
    const { outputError } = await import('../util/format.ts')
    const { featureCommand } = await import('./feature.ts')

    const notFound = Object.assign(new Error('Node feat_x not found'), {
      code: 'NOT_FOUND',
    })
    vi.mocked(graphql).mockRejectedValueOnce(notFound)

    const deleteCmd = featureCommand.commands.find(
      (c) => c.name() === 'delete',
    )!
    await deleteCmd.parseAsync(['feat_x'], { from: 'user' })

    expect(outputError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    )
  })
})
