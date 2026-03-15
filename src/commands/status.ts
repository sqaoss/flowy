import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'

export const statusCommand = new Command('status')
  .description('Update a node status (shorthand)')
  .argument('<id>', 'Node ID')
  .argument(
    '<status>',
    'New status (draft, pending_review, approved, in_progress, done, blocked, cancelled)',
  )
  .action(async (id: string, status: string) => {
    try {
      const data = await graphql<{ updateNode: unknown }>(
        `mutation UpdateStatus($id: String!, $status: String) {
          updateNode(id: $id, status: $status) {
            id type title status updatedAt
          }
        }`,
        { id, status },
      )
      output(data.updateNode)
    } catch (error) {
      outputError(error)
    }
  })
