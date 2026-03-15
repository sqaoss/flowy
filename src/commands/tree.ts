import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'

export const treeCommand = new Command('tree').description(
  'Graph traversal commands',
)

treeCommand
  .command('subtree')
  .description('Show node subtree (node + all descendants)')
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

treeCommand
  .command('ancestors')
  .description('Show ancestors of a node')
  .argument('<id>', 'Node ID')
  .option('--depth <n>', 'Max depth', '10')
  .option('--relation <type>', 'Edge relation filter', 'part_of')
  .action(async (id: string, opts) => {
    try {
      const data = await graphql<{ ancestors: unknown[] }>(
        `query Ancestors($nodeId: String!, $relation: String, $maxDepth: Int) {
          ancestors(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
            id type title status
          }
        }`,
        {
          nodeId: id,
          relation: opts.relation,
          maxDepth: Number.parseInt(opts.depth, 10),
        },
      )
      output(data.ancestors)
    } catch (error) {
      outputError(error)
    }
  })

treeCommand
  .command('descendants')
  .description('Show descendants of a node')
  .argument('<id>', 'Node ID')
  .option('--depth <n>', 'Max depth', '10')
  .option('--relation <type>', 'Edge relation filter', 'part_of')
  .action(async (id: string, opts) => {
    try {
      const data = await graphql<{ descendants: unknown[] }>(
        `query Descendants($nodeId: String!, $relation: String, $maxDepth: Int) {
          descendants(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
            id type title status
          }
        }`,
        {
          nodeId: id,
          relation: opts.relation,
          maxDepth: Number.parseInt(opts.depth, 10),
        },
      )
      output(data.descendants)
    } catch (error) {
      outputError(error)
    }
  })
