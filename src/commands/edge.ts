import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'

export const edgeCommand = new Command('edge').description(
  'Manage edges between nodes',
)

edgeCommand
  .command('create')
  .description('Create an edge between two nodes')
  .requiredOption('--source <id>', 'Source node ID')
  .requiredOption('--target <id>', 'Target node ID')
  .requiredOption(
    '--relation <rel>',
    'Relation type (part_of, depends_on, blocks, informs)',
  )
  .action(async (opts) => {
    try {
      const data = await graphql<{ createEdge: unknown }>(
        `mutation CreateEdge($sourceId: String!, $targetId: String!, $relation: String!) {
          createEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation) {
            sourceId targetId relation createdAt
          }
        }`,
        {
          sourceId: opts.source,
          targetId: opts.target,
          relation: opts.relation,
        },
      )
      output(data.createEdge)
    } catch (error) {
      outputError(error)
    }
  })

edgeCommand
  .command('remove')
  .description('Remove an edge')
  .requiredOption('--source <id>', 'Source node ID')
  .requiredOption('--target <id>', 'Target node ID')
  .requiredOption('--relation <rel>', 'Relation type')
  .action(async (opts) => {
    try {
      const data = await graphql<{ removeEdge: boolean }>(
        `mutation RemoveEdge($sourceId: String!, $targetId: String!, $relation: String!) {
          removeEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation)
        }`,
        {
          sourceId: opts.source,
          targetId: opts.target,
          relation: opts.relation,
        },
      )
      output({ removed: data.removeEdge })
    } catch (error) {
      outputError(error)
    }
  })

edgeCommand
  .command('list')
  .description('List edges')
  .option('--node <id>', 'Filter by node ID')
  .option('--relation <rel>', 'Filter by relation type')
  .action(async (opts) => {
    try {
      const data = await graphql<{ edges: unknown[] }>(
        `query ListEdges($nodeId: String, $relation: String) {
          edges(nodeId: $nodeId, relation: $relation) {
            sourceId targetId relation createdAt
          }
        }`,
        {
          nodeId: opts.node,
          relation: opts.relation,
        },
      )
      output(data.edges)
    } catch (error) {
      outputError(error)
    }
  })
