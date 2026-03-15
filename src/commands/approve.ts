import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'

export const approveCommand = new Command('approve')
  .description('Approve a node (must be in pending_review)')
  .argument('<id>', 'Node ID')
  .action(async (id: string) => {
    try {
      const data = await graphql<{ approveNode: unknown }>(
        `mutation ApproveNode($id: String!) {
          approveNode(id: $id) { id type title status updatedAt }
        }`,
        { id },
      )
      output(data.approveNode)
    } catch (error) {
      outputError(error)
    }
  })
