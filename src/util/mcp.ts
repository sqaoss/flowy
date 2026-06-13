/**
 * Flowy MCP server surface (F23) — a SECOND agent surface alongside the CLI.
 *
 * This is a deliberately thin wrapper over the exact same pieces the CLI uses:
 *   - the canonical GraphQL operations in `operations.ts`
 *   - the single fetch client `graphql()` in `client.ts`
 *   - the mode-aware context/config helpers in `config.ts`
 *
 * No new queries are inlined and no server change is required: an MCP tool is
 * just a named, schema'd entry point that resolves context (active project /
 * feature, like the CLI does) and calls `graphql(OP, vars)`. Because `graphql()`
 * reads `getConfig()`, the MCP server talks to whichever backend the user has
 * configured — local `flowy serve` or the hosted service — with zero extra
 * wiring (mode-aware by construction).
 *
 * Coded domain errors (NOT_FOUND / VALIDATION_ERROR / SUBSCRIPTION_* / …) thrown
 * by `graphql()` are surfaced cleanly as MCP tool errors so the calling LLM can
 * read and self-correct, rather than the protocol layer crashing.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { graphql } from './client.ts'
import {
  requireFeature,
  requireProject,
  resolveFeature,
  resolveProject,
} from './config.ts'
import {
  ALL_TASKS,
  APPROVE_NODE,
  AUDIT_LOG,
  BLOCK_TASK,
  CLAIM_NODE,
  CREATE_NODE,
  CREATE_PROJECT,
  CREATE_TASK,
  DELETE_NODE,
  DESCENDANTS,
  EXPORT_DESCENDANTS,
  EXPORT_EDGES,
  EXPORT_PROJECT,
  GET_NODE,
  GET_PROJECT,
  LIST_PROJECTS,
  LIST_TASKS,
  READY_TASKS,
  SEARCH,
  SHOW_TASK,
  SUBTREE,
  TASK_DEPS,
  UNBLOCK_TASK,
  UPDATE_NODE,
  UPDATE_STATUS,
  WHOAMI,
} from './operations.ts'

const VERSION = '1.14.0'

/** A node id as returned by claim/ready selections. */
interface NodeRef {
  id: string
  [key: string]: unknown
}

/** The shape every MCP tool handler returns (a subset of the SDK's result). */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/** A registry entry: name + (title/description/inputSchema/annotations) + handler. */
export interface ToolDef {
  name: string
  config: {
    title: string
    description: string
    inputSchema: z.ZodRawShape
    annotations?: {
      readOnlyHint?: boolean
      destructiveHint?: boolean
      idempotentHint?: boolean
      openWorldHint?: boolean
    }
  }
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
}

/** Wrap structured data as a successful tool result (JSON text + structured). */
function ok(data: unknown): ToolResult {
  const structured =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : { result: data }
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: structured,
  }
}

/** Wrap a message as an MCP tool error (isError), preserving any coded class. */
function fail(message: string, code?: string): ToolResult {
  const text = code ? `${message} (code: ${code})` : message
  return { content: [{ type: 'text', text }], isError: true }
}

/**
 * Run a handler body, translating thrown errors — especially the coded ones
 * `graphql()` raises (NOT_FOUND / VALIDATION_ERROR / NETWORK_ERROR / …) — into
 * clean MCP tool errors instead of letting the transport blow up. This mirrors
 * the CLI's `outputError`, minus the process.exit.
 */
async function run(body: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await body()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const rawCode =
      error instanceof Error ? (error as { code?: unknown }).code : undefined
    const code = typeof rawCode === 'string' ? rawCode : undefined
    return fail(message, code)
  }
}

const optionalDescription = z
  .string()
  .optional()
  .describe('Optional Markdown description / acceptance criteria.')

/**
 * The single source of truth for the MCP surface. Each tool is a thin mapping
 * to an `operations.ts` constant + a `graphql()` call, mirroring the CLI
 * command of the same name. Exported so unit tests can assert the mapping
 * without booting a protocol transport.
 */
export const tools: ToolDef[] = [
  // --- Projects --------------------------------------------------------------
  {
    name: 'flowy_project_create',
    config: {
      title: 'Create project',
      description:
        'Create a new top-level project (the root of a backlog: project → feature → task).',
      inputSchema: { name: z.string().describe('Project name / title.') },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    handler: (args) =>
      run(async () => {
        const data = await graphql<{ createNode: unknown }>(CREATE_PROJECT, {
          type: 'project',
          title: args.name,
        })
        return ok(data.createNode)
      }),
  },
  {
    name: 'flowy_project_update',
    config: {
      title: 'Update project',
      description:
        'Update a project in place: change its title, description, and/or metadata. Defaults to the active project when id is omitted.',
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe('Project id. Defaults to the active project.'),
        title: z.string().optional().describe('New title.'),
        description: optionalDescription,
        metadata: z
          .string()
          .optional()
          .describe('New metadata as a JSON string.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    handler: (args) =>
      run(async () => {
        const id = (args.id as string | undefined) ?? requireProject().id
        const vars: Record<string, unknown> = { id }
        if (args.title != null) vars.title = args.title
        if (args.description != null) vars.description = args.description
        if (args.metadata != null) vars.metadata = args.metadata
        const data = await graphql<{ updateNode: unknown }>(UPDATE_NODE, vars)
        return ok(data.updateNode)
      }),
  },
  {
    name: 'flowy_project_delete',
    config: {
      title: 'Delete project',
      description:
        'Delete a project and its edges. Defaults to the active project when id is omitted. This is destructive.',
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe('Project id. Defaults to the active project.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    handler: (args) =>
      run(async () => {
        const id = (args.id as string | undefined) ?? requireProject().id
        const data = await graphql<{ deleteNode: boolean }>(DELETE_NODE, { id })
        return ok({ deleted: data.deleteNode })
      }),
  },
  {
    name: 'flowy_project_show',
    config: {
      title: 'Show project',
      description:
        'Fetch a single project by id (defaults to the active project): title, description, status, metadata, timestamps.',
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe('Project id. Defaults to the active project.'),
      },
      annotations: { readOnlyHint: true },
    },
    handler: (args) =>
      run(async () => {
        const id = (args.id as string | undefined) ?? requireProject().id
        const data = await graphql<{ node: unknown }>(GET_PROJECT, { id })
        return ok(data.node)
      }),
  },
  {
    name: 'flowy_project_list',
    config: {
      title: 'List projects',
      description: 'List every project with its display fields and status.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    handler: () =>
      run(async () => {
        const data = await graphql<{ nodes: unknown[] }>(LIST_PROJECTS, {
          type: 'project',
        })
        return ok(data.nodes)
      }),
  },

  // --- Features --------------------------------------------------------------
  {
    name: 'flowy_feature_create',
    config: {
      title: 'Create feature',
      description:
        'Create a feature under a project, linked atomically (no orphan). Defaults to the active project; pass projectId to override.',
      inputSchema: {
        title: z.string().describe('Feature title.'),
        description: optionalDescription,
        projectId: z
          .string()
          .optional()
          .describe('Parent project id. Defaults to the active project.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    handler: (args) =>
      run(async () => {
        const parentId =
          (args.projectId as string | undefined) ?? requireProject().id
        const data = await graphql<{ createNode: unknown }>(CREATE_NODE, {
          type: 'feature',
          title: args.title,
          description: args.description ?? null,
          parentId,
        })
        return ok(data.createNode)
      }),
  },
  {
    name: 'flowy_feature_update',
    config: {
      title: 'Update feature',
      description:
        'Update a feature in place (title/description/metadata). Defaults to the active feature when id is omitted.',
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe('Feature id. Defaults to the active feature.'),
        title: z.string().optional().describe('New title.'),
        description: optionalDescription,
        metadata: z
          .string()
          .optional()
          .describe('New metadata as a JSON string.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    handler: (args) =>
      run(async () => {
        const id = (args.id as string | undefined) ?? resolveFeature()
        if (!id) return fail('No feature specified and no active feature set.')
        const vars: Record<string, unknown> = { id }
        if (args.title != null) vars.title = args.title
        if (args.description != null) vars.description = args.description
        if (args.metadata != null) vars.metadata = args.metadata
        const data = await graphql<{ updateNode: unknown }>(UPDATE_NODE, vars)
        return ok(data.updateNode)
      }),
  },
  {
    name: 'flowy_feature_delete',
    config: {
      title: 'Delete feature',
      description:
        'Delete a feature and its edges. Defaults to the active feature when id is omitted. Destructive.',
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe('Feature id. Defaults to the active feature.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    handler: (args) =>
      run(async () => {
        const id = (args.id as string | undefined) ?? resolveFeature()
        if (!id) return fail('No feature specified and no active feature set.')
        const data = await graphql<{ deleteNode: boolean }>(DELETE_NODE, { id })
        return ok({ deleted: data.deleteNode })
      }),
  },
  {
    name: 'flowy_feature_show',
    config: {
      title: 'Show feature',
      description:
        'Fetch a single feature by id (defaults to the active feature).',
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe('Feature id. Defaults to the active feature.'),
      },
      annotations: { readOnlyHint: true },
    },
    handler: (args) =>
      run(async () => {
        const id = (args.id as string | undefined) ?? resolveFeature()
        if (!id) return fail('No feature specified and no active feature set.')
        const data = await graphql<{ node: unknown }>(GET_NODE, { id })
        return ok(data.node)
      }),
  },
  {
    name: 'flowy_feature_list',
    config: {
      title: 'List features',
      description:
        'List the features under a project. Defaults to the active project; pass projectId to override.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project id. Defaults to the active project.'),
      },
      annotations: { readOnlyHint: true },
    },
    handler: (args) =>
      run(async () => {
        const projectId =
          (args.projectId as string | undefined) ?? requireProject().id
        const data = await graphql<{ descendants: Array<{ type: string }> }>(
          DESCENDANTS,
          { nodeId: projectId, relation: 'part_of', maxDepth: 1 },
        )
        return ok(data.descendants.filter((n) => n.type === 'feature'))
      }),
  },

  // --- Tasks -----------------------------------------------------------------
  {
    name: 'flowy_task_create',
    config: {
      title: 'Create task',
      description:
        'Create a task under a feature, linked atomically (no orphan). Defaults to the active feature; pass featureId to override.',
      inputSchema: {
        title: z.string().describe('Task title.'),
        description: optionalDescription,
        featureId: z
          .string()
          .optional()
          .describe('Parent feature id. Defaults to the active feature.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    handler: (args) =>
      run(async () => {
        const parentId =
          (args.featureId as string | undefined) ?? requireFeature()
        const data = await graphql<{ createNode: unknown }>(CREATE_TASK, {
          type: 'task',
          title: args.title,
          description: args.description ?? null,
          parentId,
        })
        return ok(data.createNode)
      }),
  },
  {
    name: 'flowy_task_update',
    config: {
      title: 'Update task',
      description:
        'Update a task in place: change title, description, and/or metadata.',
      inputSchema: {
        id: z.string().describe('Task id.'),
        title: z.string().optional().describe('New title.'),
        description: optionalDescription,
        metadata: z
          .string()
          .optional()
          .describe('New metadata as a JSON string.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    handler: (args) =>
      run(async () => {
        const vars: Record<string, unknown> = { id: args.id }
        if (args.title != null) vars.title = args.title
        if (args.description != null) vars.description = args.description
        if (args.metadata != null) vars.metadata = args.metadata
        const data = await graphql<{ updateNode: unknown }>(UPDATE_NODE, vars)
        return ok(data.updateNode)
      }),
  },
  {
    name: 'flowy_task_delete',
    config: {
      title: 'Delete task',
      description: 'Delete a task and its edges. Destructive.',
      inputSchema: { id: z.string().describe('Task id.') },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    handler: (args) =>
      run(async () => {
        const data = await graphql<{ deleteNode: boolean }>(DELETE_NODE, {
          id: args.id,
        })
        return ok({ deleted: data.deleteNode })
      }),
  },
  {
    name: 'flowy_task_show',
    config: {
      title: 'Show task',
      description:
        'Show a task with its dependencies: the node plus its blockedBy (incoming) and blocks (outgoing) edges.',
      inputSchema: { id: z.string().describe('Task id.') },
      annotations: { readOnlyHint: true },
    },
    handler: (args) =>
      run(async () => {
        const data = await graphql<{
          node: Record<string, unknown>
          blockedBy: unknown[]
          blocks: unknown[]
        }>(SHOW_TASK, { id: args.id })
        return ok({
          ...data.node,
          blockedBy: data.blockedBy,
          blocks: data.blocks,
        })
      }),
  },
  {
    name: 'flowy_task_list',
    config: {
      title: 'List tasks',
      description:
        'List tasks. By default the tasks of the active feature; pass featureId to scope to a feature, or all:true to list every task across the backlog.',
      inputSchema: {
        featureId: z
          .string()
          .optional()
          .describe('Feature id. Defaults to the active feature.'),
        all: z
          .boolean()
          .optional()
          .describe('List every task across the whole backlog.'),
      },
      annotations: { readOnlyHint: true },
    },
    handler: (args) =>
      run(async () => {
        if (args.all) {
          const data = await graphql<{ nodes: unknown[] }>(ALL_TASKS, {
            type: 'task',
          })
          return ok(data.nodes)
        }
        const featureId =
          (args.featureId as string | undefined) ?? requireFeature()
        const data = await graphql<{ descendants: Array<{ type: string }> }>(
          LIST_TASKS,
          { nodeId: featureId, relation: 'part_of', maxDepth: 1 },
        )
        return ok(data.descendants.filter((n) => n.type === 'task'))
      }),
  },
  {
    name: 'flowy_task_deps',
    config: {
      title: 'Task dependencies',
      description:
        'List a task’s dependency edges only: what blocks it (blockedBy) and what it blocks.',
      inputSchema: { id: z.string().describe('Task id.') },
      annotations: { readOnlyHint: true },
    },
    handler: (args) =>
      run(async () => {
        const data = await graphql<{ blockedBy: unknown[]; blocks: unknown[] }>(
          TASK_DEPS,
          { id: args.id },
        )
        return ok({
          id: args.id,
          blockedBy: data.blockedBy,
          blocks: data.blocks,
        })
      }),
  },
  {
    name: 'flowy_ready_tasks',
    config: {
      title: 'List ready tasks',
      description:
        'List actionable tasks: not done/cancelled and with zero unfinished blockers. Scoped to the active project by default; pass projectId, or all:true for the whole backlog.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project id. Defaults to the active project.'),
        all: z
          .boolean()
          .optional()
          .describe('Consider ready tasks across the whole backlog.'),
      },
      annotations: { readOnlyHint: true },
    },
    handler: (args) =>
      run(async () => {
        const projectId =
          (args.projectId as string | undefined) ??
          (args.all ? null : (resolveProject()?.id ?? null))
        const data = await graphql<{ readyTasks: unknown[] }>(READY_TASKS, {
          projectId,
        })
        return ok(data.readyTasks)
      }),
  },
  {
    name: 'flowy_claim_task',
    config: {
      title: 'Claim a task',
      description:
        'Atomically claim a specific task for work (draft/pending_review/approved/blocked → in_progress). Compare-and-set on the server, so two agents can never both claim the same task. Errors if it was already claimed or is not claimable.',
      inputSchema: { id: z.string().describe('Task id to claim.') },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    handler: (args) =>
      run(async () => {
        const data = await graphql<{ claimNode: NodeRef | null }>(CLAIM_NODE, {
          id: args.id,
        })
        if (!data.claimNode) {
          return fail(
            `Could not claim ${args.id}: already claimed by another agent or not claimable (must be draft/pending_review/approved/blocked).`,
          )
        }
        return ok(data.claimNode)
      }),
  },
  {
    name: 'flowy_next_task',
    config: {
      title: 'Claim the next ready task',
      description:
        'Pick a ready task and atomically claim it, retrying past any a concurrent agent grabs first — the single high-value call for an agent that just wants its next unit of work. Scoped to the active project by default; pass projectId, or all:true for the whole backlog. Errors when nothing claimable is left.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project id. Defaults to the active project.'),
        all: z
          .boolean()
          .optional()
          .describe('Consider ready tasks across the whole backlog.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    handler: (args) =>
      run(async () => {
        const projectId =
          (args.projectId as string | undefined) ??
          (args.all ? null : (resolveProject()?.id ?? null))
        const ready = await graphql<{ readyTasks: NodeRef[] }>(READY_TASKS, {
          projectId,
        })
        if (ready.readyTasks.length === 0) {
          return fail(
            'No ready tasks to claim (none are actionable, or all are blocked/done).',
          )
        }
        for (const candidate of ready.readyTasks) {
          const data = await graphql<{ claimNode: NodeRef | null }>(
            CLAIM_NODE,
            {
              id: candidate.id,
            },
          )
          if (data.claimNode) return ok(data.claimNode)
        }
        return fail(
          'No claimable task left: every ready task was claimed by another agent. Try again.',
        )
      }),
  },
  {
    name: 'flowy_set_status',
    config: {
      title: 'Set node status',
      description:
        'Set a node’s status. Valid values: draft, pending_review, approved, in_progress, done, blocked, cancelled.',
      inputSchema: {
        id: z.string().describe('Node id.'),
        status: z
          .enum([
            'draft',
            'pending_review',
            'approved',
            'in_progress',
            'done',
            'blocked',
            'cancelled',
          ])
          .describe('New status.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    handler: (args) =>
      run(async () => {
        const data = await graphql<{ updateNode: unknown }>(UPDATE_STATUS, {
          id: args.id,
          status: args.status,
        })
        return ok(data.updateNode)
      }),
  },
  {
    name: 'flowy_approve',
    config: {
      title: 'Approve node',
      description:
        'Promote a node from pending_review to approved. Errors if it is not in pending_review.',
      inputSchema: { id: z.string().describe('Node id.') },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    handler: (args) =>
      run(async () => {
        const data = await graphql<{ approveNode: unknown }>(APPROVE_NODE, {
          id: args.id,
        })
        return ok(data.approveNode)
      }),
  },
  {
    name: 'flowy_block',
    config: {
      title: 'Block a task',
      description:
        'Create a "blocks" dependency: the blocking task must finish before the blocked task becomes ready.',
      inputSchema: {
        blockingId: z.string().describe('Task that does the blocking.'),
        blockedId: z.string().describe('Task that is blocked.'),
      },
      annotations: { readOnlyHint: false },
    },
    handler: (args) =>
      run(async () => {
        const data = await graphql<{ createEdge: unknown }>(BLOCK_TASK, {
          sourceId: args.blockingId,
          targetId: args.blockedId,
          relation: 'blocks',
        })
        return ok(data.createEdge)
      }),
  },
  {
    name: 'flowy_unblock',
    config: {
      title: 'Unblock a task',
      description: 'Remove a "blocks" dependency between two tasks.',
      inputSchema: {
        blockingId: z.string().describe('Task that was doing the blocking.'),
        blockedId: z.string().describe('Task that was blocked.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    handler: (args) =>
      run(async () => {
        const data = await graphql<{ removeEdge: boolean }>(UNBLOCK_TASK, {
          sourceId: args.blockingId,
          targetId: args.blockedId,
          relation: 'blocks',
        })
        return ok({ removed: data.removeEdge })
      }),
  },

  // --- Cross-cutting reads ---------------------------------------------------
  {
    name: 'flowy_search',
    config: {
      title: 'Search nodes',
      description:
        'Full-text search across nodes, with optional type/status filters and a result limit. Returns {nodes, truncated, total} so you can tell when more matches exist than were returned.',
      inputSchema: {
        query: z.string().describe('Search text.'),
        type: z
          .string()
          .optional()
          .describe('Filter by node type (project/feature/task).'),
        status: z.string().optional().describe('Filter by status.'),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Max results to return (default 50).'),
      },
      annotations: { readOnlyHint: true },
    },
    handler: (args) =>
      run(async () => {
        const data = await graphql<{ search: unknown }>(SEARCH, {
          query: args.query,
          type: args.type ?? null,
          status: args.status ?? null,
          limit: args.limit ?? null,
        })
        return ok(data.search)
      }),
  },
  {
    name: 'flowy_tree',
    config: {
      title: 'Show subtree',
      description:
        'Walk the subtree from any node, following one relation (default part_of). Each node is annotated with parentId/depth/relation — the fastest way to see backlog structure.',
      inputSchema: {
        id: z.string().describe('Root node id.'),
        relation: z
          .string()
          .optional()
          .describe('Edge relation to follow. Default "part_of".'),
        depth: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Max depth. Default 10.'),
      },
      annotations: { readOnlyHint: true },
    },
    handler: (args) =>
      run(async () => {
        const data = await graphql<{ subtree: unknown[] }>(SUBTREE, {
          nodeId: args.id,
          relation: (args.relation as string | undefined) ?? 'part_of',
          maxDepth: (args.depth as number | undefined) ?? 10,
        })
        return ok(data.subtree)
      }),
  },
  {
    name: 'flowy_history',
    config: {
      title: 'Node history',
      description:
        'Read a node’s audit history (newest first): every status/field change with who changed it and when.',
      inputSchema: {
        id: z.string().describe('Node id.'),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Max entries to return (default 50).'),
      },
      annotations: { readOnlyHint: true },
    },
    handler: (args) =>
      run(async () => {
        const data = await graphql<{ auditLog: unknown[] }>(AUDIT_LOG, {
          nodeId: args.id,
          limit: args.limit ?? null,
        })
        return ok(data.auditLog)
      }),
  },

  // --- Import / export -------------------------------------------------------
  {
    name: 'flowy_import',
    config: {
      title: 'Import a manifest',
      description:
        'Idempotently ingest a manifest object ({version, nodes, edges}) of projects/features/tasks. Deduped by client-key, so re-importing the same manifest updates in place rather than duplicating.',
      inputSchema: {
        manifest: z
          .record(z.string(), z.unknown())
          .describe('A Flowy manifest object: {version, nodes, edges}.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    handler: (args) =>
      run(async () => {
        const { materializeManifest } = await import('../commands/import.ts')
        const { parseManifest } = await import('./manifest.ts')
        // Reuse the exact same validator the CLI uses by feeding the passed
        // object through the canonical (string) parser.
        const manifest = parseManifest(JSON.stringify(args.manifest))
        return ok(await materializeManifest(manifest))
      }),
  },
  {
    name: 'flowy_export',
    config: {
      title: 'Export a project',
      description:
        'Dump a project (nodes + edges, with client-keys) as a manifest object that round-trips through flowy_import. Defaults to the active project.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project id. Defaults to the active project.'),
      },
      annotations: { readOnlyHint: true },
    },
    handler: (args) =>
      run(async () => {
        const projectId =
          (args.projectId as string | undefined) ?? requireProject().id
        const manifest = await exportProject(projectId)
        return ok(manifest)
      }),
  },

  // --- Remote-only -----------------------------------------------------------
  {
    name: 'flowy_whoami',
    config: {
      title: 'Who am I (remote)',
      description:
        'Show the current hosted user (id, email, tier, grace window). Remote mode only — errors in local mode, which has no accounts.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    handler: () =>
      run(async () => {
        const data = await graphql<{ whoami: unknown }>(WHOAMI)
        return ok(data.whoami)
      }),
  },
]

/**
 * Export a project to a manifest, reusing the same operations as the CLI's
 * `export` command. Kept here (rather than imported from export.ts) because
 * export.ts is a Commander command that writes to stdout; the MCP tool needs
 * the structured manifest as a value.
 */
async function exportProject(
  projectId: string,
): Promise<Record<string, unknown>> {
  const { MANIFEST_VERSION, readClientKey, stripClientKey } = await import(
    './manifest.ts'
  )

  interface SN {
    id: string
    type: string
    title: string
    description: string | null
    status: string
    metadata: string | null
  }
  const root = await graphql<{ node: SN | null }>(EXPORT_PROJECT, {
    id: projectId,
  })
  if (!root.node) throw new Error(`Project ${projectId} not found.`)
  const descendants = await graphql<{ descendants: SN[] }>(EXPORT_DESCENDANTS, {
    nodeId: projectId,
    relation: 'part_of',
    maxDepth: 100,
  })
  const serverNodes = [root.node, ...descendants.descendants]

  const keyOf = (id: string, metadata: string | null) =>
    readClientKey(metadata) ?? id
  const keyById = new Map<string, string>()
  for (const sn of serverNodes) keyById.set(sn.id, keyOf(sn.id, sn.metadata))

  const nodes = serverNodes.map((sn) => {
    const node: Record<string, unknown> = {
      key: keyById.get(sn.id) ?? sn.id,
      type: sn.type,
      title: sn.title,
    }
    if (sn.description != null) node.description = sn.description
    if (sn.status != null) node.status = sn.status
    const userMeta = stripClientKey(sn.metadata)
    if (userMeta) node.metadata = userMeta
    return node
  })

  const relations = ['part_of', 'blocks'] as const
  const edges: Array<{ source: string; target: string; relation: string }> = []
  const seen = new Set<string>()
  for (const sn of serverNodes) {
    const sourceKey = keyById.get(sn.id) ?? sn.id
    for (const relation of relations) {
      const data = await graphql<{
        edges: Array<{ id: string; metadata: string | null }>
      }>(EXPORT_EDGES, { nodeId: sn.id, relation })
      for (const target of data.edges) {
        const targetKey =
          keyById.get(target.id) ?? keyOf(target.id, target.metadata)
        const k = `${sourceKey}|${targetKey}|${relation}`
        if (seen.has(k)) continue
        seen.add(k)
        if (relation === 'part_of') {
          const node = nodes.find((n) => n.key === sourceKey)
          if (node) node.parent = targetKey
        }
        edges.push({ source: sourceKey, target: targetKey, relation })
      }
    }
  }

  return { version: MANIFEST_VERSION, nodes, edges }
}

/**
 * Build and configure the MCP server with every tool registered. The handler
 * adapts our internal ToolResult shape to the SDK's CallToolResult, mapping
 * `isError` through unchanged.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: 'flowy', version: VERSION })
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.config.title,
        description: tool.config.description,
        inputSchema: tool.config.inputSchema,
        annotations: tool.config.annotations,
      },
      async (args: Record<string, unknown>) => {
        const result = await tool.handler(args ?? {})
        return {
          content: result.content,
          structuredContent: result.structuredContent,
          isError: result.isError,
        }
      },
    )
  }
  return server
}
