import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Command } from 'commander'
import { outputError } from '../util/format.ts'
import { createServer } from '../util/mcp.ts'

/**
 * `flowy mcp` — expose the Flowy backlog API as a second agent surface over an
 * MCP server (F23). It is a thin wrapper: every tool maps to the same
 * operations.ts + graphql() the CLI uses, and because graphql() reads the same
 * config, the MCP server talks to whichever backend is configured (local
 * `flowy serve` or the hosted service). stdio is the primary transport — the
 * client (e.g. Claude Code, Claude Desktop) spawns `flowy mcp` and speaks
 * JSON-RPC over stdin/stdout, so nothing is printed to stdout here.
 */
export const mcpCommand = new Command('mcp')
  .description('Run the Flowy MCP server over stdio (a second agent surface)')
  .action(async () => {
    try {
      const server = createServer()
      const transport = new StdioServerTransport()
      await server.connect(transport)
      // The process now lives for the duration of the stdio session; the
      // transport keeps the event loop alive until the client disconnects.
    } catch (error) {
      outputError(error)
    }
  })
