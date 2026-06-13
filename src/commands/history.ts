import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'
import { AUDIT_LOG } from '../util/operations.ts'

export const historyCommand = new Command('history')
  .description('Show the audit history of a node (newest first)')
  .argument('<id>', 'Node ID')
  .option('--limit <n>', 'Limit results', '50')
  .action(async (id: string, opts) => {
    try {
      const data = await graphql<{ auditLog: unknown[] }>(AUDIT_LOG, {
        nodeId: id,
        limit: opts.limit ? Number.parseInt(opts.limit, 10) : undefined,
      })
      output(data.auditLog)
    } catch (error) {
      outputError(error)
    }
  })
