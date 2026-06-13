import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'
import { APPROVE_NODE } from '../util/operations.ts'

export const approveCommand = new Command('approve')
  .description('Approve a node (must be in pending_review)')
  .argument('<id>', 'Node ID')
  .action(async (id: string) => {
    try {
      const data = await graphql<{ approveNode: unknown }>(APPROVE_NODE, { id })
      output(data.approveNode)
    } catch (error) {
      outputError(error)
    }
  })
