import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// `flowy mcp` is a thin command: it builds the MCP server (whose tools are
// unit-tested in util/mcp.test.ts) and connects it over a stdio transport.
// Here we only assert the command wires the server to stdio and reports
// transport failures through the shared error path.

let mockConnect: ReturnType<typeof vi.fn>
let mockCreateServer: ReturnType<typeof vi.fn>
let mockOutputError: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockConnect = vi.fn().mockResolvedValue(undefined)
  mockCreateServer = vi.fn(() => ({ connect: mockConnect }))
  mockOutputError = vi.fn()

  vi.doMock('../util/mcp.ts', () => ({
    createServer: mockCreateServer,
  }))
  vi.doMock('../util/format.ts', () => ({
    output: vi.fn(),
    outputError: mockOutputError,
  }))
  vi.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: class {},
  }))
})

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('mcp command', () => {
  test('connects the server over a stdio transport', async () => {
    const { mcpCommand } = await import('./mcp.ts')
    await mcpCommand.parseAsync([], { from: 'user' })

    expect(mockCreateServer).toHaveBeenCalledOnce()
    expect(mockConnect).toHaveBeenCalledOnce()
    expect(mockOutputError).not.toHaveBeenCalled()
  })

  test('reports a transport failure through outputError', async () => {
    mockConnect.mockRejectedValue(new Error('stdio boom'))
    const { mcpCommand } = await import('./mcp.ts')
    await mcpCommand.parseAsync([], { from: 'user' })
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'stdio boom' }),
    )
  })
})
