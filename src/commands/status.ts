import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'
import { UPDATE_STATUS } from '../util/operations.ts'

export const statusCommand = new Command('status')
  .description('Update a node status (shorthand)')
  .argument('<id>', 'Node ID')
  .argument(
    '<status>',
    'New status (draft, pending_review, approved, in_progress, done, blocked, cancelled)',
  )
  .action(async (id: string, status: string) => {
    try {
      const data = await graphql<{ updateNode: unknown }>(UPDATE_STATUS, {
        id,
        status,
      })
      output(data.updateNode)
    } catch (error) {
      outputError(error)
    }
  })
