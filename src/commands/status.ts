import { Argument, Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'
import { UPDATE_STATUS } from '../util/operations.ts'

/**
 * The canonical Flowy status vocabulary, mirrored from the server's
 * VALID_STATUSES. Used for client-side `.choices()` validation so an invalid
 * status is rejected before a request is ever sent.
 */
export const STATUS_CHOICES = [
  'draft',
  'pending_review',
  'approved',
  'in_progress',
  'done',
  'blocked',
  'cancelled',
] as const

export const statusCommand = new Command('status')
  .description('Update a node status (shorthand)')
  .argument('<id>', 'Node ID')
  .addArgument(
    new Argument('<status>', 'New status').choices([...STATUS_CHOICES]),
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
