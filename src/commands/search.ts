import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'

export const searchCommand = new Command('search')
  .description('Search nodes by text')
  .argument('<query>', 'Search query')
  .option('--type <type>', 'Filter by node type')
  .option('--status <status>', 'Filter by status')
  .option('--limit <n>', 'Limit results', '50')
  .action(async (query: string, opts) => {
    try {
      const data = await graphql<{ search: unknown[] }>(
        `query Search($query: String!, $type: String, $status: String, $limit: Int) {
          search(query: $query, type: $type, status: $status, limit: $limit) {
            id type title description status
          }
        }`,
        {
          query,
          type: opts.type,
          status: opts.status,
          limit: opts.limit ? Number.parseInt(opts.limit, 10) : undefined,
        },
      )
      output(data.search)
    } catch (error) {
      outputError(error)
    }
  })
