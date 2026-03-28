import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { requireFeature } from '../util/config.ts'
import { resolveDescription } from '../util/description.ts'
import { output, outputError } from '../util/format.ts'

export const taskCommand = new Command('task').description(
  'Manage tasks in the active feature',
)

taskCommand
  .command('create')
  .description('Create a task in the active feature')
  .requiredOption('--title <title>', 'Task title')
  .requiredOption(
    '--description <desc>',
    'Task description (text or file path)',
  )
  .action(async (opts) => {
    try {
      const featureId = requireFeature()
      const description = await resolveDescription(opts.description)
      const data = await graphql<{ createNode: { id: string } }>(
        `mutation CreateTask($type: String!, $title: String!, $description: String) {
          createNode(type: $type, title: $title, description: $description) {
            id type title description status createdAt
          }
        }`,
        { type: 'task', title: opts.title, description },
      )
      const taskId = data.createNode.id
      await graphql(
        `mutation LinkTask($sourceId: String!, $targetId: String!, $relation: String!) {
          createEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation) {
            sourceId targetId relation
          }
        }`,
        { sourceId: taskId, targetId: featureId, relation: 'part_of' },
      )
      output(data.createNode)
    } catch (error) {
      outputError(error)
    }
  })

taskCommand
  .command('list')
  .description('List tasks in the active feature')
  .action(async () => {
    try {
      const featureId = requireFeature()
      const data = await graphql<{ descendants: unknown[] }>(
        `query ListTasks($nodeId: String!, $relation: String!, $maxDepth: Int) {
          descendants(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
            id type title status createdAt
          }
        }`,
        { nodeId: featureId, relation: 'part_of', maxDepth: 1 },
      )
      const tasks = data.descendants.filter(
        (n: unknown) => (n as { type: string }).type === 'task',
      )
      output(tasks)
    } catch (error) {
      outputError(error)
    }
  })

taskCommand
  .command('show')
  .description('Show task details')
  .argument('<id>', 'Task ID')
  .action(async (id: string) => {
    try {
      const data = await graphql<{ node: unknown }>(
        `query ShowTask($id: String!) {
          node(id: $id) {
            id type title description status metadata createdAt updatedAt
          }
        }`,
        { id },
      )
      output(data.node)
    } catch (error) {
      outputError(error)
    }
  })

taskCommand
  .command('block')
  .description('Mark a task as blocking another')
  .argument('<id1>', 'Blocking task ID')
  .argument('<id2>', 'Blocked task ID')
  .action(async (id1: string, id2: string) => {
    try {
      const data = await graphql<{ createEdge: unknown }>(
        `mutation BlockTask($sourceId: String!, $targetId: String!, $relation: String!) {
          createEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation) {
            sourceId targetId relation createdAt
          }
        }`,
        { sourceId: id1, targetId: id2, relation: 'blocks' },
      )
      output(data.createEdge)
    } catch (error) {
      outputError(error)
    }
  })

taskCommand
  .command('unblock')
  .description('Remove a blocking relationship')
  .argument('<id1>', 'Blocking task ID')
  .argument('<id2>', 'Blocked task ID')
  .action(async (id1: string, id2: string) => {
    try {
      const data = await graphql<{ removeEdge: boolean }>(
        `mutation UnblockTask($sourceId: String!, $targetId: String!, $relation: String!) {
          removeEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation)
        }`,
        { sourceId: id1, targetId: id2, relation: 'blocks' },
      )
      output({ removed: data.removeEdge })
    } catch (error) {
      outputError(error)
    }
  })
