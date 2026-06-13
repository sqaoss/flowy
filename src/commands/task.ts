import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { requireFeature, resolveProject } from '../util/config.ts'
import { resolveDescription } from '../util/description.ts'
import { output, outputError } from '../util/format.ts'

export const taskCommand = new Command('task').description(
  'Manage tasks in the active feature',
)

taskCommand
  .command('create')
  .description('Create a task in the active feature')
  .requiredOption('--title <title>', 'Task title')
  .option(
    '--description <text>',
    'Task description, used verbatim (never read as a file path)',
  )
  .option(
    '--description-file <path>',
    'Read the task description from a file, or "-" for stdin',
  )
  .action(async (opts) => {
    try {
      const featureId = requireFeature()
      const description = await resolveDescription({
        description: opts.description,
        descriptionFile: opts.descriptionFile,
      })
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
  .option(
    '--ready',
    'Only actionable tasks: not done/cancelled and with zero unfinished blockers',
  )
  .option('--all', 'List every task across the whole backlog')
  .option(
    '--project <id>',
    'Scope --ready/--all to a project (defaults to the active project)',
  )
  .action(async (opts) => {
    try {
      if (opts.ready) {
        const projectId =
          opts.project ?? (opts.all ? undefined : resolveProject()?.id)
        const data = await graphql<{ readyTasks: unknown[] }>(
          `query ReadyTasks($projectId: String) {
            readyTasks(projectId: $projectId) {
              id type title status createdAt
            }
          }`,
          { projectId: projectId ?? null },
        )
        output(data.readyTasks)
        return
      }

      if (opts.all) {
        const data = await graphql<{ nodes: unknown[] }>(
          `query AllTasks($type: String!) {
            nodes(type: $type) {
              id type title status createdAt
            }
          }`,
          { type: 'task' },
        )
        output(data.nodes)
        return
      }

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
  .description('Show task details, including its blockedBy/blocks dependencies')
  .argument('<id>', 'Task ID')
  .action(async (id: string) => {
    try {
      const data = await graphql<{
        node: Record<string, unknown>
        blockedBy: unknown[]
        blocks: unknown[]
      }>(
        `query ShowTask($id: String!) {
          node(id: $id) {
            id type title description status metadata createdAt updatedAt
          }
          blockedBy: edges(nodeId: $id, relation: "blocks", direction: "incoming") {
            id type title status
          }
          blocks: edges(nodeId: $id, relation: "blocks", direction: "outgoing") {
            id type title status
          }
        }`,
        { id },
      )
      output({
        ...data.node,
        blockedBy: data.blockedBy,
        blocks: data.blocks,
      })
    } catch (error) {
      outputError(error)
    }
  })

taskCommand
  .command('update')
  .description('Update a task')
  .argument('<id>', 'Task ID')
  .option('--title <title>', 'New title')
  .option(
    '--description <text>',
    'New description, used verbatim (never read as a file path)',
  )
  .option(
    '--description-file <path>',
    'Read the new description from a file, or "-" for stdin',
  )
  .option('--metadata <json>', 'New metadata as a JSON string')
  .action(async (id: string, opts) => {
    try {
      const variables: Record<string, unknown> = { id }
      if (opts.title != null) variables.title = opts.title
      if (opts.description != null || opts.descriptionFile != null) {
        variables.description = await resolveDescription({
          description: opts.description,
          descriptionFile: opts.descriptionFile,
        })
      }
      if (opts.metadata != null) variables.metadata = opts.metadata
      const data = await graphql<{ updateNode: unknown }>(
        `mutation UpdateNode($id: String!, $title: String, $description: String, $metadata: String) {
          updateNode(id: $id, title: $title, description: $description, metadata: $metadata) {
            id type title description status metadata createdAt updatedAt
          }
        }`,
        variables,
      )
      output(data.updateNode)
    } catch (error) {
      outputError(error)
    }
  })

taskCommand
  .command('delete')
  .description('Delete a task')
  .argument('<id>', 'Task ID')
  .action(async (id: string) => {
    try {
      const data = await graphql<{ deleteNode: boolean }>(
        `mutation DeleteNode($id: String!) {
          deleteNode(id: $id)
        }`,
        { id },
      )
      output({ deleted: data.deleteNode })
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

taskCommand
  .command('deps')
  .description('List a task’s dependencies: what blocks it and what it blocks')
  .argument('<id>', 'Task ID')
  .action(async (id: string) => {
    try {
      const data = await graphql<{ blockedBy: unknown[]; blocks: unknown[] }>(
        `query TaskDeps($id: String!) {
          blockedBy: edges(nodeId: $id, relation: "blocks", direction: "incoming") {
            id type title status
          }
          blocks: edges(nodeId: $id, relation: "blocks", direction: "outgoing") {
            id type title status
          }
        }`,
        { id },
      )
      output({ id, blockedBy: data.blockedBy, blocks: data.blocks })
    } catch (error) {
      outputError(error)
    }
  })
