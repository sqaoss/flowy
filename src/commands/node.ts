import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'

export const nodeCommand = new Command('node').description('Manage work nodes')

nodeCommand
  .command('create')
  .description('Create a new node')
  .requiredOption(
    '--type <type>',
    'Node type (client, project, feature, epic, task)',
  )
  .requiredOption('--title <title>', 'Node title')
  .option('--description <desc>', 'Node description')
  .option('--status <status>', 'Initial status')
  .option('--metadata <json>', 'Metadata as JSON string')
  .action(async (opts) => {
    try {
      const data = await graphql<{ createNode: unknown }>(
        `mutation CreateNode($type: String!, $title: String!, $description: String, $status: String, $metadata: String) {
          createNode(type: $type, title: $title, description: $description, status: $status, metadata: $metadata) {
            id type title description status metadata createdAt updatedAt
          }
        }`,
        {
          type: opts.type,
          title: opts.title,
          description: opts.description,
          status: opts.status,
          metadata: opts.metadata,
        },
      )
      output(data.createNode)
    } catch (error) {
      outputError(error)
    }
  })

nodeCommand
  .command('get')
  .description('Get a node by ID')
  .requiredOption('--id <id>', 'Node ID')
  .action(async (opts) => {
    try {
      const data = await graphql<{ node: unknown }>(
        `query GetNode($id: String!) {
          node(id: $id) {
            id type title description status metadata createdAt updatedAt
          }
        }`,
        { id: opts.id },
      )
      output(data.node)
    } catch (error) {
      outputError(error)
    }
  })

nodeCommand
  .command('list')
  .description('List nodes')
  .option('--type <type>', 'Filter by type')
  .option('--status <status>', 'Filter by status')
  .option('--limit <n>', 'Limit results', '50')
  .option('--offset <n>', 'Offset results', '0')
  .action(async (opts) => {
    try {
      const data = await graphql<{ nodes: unknown[] }>(
        `query ListNodes($type: String, $status: String, $limit: Int, $offset: Int) {
          nodes(type: $type, status: $status, limit: $limit, offset: $offset) {
            id type title description status metadata createdAt updatedAt
          }
        }`,
        {
          type: opts.type,
          status: opts.status,
          limit: Number.parseInt(opts.limit, 10),
          offset: Number.parseInt(opts.offset, 10),
        },
      )
      output(data.nodes)
    } catch (error) {
      outputError(error)
    }
  })

nodeCommand
  .command('update')
  .description('Update a node')
  .requiredOption('--id <id>', 'Node ID')
  .option('--title <title>', 'New title')
  .option('--description <desc>', 'New description')
  .option('--status <status>', 'New status')
  .option('--metadata <json>', 'New metadata as JSON string')
  .action(async (opts) => {
    try {
      const data = await graphql<{ updateNode: unknown }>(
        `mutation UpdateNode($id: String!, $title: String, $description: String, $status: String, $metadata: String) {
          updateNode(id: $id, title: $title, description: $description, status: $status, metadata: $metadata) {
            id type title description status metadata createdAt updatedAt
          }
        }`,
        {
          id: opts.id,
          title: opts.title,
          description: opts.description,
          status: opts.status,
          metadata: opts.metadata,
        },
      )
      output(data.updateNode)
    } catch (error) {
      outputError(error)
    }
  })

nodeCommand
  .command('delete')
  .description('Delete a node')
  .requiredOption('--id <id>', 'Node ID')
  .action(async (opts) => {
    try {
      const data = await graphql<{ deleteNode: boolean }>(
        `mutation DeleteNode($id: String!) {
          deleteNode(id: $id)
        }`,
        { id: opts.id },
      )
      output({ deleted: data.deleteNode })
    } catch (error) {
      outputError(error)
    }
  })
