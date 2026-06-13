import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { requireFeature, resolveProject } from '../util/config.ts'
import { resolveDescription } from '../util/description.ts'
import { output, outputError } from '../util/format.ts'
import {
  ALL_TASKS,
  BLOCK_TASK,
  CLAIM_NODE,
  CREATE_TASK,
  DELETE_NODE,
  LIST_TASKS,
  READY_TASKS,
  SHOW_TASK,
  TASK_DEPS,
  UNBLOCK_TASK,
  UPDATE_NODE,
} from '../util/operations.ts'

/** A task as returned by claimNode/readyTasks selections. */
interface ClaimedTask {
  id: string
  [key: string]: unknown
}

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
      // Validate the active feature BEFORE any write so a bad FLOWY_FEATURE
      // errors cleanly instead of orphaning a node (F24).
      const featureId = requireFeature()
      const description = await resolveDescription({
        description: opts.description,
        descriptionFile: opts.descriptionFile,
      })
      // One atomic call: the server creates the task and its `part_of` edge to
      // the feature together, so a failed link can never leave an orphan.
      const data = await graphql<{ createNode: { id: string } }>(CREATE_TASK, {
        type: 'task',
        title: opts.title,
        description,
        parentId: featureId,
      })
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
        const data = await graphql<{ readyTasks: unknown[] }>(READY_TASKS, {
          projectId: projectId ?? null,
        })
        output(data.readyTasks)
        return
      }

      if (opts.all) {
        const data = await graphql<{ nodes: unknown[] }>(ALL_TASKS, {
          type: 'task',
        })
        output(data.nodes)
        return
      }

      const featureId = requireFeature()
      const data = await graphql<{ descendants: unknown[] }>(LIST_TASKS, {
        nodeId: featureId,
        relation: 'part_of',
        maxDepth: 1,
      })
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
      }>(SHOW_TASK, { id })
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
        UPDATE_NODE,
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
      const data = await graphql<{ deleteNode: boolean }>(DELETE_NODE, { id })
      output({ deleted: data.deleteNode })
    } catch (error) {
      outputError(error)
    }
  })

taskCommand
  .command('claim')
  .description(
    'Atomically claim a task for work (draft/pending_review/approved/blocked → in_progress)',
  )
  .argument('<id>', 'Task ID')
  .action(async (id: string) => {
    try {
      // One atomic compare-and-set on the server: the task flips to in_progress
      // only if it is still claimable, so two agents can never both claim it.
      const data = await graphql<{ claimNode: ClaimedTask | null }>(
        CLAIM_NODE,
        {
          id,
        },
      )
      if (!data.claimNode) {
        // Lost the race or never claimable. Surface a clear message + non-zero
        // exit so a caller (or a wrapping script) can branch on the failure.
        throw new Error(
          `Could not claim ${id}: already claimed by another agent or not claimable (must be draft/pending_review/approved/blocked).`,
        )
      }
      output(data.claimNode)
    } catch (error) {
      outputError(error)
    }
  })

taskCommand
  .command('next')
  .description(
    'Atomically claim the next ready task — picks a ready task and claims it, ' +
      'retrying past any a concurrent agent grabs first',
  )
  .option(
    '--project <id>',
    'Scope to a project (defaults to the active project; omit with --all)',
  )
  .option('--all', 'Consider ready tasks across the whole backlog')
  .action(async (opts) => {
    try {
      const projectId =
        opts.project ?? (opts.all ? undefined : resolveProject()?.id)
      const ready = await graphql<{ readyTasks: ClaimedTask[] }>(READY_TASKS, {
        projectId: projectId ?? null,
      })
      if (ready.readyTasks.length === 0) {
        throw new Error(
          'No ready tasks to claim (none are actionable, or all are blocked/done).',
        )
      }
      // Walk the ready list and claim the first task we win. A null claimNode
      // means a concurrent agent took that one between our read and our claim —
      // skip to the next candidate so parallel agents each get a distinct task.
      for (const candidate of ready.readyTasks) {
        const data = await graphql<{ claimNode: ClaimedTask | null }>(
          CLAIM_NODE,
          { id: candidate.id },
        )
        if (data.claimNode) {
          output(data.claimNode)
          return
        }
      }
      // Every ready candidate was claimed out from under us.
      throw new Error(
        'No claimable task left: every ready task was claimed by another agent. Try again.',
      )
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
      const data = await graphql<{ createEdge: unknown }>(BLOCK_TASK, {
        sourceId: id1,
        targetId: id2,
        relation: 'blocks',
      })
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
      const data = await graphql<{ removeEdge: boolean }>(UNBLOCK_TASK, {
        sourceId: id1,
        targetId: id2,
        relation: 'blocks',
      })
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
        TASK_DEPS,
        { id },
      )
      output({ id, blockedBy: data.blockedBy, blocks: data.blocks })
    } catch (error) {
      outputError(error)
    }
  })
