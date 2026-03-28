import { describe, expect, test, vi } from 'vitest'

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
  test('exports a command group named "feature" with subcommands', async () => {
    const { featureCommand } = await import('./feature.ts')
    expect(featureCommand.name()).toBe('feature')
    const subcommandNames = featureCommand.commands.map((c) => c.name())
    expect(subcommandNames).toContain('create')
    expect(subcommandNames).toContain('set')
    expect(subcommandNames).toContain('unset')
    expect(subcommandNames).toContain('list')
    expect(subcommandNames).toContain('show')
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
})
