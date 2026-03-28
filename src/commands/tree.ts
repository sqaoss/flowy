import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'

export const treeCommand = new Command('tree')
  .description('Show subtree from any entity')
  .argument('<id>', 'Root node ID')
  .option('--depth <n>', 'Max depth', '10')
  .action(async (id: string, opts) => {
    try {
      const data = await graphql<{ subtree: unknown[] }>(
        `query Subtree($nodeId: String!, $maxDepth: Int) {
          subtree(nodeId: $nodeId, maxDepth: $maxDepth) {
            id type title status
          }
        }`,
        { nodeId: id, maxDepth: Number.parseInt(opts.depth, 10) },
      )
      output(data.subtree)
    } catch (error) {
      outputError(error)
    }
  })
