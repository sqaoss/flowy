import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'
import { SUBTREE } from '../util/operations.ts'

export const treeCommand = new Command('tree')
  .description('Show subtree from any entity')
  .argument('<id>', 'Root node ID')
  .option('--depth <n>', 'Max depth', '10')
  .action(async (id: string, opts) => {
    try {
      const data = await graphql<{ subtree: unknown[] }>(SUBTREE, {
        nodeId: id,
        maxDepth: Number.parseInt(opts.depth, 10),
      })
      output(data.subtree)
    } catch (error) {
      outputError(error)
    }
  })
