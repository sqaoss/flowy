import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'
import { SEARCH } from '../util/operations.ts'

interface SearchResult {
  nodes: unknown[]
  truncated: boolean
  total: number
}

export const searchCommand = new Command('search')
  .description('Search nodes by text')
  .argument('<query>', 'Search query')
  .option('--type <type>', 'Filter by node type')
  .option('--status <status>', 'Filter by status')
  .option('--limit <n>', 'Limit results', '50')
  .action(async (query: string, opts) => {
    try {
      const limit = opts.limit ? Number.parseInt(opts.limit, 10) : undefined
      const data = await graphql<{ search: SearchResult }>(SEARCH, {
        query,
        type: opts.type,
        status: opts.status,
        limit,
      })
      const { nodes, truncated, total } = data.search
      // The truncation marker rides in the JSON envelope so callers can detect
      // it programmatically; when capped we also warn on stderr so it is not
      // silently lost in a human-read terminal.
      output({ nodes, truncated, total })
      if (truncated) {
        console.error(
          `Results truncated: showing ${nodes.length} of ${total} matches. Raise --limit to see more.`,
        )
      }
    } catch (error) {
      outputError(error)
    }
  })
