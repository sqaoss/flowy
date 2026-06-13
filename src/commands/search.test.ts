import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let mockGraphql: ReturnType<typeof vi.fn>
let mockOutput: ReturnType<typeof vi.fn>
let mockOutputError: ReturnType<typeof vi.fn>
let stderr: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  mockOutput = vi.fn()
  mockOutputError = vi.fn()
  mockGraphql = vi.fn()
  stderr = vi.spyOn(console, 'error').mockImplementation(() => {})

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

describe('search command', () => {
  test('sends the SearchResult envelope query and outputs nodes + meta', async () => {
    mockGraphql.mockResolvedValue({
      search: {
        nodes: [{ id: 'proj_1', title: 'Auth' }],
        truncated: false,
        total: 1,
      },
    })

    const { searchCommand } = await import('./search.ts')
    await searchCommand.parseAsync(['Auth'], { from: 'user' })

    const query = mockGraphql.mock.calls[0]?.[0] as string
    expect(query).toContain('nodes')
    expect(query).toContain('truncated')
    expect(query).toContain('total')

    expect(mockOutput).toHaveBeenCalledWith({
      nodes: [{ id: 'proj_1', title: 'Auth' }],
      truncated: false,
      total: 1,
    })
    // no truncation warning when not truncated
    expect(stderr).not.toHaveBeenCalled()
  })

  test('renders a clear truncation marker when results are capped', async () => {
    mockGraphql.mockResolvedValue({
      search: {
        nodes: new Array(50).fill({ id: 'x' }),
        truncated: true,
        total: 137,
      },
    })

    const { searchCommand } = await import('./search.ts')
    await searchCommand.parseAsync(['Task'], { from: 'user' })

    const outputArg = mockOutput.mock.calls[0]?.[0] as {
      truncated: boolean
      total: number
    }
    expect(outputArg.truncated).toBe(true)
    expect(outputArg.total).toBe(137)

    expect(stderr).toHaveBeenCalledOnce()
    const warning = stderr.mock.calls[0]?.[0] as string
    expect(warning).toMatch(/truncated/i)
    expect(warning).toContain('50')
    expect(warning).toContain('137')
  })

  test('outputs error when the query fails', async () => {
    mockGraphql.mockRejectedValue(new Error('boom'))
    const { searchCommand } = await import('./search.ts')
    await searchCommand.parseAsync(['Auth'], { from: 'user' })
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
    )
    expect(mockOutput).not.toHaveBeenCalled()
  })
})
