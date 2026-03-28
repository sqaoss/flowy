import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let mockLoadConfig: ReturnType<typeof vi.fn>
let mockSaveConfig: ReturnType<typeof vi.fn>
let mockOutput: ReturnType<typeof vi.fn>
let mockOutputError: ReturnType<typeof vi.fn>
let mockGraphql: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockLoadConfig = vi.fn(() => ({
    mode: 'saas',
    apiUrl: 'https://flowy-ai.fly.dev/graphql',
    apiKey: '',
    client: { name: '' },
    projects: {},
  }))
  mockSaveConfig = vi.fn()
  mockOutput = vi.fn()
  mockOutputError = vi.fn()
  mockGraphql = vi.fn()

  vi.doMock('../util/config.ts', () => ({
    loadConfig: mockLoadConfig,
    saveConfig: mockSaveConfig,
  }))

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

describe('setup command', () => {
  test('exports a command named "setup"', async () => {
    const { setupCommand } = await import('./setup.ts')
    expect(setupCommand.name()).toBe('setup')
  })

  test('has --mode, --email, --api-url, and --api-key options', async () => {
    const { setupCommand } = await import('./setup.ts')
    const optionNames = setupCommand.options.map((o) => o.long)
    expect(optionNames).toContain('--mode')
    expect(optionNames).toContain('--email')
    expect(optionNames).toContain('--api-url')
    expect(optionNames).toContain('--api-key')
  })

  test('--api-key saves the key to config', async () => {
    const { setupCommand } = await import('./setup.ts')

    await setupCommand.parseAsync(['--api-key', 'test-key-123'], {
      from: 'user',
    })

    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-key-123' }),
    )
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-key-123' }),
    )
  })

  test('--mode local --api-url saves the apiUrl and mode to config', async () => {
    const { setupCommand } = await import('./setup.ts')

    await setupCommand.parseAsync(
      ['--mode', 'local', '--api-url', 'http://localhost:4000/graphql'],
      { from: 'user' },
    )

    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'local',
        apiUrl: 'http://localhost:4000/graphql',
      }),
    )
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'local',
        apiUrl: 'http://localhost:4000/graphql',
      }),
    )
  })

  test('--mode saas without --email calls outputError', async () => {
    const { setupCommand } = await import('./setup.ts')

    await setupCommand.parseAsync(['--mode', 'saas'], { from: 'user' })

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('--email') }),
    )
  })

  test('no arguments calls outputError with usage hint', async () => {
    const { setupCommand } = await import('./setup.ts')

    await setupCommand.parseAsync([], { from: 'user' })

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('--mode'),
      }),
    )
  })
})
