import { createGraphQLError } from 'graphql-yoga'
import { nanoid } from 'nanoid'
import type { FlowyDb } from './db.ts'

function validationError(message: string) {
  return createGraphQLError(message, {
    extensions: { code: 'VALIDATION_ERROR' },
  })
}

function notFoundError(message: string) {
  return createGraphQLError(message, { extensions: { code: 'NOT_FOUND' } })
}

function conflictError(message: string) {
  return createGraphQLError(message, { extensions: { code: 'CONFLICT' } })
}

type Db = FlowyDb

interface NodeRow {
  id: string
  type: string
  title: string
  description: string | null
  status: string
  metadata: string | null
  created_at: string
  updated_at: string
}

export interface NodeGql {
  id: string
  type: string
  title: string
  description: string | null
  status: string
  metadata: string | null
  createdAt: string
  updatedAt: string
}

/**
 * An audit-log entry, shaped to match the SaaS `auditLog` GraphQL field
 * (id, nodeId, action, field, oldValue, newValue, snapshot, changedBy,
 * createdAt) so `flowy history` output is consistent across backends.
 * `snapshot` is a JSON string (or null), mirroring SaaS.
 */
export interface AuditEntryGql {
  id: string
  nodeId: string | null
  action: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  snapshot: string | null
  changedBy: string
  createdAt: string
}

interface AuditRow {
  id: string
  node_id: string | null
  action: string
  field: string | null
  old_value: string | null
  new_value: string | null
  snapshot: string | null
  changed_by: string
  created_at: string
}

/**
 * A node returned from a subtree traversal, annotated with the edge that pulled
 * it in: `parentId` (the node it descends from), `depth` (1 for the root's
 * direct children), and `relation` (the relation of the linking edge).
 */
export interface SubtreeNodeGql extends NodeGql {
  parentId: string
  depth: number
  relation: string
}

/**
 * Search results plus truncation metadata (F32). `nodes` is capped at `limit`;
 * `total` is the unbounded match count and `truncated` is true when `total`
 * exceeds the returned page — letting the CLI show a clear "results truncated"
 * marker instead of silently dropping matches at the default cap.
 */
export interface SearchResultGql {
  nodes: NodeGql[]
  truncated: boolean
  total: number
}

interface SubtreeRow extends NodeRow {
  parent_id: string
  depth: number
  edge_relation: string
}

const NODE_COLS =
  'id, type, title, description, status, metadata, created_at, updated_at'

const PREFIX_MAP: Record<string, string> = {
  project: 'proj',
  feature: 'feat',
  task: 'task',
}

const VALID_STATUSES = new Set([
  'draft',
  'pending_review',
  'approved',
  'in_progress',
  'done',
  'blocked',
  'cancelled',
])

/**
 * Statuses a task may be atomically claimed *from* by `claimNode` (F28). A claim
 * flips any of these to `in_progress` in a single CAS statement. `in_progress`,
 * `done`, and `cancelled` are intentionally excluded: an already-claimed,
 * finished, or abandoned task is not up for grabs. Kept in lockstep with the
 * SaaS `CLAIMABLE_STATUSES` so a claim behaves identically across backends.
 */
const CLAIMABLE_STATUSES = ['draft', 'pending_review', 'approved', 'blocked']

function assertValidStatus(status: string): void {
  if (!VALID_STATUSES.has(status)) {
    throw validationError(
      `Invalid status: ${status}. Must be one of: ${[...VALID_STATUSES].join(', ')}`,
    )
  }
}

/**
 * Allowed status transitions for the OPT-IN lifecycle enforcement
 * (`FLOWY_ENFORCE_STATUS_LIFECYCLE`). The canonical forward flow is
 * `draft → pending_review → approved → in_progress → done`; `blocked` and
 * `cancelled` are reachable from active states and recoverable back into the
 * flow. A same-status update is always a no-op and never checked here. When
 * enforcement is OFF (the default) this map is unused and any vocabulary-valid
 * status is accepted, preserving the prior behaviour.
 */
const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  draft: new Set(['pending_review', 'cancelled']),
  pending_review: new Set(['approved', 'draft', 'cancelled']),
  approved: new Set(['in_progress', 'pending_review', 'cancelled']),
  in_progress: new Set(['done', 'blocked', 'cancelled']),
  done: new Set(['in_progress']),
  blocked: new Set(['in_progress', 'cancelled']),
  cancelled: new Set(['draft']),
}

function assertValidTransition(from: string, to: string): void {
  if (from === to) return
  if (!ALLOWED_TRANSITIONS[from]?.has(to)) {
    throw validationError(
      `Illegal status transition: ${from} → ${to}. Allowed from "${from}": ${
        [...(ALLOWED_TRANSITIONS[from] ?? [])].join(', ') || '(none)'
      }`,
    )
  }
}

/**
 * Validate that `metadata` is a JSON string and return its canonical form.
 * Metadata is stored as a JSON string (the column and the GraphQL field are
 * both String); callers pass a JSON-encoded string. Non-JSON input is rejected
 * with a VALIDATION_ERROR so agents can self-correct.
 */
function normalizeMetadata(metadata: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(metadata)
  } catch {
    throw validationError('Invalid metadata: must be a valid JSON string')
  }
  return JSON.stringify(parsed)
}

function generateId(type: string): string {
  const prefix = PREFIX_MAP[type] ?? type
  return `${prefix}_${nanoid(12)}`
}

// The bundled local server is single-tenant and unauthenticated, so every
// audit entry is attributed to a single constant actor. SaaS uses the user id.
const LOCAL_ACTOR = 'local'

interface AuditInput {
  nodeId: string | null
  action: string
  field?: string | null
  oldValue?: string | null
  newValue?: string | null
  snapshot?: Record<string, unknown> | null
}

/**
 * Write one audit_log row. Call inside the same transaction as the mutation so
 * the change and its audit trail commit (or roll back) together. SQLite's
 * `datetime('now')` resolves to whole seconds, which is too coarse to order
 * multiple entries written in the same call; we pass an explicit ISO timestamp
 * with sub-second precision so `ORDER BY created_at DESC` is stable.
 */
function insertAudit(db: Db, input: AuditInput): void {
  db.raw.run(
    'INSERT INTO audit_log (id, node_id, action, field, old_value, new_value, snapshot, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      `audit_${nanoid(12)}`,
      input.nodeId,
      input.action,
      input.field ?? null,
      input.oldValue ?? null,
      input.newValue ?? null,
      input.snapshot != null ? JSON.stringify(input.snapshot) : null,
      LOCAL_ACTOR,
      new Date().toISOString(),
    ],
  )
}

function rowToAudit(row: AuditRow): AuditEntryGql {
  return {
    id: row.id,
    nodeId: row.node_id,
    action: row.action,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    snapshot: row.snapshot,
    changedBy: row.changed_by,
    createdAt: row.created_at,
  }
}

function rowToNode(row: NodeRow): NodeGql {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function selectNode(db: Db, id: string): NodeGql | null {
  const row = db.raw
    .query(`SELECT ${NODE_COLS} FROM nodes WHERE id = ?`)
    .get(id) as NodeRow | null
  return row ? rowToNode(row) : null
}

function selectNodes(rows: NodeRow[]): NodeGql[] {
  return rows.map(rowToNode)
}

function prefixedCols() {
  return NODE_COLS.split(', ')
    .map((c) => `n.${c}`)
    .join(', ')
}

export interface ResolverOptions {
  /**
   * Enforce the canonical status lifecycle on `updateNode` status changes.
   * OFF by default — when false (the default) any vocabulary-valid status is
   * accepted, matching pre-F32 behaviour. Wired from
   * `FLOWY_ENFORCE_STATUS_LIFECYCLE` in `index.ts`.
   */
  enforceStatusLifecycle?: boolean
}

export function createResolvers(db: Db, opts: ResolverOptions = {}) {
  const enforceStatusLifecycle = opts.enforceStatusLifecycle ?? false
  return {
    Query: {
      node: (_: unknown, args: { id: string }) => {
        const node = selectNode(db, args.id)
        if (!node) throw notFoundError(`Node ${args.id} not found`)
        return node
      },

      nodes: (_: unknown, args: { type?: string }) => {
        const conditions: string[] = []
        const params: string[] = []
        if (args.type) {
          conditions.push('type = ?')
          params.push(args.type)
        }
        const where =
          conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        const rows = db.raw
          .query(`SELECT ${NODE_COLS} FROM nodes ${where}`)
          .all(...params) as NodeRow[]
        return selectNodes(rows)
      },

      descendants: (
        _: unknown,
        args: { nodeId: string; relation?: string; maxDepth?: number },
      ) => {
        const maxDepth = args.maxDepth ?? 100
        if (maxDepth === 0) return []
        let rows: NodeRow[]
        if (args.relation) {
          rows = db.raw
            .query(
              `WITH RECURSIVE tree(id, depth) AS (
                SELECT source_id, 1 FROM edges WHERE target_id = ?1 AND relation = ?3
                UNION ALL
                SELECT e.source_id, t.depth + 1 FROM edges e
                JOIN tree t ON e.target_id = t.id WHERE t.depth < ?2 AND e.relation = ?3
              )
              SELECT DISTINCT ${prefixedCols()} FROM nodes n JOIN tree t ON n.id = t.id`,
            )
            .all(args.nodeId, maxDepth, args.relation) as NodeRow[]
        } else {
          rows = db.raw
            .query(
              `WITH RECURSIVE tree(id, depth) AS (
                SELECT source_id, 1 FROM edges WHERE target_id = ?1
                UNION ALL
                SELECT e.source_id, t.depth + 1 FROM edges e
                JOIN tree t ON e.target_id = t.id WHERE t.depth < ?2
              )
              SELECT DISTINCT ${prefixedCols()} FROM nodes n JOIN tree t ON n.id = t.id`,
            )
            .all(args.nodeId, maxDepth) as NodeRow[]
        }
        return selectNodes(rows)
      },

      // Walk the part_of hierarchy (or another `relation`, default 'part_of')
      // downward from `nodeId`, returning each reachable node annotated with the
      // edge that pulled it in: parentId, depth (root's direct children = 1) and
      // relation. Following a single relation keeps the hierarchy view clean —
      // `blocks` dependency edges no longer leak into the part_of tree.
      subtree: (
        _: unknown,
        args: { nodeId: string; relation?: string; maxDepth?: number },
      ): SubtreeNodeGql[] => {
        const relation = args.relation ?? 'part_of'
        const maxDepth = args.maxDepth ?? 100
        if (maxDepth === 0) return []
        const rows = db.raw
          .query(
            `WITH RECURSIVE tree(id, parent_id, depth) AS (
              SELECT source_id, target_id, 1 FROM edges
                WHERE target_id = ?1 AND relation = ?3
              UNION ALL
              SELECT e.source_id, e.target_id, t.depth + 1 FROM edges e
                JOIN tree t ON e.target_id = t.id
                WHERE t.depth < ?2 AND e.relation = ?3
            )
            SELECT ${prefixedCols()}, t.parent_id AS parent_id, t.depth AS depth, ?3 AS edge_relation
            FROM nodes n JOIN tree t ON n.id = t.id
            ORDER BY t.depth`,
          )
          .all(args.nodeId, maxDepth, relation) as SubtreeRow[]
        return rows.map((row) => ({
          ...rowToNode(row),
          parentId: row.parent_id,
          depth: row.depth,
          relation: row.edge_relation,
        }))
      },

      // Nodes connected to `nodeId` by `relation`, following edges in the given
      // direction. 'incoming' returns the *sources* of edges that point at the
      // node (e.g. for relation 'blocks', the tasks that block it — blockedBy);
      // 'outgoing' returns the *targets* of edges originating at the node (the
      // tasks it blocks). Default direction is 'outgoing'.
      edges: (
        _: unknown,
        args: {
          nodeId: string
          relation: string
          direction?: string
        },
      ) => {
        const incoming = args.direction === 'incoming'
        const sql = incoming
          ? `SELECT ${prefixedCols()} FROM nodes n
             JOIN edges e ON n.id = e.source_id
             WHERE e.target_id = ? AND e.relation = ?`
          : `SELECT ${prefixedCols()} FROM nodes n
             JOIN edges e ON n.id = e.target_id
             WHERE e.source_id = ? AND e.relation = ?`
        const rows = db.raw
          .query(sql)
          .all(args.nodeId, args.relation) as NodeRow[]
        return selectNodes(rows)
      },

      // Tasks that are actionable now: type 'task', status not done/cancelled,
      // and not blocked by any incomplete blocker. A blocker is an incoming
      // `blocks` edge whose source task is itself not done/cancelled. Optionally
      // scoped to a project via the `part_of` hierarchy (task -> feature ->
      // project).
      readyTasks: (_: unknown, args: { projectId?: string }) => {
        const params: string[] = []
        let scope = ''
        if (args.projectId) {
          // Restrict to tasks reachable from the project through part_of edges
          // (any depth). Edges point child -> parent, so we walk upward from
          // each candidate task to see if the project is an ancestor.
          scope = `AND n.id IN (
            WITH RECURSIVE up(id) AS (
              SELECT source_id FROM edges
                WHERE target_id = ?1 AND relation = 'part_of'
              UNION
              SELECT e.source_id FROM edges e
                JOIN up ON e.target_id = up.id AND e.relation = 'part_of'
            )
            SELECT id FROM up
          )`
          params.push(args.projectId)
        }
        const rows = db.raw
          .query(
            `SELECT ${prefixedCols()} FROM nodes n
             WHERE n.type = 'task'
               AND n.status NOT IN ('done', 'cancelled')
               ${scope}
               AND NOT EXISTS (
                 SELECT 1 FROM edges b
                 JOIN nodes src ON src.id = b.source_id
                 WHERE b.target_id = n.id AND b.relation = 'blocks'
                   AND src.status NOT IN ('done', 'cancelled')
               )`,
          )
          .all(...params) as NodeRow[]
        return selectNodes(rows)
      },

      search: (
        _: unknown,
        args: {
          query: string
          type?: string
          status?: string
          limit?: number
        },
      ): SearchResultGql => {
        if (args.query.trim().length < 3) {
          throw validationError('Search query must be at least 3 characters')
        }
        const escaped = args.query.replace(/[%_\\]/g, '\\$&')
        const conditions = [
          "(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')",
        ]
        const params: (string | number)[] = [`%${escaped}%`, `%${escaped}%`]
        if (args.type) {
          conditions.push('type = ?')
          params.push(args.type)
        }
        if (args.status) {
          conditions.push('status = ?')
          params.push(args.status)
        }
        const where = conditions.join(' AND ')
        const limit = args.limit ?? 50
        // Fetch one extra row so we can tell "exactly at the cap" from
        // "more matches exist" without a second COUNT for the common case.
        const rows = db.raw
          .query(`SELECT ${NODE_COLS} FROM nodes WHERE ${where} LIMIT ?`)
          .all(...params, limit + 1) as NodeRow[]
        const truncated = rows.length > limit
        const page = truncated ? rows.slice(0, limit) : rows
        const total = truncated
          ? (
              db.raw
                .query(`SELECT COUNT(*) AS c FROM nodes WHERE ${where}`)
                .get(...params) as { c: number }
            ).c
          : page.length
        return { nodes: selectNodes(page), truncated, total }
      },

      // Audit history for a node, newest first. Shaped to match the SaaS
      // `auditLog` field so `flowy history` output is consistent across
      // backends. `delete` entries set node_id to null (the node is gone), so
      // they are not returned here — the deletion is still recorded in the
      // table with the pre-delete snapshot.
      auditLog: (
        _: unknown,
        args: { nodeId: string; limit?: number },
      ): AuditEntryGql[] => {
        const limit = args.limit ?? 50
        const rows = db.raw
          .query(
            'SELECT * FROM audit_log WHERE node_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
          )
          .all(args.nodeId, limit) as AuditRow[]
        return rows.map(rowToAudit)
      },
    },

    Mutation: {
      // Create a node, optionally linking it under a parent in one atomic step
      // (F24). When `parentId` is given we validate the parent exists FIRST —
      // before any write — then, in a SINGLE transaction, insert the node, its
      // `create` audit row, the `part_of` edge (child -> parent), and the
      // edge's `create_edge` audit row. A failure anywhere rolls the whole unit
      // back, so a bad link can never leave an orphaned node. With no
      // `parentId`, behaviour is unchanged: just the node + its create audit.
      createNode: (
        _: unknown,
        args: {
          type: string
          title: string
          description?: string
          status?: string
          metadata?: string
          parentId?: string
        },
      ): NodeGql => {
        if (!args.title.trim()) throw validationError('Title is required')
        if (args.description != null && !args.description.trim()) {
          throw validationError('Description cannot be empty')
        }
        if (args.status != null) assertValidStatus(args.status)
        // Validate the parent up front so a bad link errors before any write.
        if (args.parentId != null) {
          const parentExists = db.raw
            .query('SELECT id FROM nodes WHERE id = ?')
            .get(args.parentId)
          if (!parentExists) {
            throw notFoundError(`Parent node ${args.parentId} not found`)
          }
        }
        const metadata =
          args.metadata != null ? normalizeMetadata(args.metadata) : null
        const id = generateId(args.type)
        const now = new Date().toISOString()
        const description = args.description ?? null
        const status = args.status ?? 'draft'
        const node: NodeGql = {
          id,
          type: args.type,
          title: args.title,
          description,
          status,
          metadata,
          createdAt: now,
          updatedAt: now,
        }
        db.raw.transaction(() => {
          db.raw.run(
            'INSERT INTO nodes (id, type, title, description, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              id,
              args.type,
              args.title,
              description,
              status,
              metadata,
              now,
              now,
            ],
          )
          insertAudit(db, {
            nodeId: id,
            action: 'create',
            snapshot: node as unknown as Record<string, unknown>,
          })
          if (args.parentId != null) {
            db.raw.run(
              'INSERT INTO edges (source_id, target_id, relation, created_at) VALUES (?, ?, ?, ?)',
              [id, args.parentId, 'part_of', now],
            )
            insertAudit(db, {
              nodeId: id,
              action: 'create_edge',
              field: 'part_of',
              newValue: args.parentId,
            })
          }
        })()
        return node
      },

      updateNode: (
        _: unknown,
        args: {
          id: string
          title?: string
          description?: string
          status?: string
          metadata?: string
        },
      ) => {
        // Input validation that does NOT depend on the current row is done up
        // front so a malformed request errors before opening a transaction.
        if (args.title != null && !args.title.trim()) {
          throw validationError('Title cannot be empty')
        }
        if (args.description != null && !args.description.trim()) {
          throw validationError('Description cannot be empty')
        }
        if (args.status != null) assertValidStatus(args.status)
        // Normalize metadata up front too: a non-JSON value must be rejected
        // (VALIDATION_ERROR) without touching the database.
        const nextMetadata =
          args.metadata != null ? normalizeMetadata(args.metadata) : undefined

        const now = new Date().toISOString()
        // Transactional read-modify-write (F28). The SELECT, the diff, the
        // UPDATE, and the audit rows all run inside ONE transaction so a
        // mid-update failure rolls the whole unit back (never a half-applied
        // row with no audit, or vice versa) and the read can't observe a row a
        // concurrent writer is mid-mutating. SQLite is a single writer, so the
        // transaction also serializes this RMW against any other write —
        // matching the SaaS FOR UPDATE row lock.
        let next!: NodeRow
        db.raw.transaction(() => {
          const existing = db.raw
            .query('SELECT * FROM nodes WHERE id = ?')
            .get(args.id) as NodeRow | null
          if (!existing) throw notFoundError(`Node ${args.id} not found`)
          // The lifecycle transition check reads the current status, so it
          // belongs inside the transaction with the row it validates against.
          if (args.status != null && enforceStatusLifecycle) {
            assertValidTransition(existing.status, args.status)
          }

          next = {
            ...existing,
            title: args.title ?? existing.title,
            description:
              args.description !== undefined
                ? args.description
                : existing.description,
            status: args.status ?? existing.status,
            metadata:
              nextMetadata !== undefined ? nextMetadata : existing.metadata,
          }
          // Field-level diffs, mirroring SaaS: title/description/metadata
          // changes are 'update' entries; a status change is 'status_change'.
          const diffs: Array<{
            field: string
            action: string
            oldValue: string | null
            newValue: string | null
          }> = []
          if (next.title !== existing.title) {
            diffs.push({
              field: 'title',
              action: 'update',
              oldValue: existing.title,
              newValue: next.title,
            })
          }
          if (next.description !== existing.description) {
            diffs.push({
              field: 'description',
              action: 'update',
              oldValue: existing.description,
              newValue: next.description,
            })
          }
          if (next.status !== existing.status) {
            diffs.push({
              field: 'status',
              action: 'status_change',
              oldValue: existing.status,
              newValue: next.status,
            })
          }
          if (next.metadata !== existing.metadata) {
            diffs.push({
              field: 'metadata',
              action: 'update',
              oldValue: existing.metadata,
              newValue: next.metadata,
            })
          }

          db.raw.run(
            'UPDATE nodes SET title = ?, description = ?, status = ?, metadata = ?, updated_at = ? WHERE id = ?',
            [
              next.title,
              next.description,
              next.status,
              next.metadata,
              now,
              args.id,
            ],
          )
          for (const d of diffs) {
            insertAudit(db, {
              nodeId: args.id,
              action: d.action,
              field: d.field,
              oldValue: d.oldValue,
              newValue: d.newValue,
            })
          }
        })()
        return rowToNode({ ...next, updated_at: now })
      },

      deleteNode: (_: unknown, args: { id: string }): boolean => {
        const existing = db.raw
          .query(`SELECT ${NODE_COLS} FROM nodes WHERE id = ?`)
          .get(args.id) as NodeRow | null
        if (!existing) throw notFoundError(`Node ${args.id} not found`)

        // The hierarchy is client -> project -> feature -> task via `part_of`
        // edges (source = child, target = parent). A node with children must
        // not be orphaned; reject rather than cascade-delete the subtree.
        const childCount = db.raw
          .query(
            'SELECT COUNT(*) AS c FROM edges WHERE target_id = ? AND relation = ?',
          )
          .get(args.id, 'part_of') as { c: number }
        if (childCount.c > 0) {
          throw conflictError(
            `Cannot delete node ${args.id}: it has ${childCount.c} child node(s). Delete or re-link them first.`,
          )
        }

        db.raw.transaction(() => {
          // Record the delete with the pre-delete snapshot BEFORE removing the
          // node. node_id is null (the node is gone) to match SaaS. The FK's
          // ON DELETE SET NULL also nulls node_id on the node's prior audit
          // rows when the node row below is deleted.
          insertAudit(db, {
            nodeId: null,
            action: 'delete',
            snapshot: rowToNode(existing) as unknown as Record<string, unknown>,
          })
          db.raw.run('DELETE FROM edges WHERE source_id = ? OR target_id = ?', [
            args.id,
            args.id,
          ])
          db.raw.run('DELETE FROM nodes WHERE id = ?', [args.id])
        })()
        return true
      },

      approveNode: (_: unknown, args: { id: string }) => {
        const existing = db.raw
          .query('SELECT * FROM nodes WHERE id = ?')
          .get(args.id) as NodeRow | null
        if (!existing) throw notFoundError(`Node ${args.id} not found`)
        if (existing.status !== 'pending_review') {
          throw conflictError(
            `Cannot approve node with status "${existing.status}", must be "pending_review"`,
          )
        }
        const now = new Date().toISOString()
        db.raw.transaction(() => {
          db.raw.run(
            'UPDATE nodes SET status = ?, updated_at = ? WHERE id = ?',
            ['approved', now, args.id],
          )
          insertAudit(db, {
            nodeId: args.id,
            action: 'approve',
            field: 'status',
            oldValue: 'pending_review',
            newValue: 'approved',
          })
        })()
        return rowToNode({ ...existing, status: 'approved', updated_at: now })
      },

      // Atomically claim a task for work (F28). A single compare-and-set
      // `UPDATE ... WHERE id = ? AND status IN (<claimable>)` flips a claimable
      // node to in_progress and returns the new row via RETURNING. SQLite is a
      // single writer, so the statement is its own atomic unit: exactly one of
      // two concurrent claimers can match the WHERE clause and get a row back;
      // the loser's UPDATE matches nothing and returns null. This is the
      // primitive that lets parallel agents share one backlog without
      // double-claiming. Returns null when the node is missing, already
      // in_progress/done/cancelled, or lost the race. Mirrors SaaS `claimNode`.
      claimNode: (_: unknown, args: { id: string }): NodeGql | null => {
        const placeholders = CLAIMABLE_STATUSES.map(() => '?').join(', ')
        const now = new Date().toISOString()
        let claimed: NodeRow | null = null
        // Read-then-CAS inside ONE transaction. SQLite is a single writer, so
        // the transaction serializes against any concurrent claimer: we capture
        // the prior status (for an accurate audit oldValue), then run the gated
        // CAS. Reading first is safe precisely because the write below is in the
        // same atomic unit — no other writer can slip in between. The CAS
        // (`WHERE status IN (<claimable>)`) is still the source of truth for who
        // wins; the prior read only labels the audit entry.
        db.raw.transaction(() => {
          const prior = db.raw
            .query('SELECT status FROM nodes WHERE id = ?')
            .get(args.id) as { status: string } | null
          claimed = db.raw
            .query(
              `UPDATE nodes SET status = 'in_progress', updated_at = ?
               WHERE id = ? AND status IN (${placeholders})
               RETURNING ${NODE_COLS}`,
            )
            .get(now, args.id, ...CLAIMABLE_STATUSES) as NodeRow | null
          // Only the winner audits a status_change; a losing/no-match claim
          // touches no row and writes nothing.
          if (claimed) {
            insertAudit(db, {
              nodeId: claimed.id,
              action: 'status_change',
              field: 'status',
              oldValue: prior?.status ?? null,
              newValue: 'in_progress',
            })
          }
        })()
        return claimed ? rowToNode(claimed) : null
      },

      createEdge: (
        _: unknown,
        args: { sourceId: string; targetId: string; relation: string },
      ) => {
        const validRelations = new Set(['part_of', 'blocks'])
        if (!validRelations.has(args.relation)) {
          throw validationError(
            `Invalid relation: ${args.relation}. Must be 'part_of' or 'blocks'`,
          )
        }
        const sourceExists = db.raw
          .query('SELECT id FROM nodes WHERE id = ?')
          .get(args.sourceId)
        if (!sourceExists) {
          throw notFoundError(`Source node ${args.sourceId} not found`)
        }
        const targetExists = db.raw
          .query('SELECT id FROM nodes WHERE id = ?')
          .get(args.targetId)
        if (!targetExists) {
          throw notFoundError(`Target node ${args.targetId} not found`)
        }
        if (args.relation === 'blocks' && args.sourceId === args.targetId) {
          throw validationError('A node cannot block itself')
        }
        const now = new Date().toISOString()
        // Idempotent (F29): re-creating an existing edge is a no-op success, not
        // a PK-violation error. ON CONFLICT DO NOTHING leaves the original row
        // (and its created_at) untouched; we only audit a genuinely new edge.
        db.raw.transaction(() => {
          const result = db.raw.run(
            'INSERT INTO edges (source_id, target_id, relation, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (source_id, target_id, relation) DO NOTHING',
            [args.sourceId, args.targetId, args.relation, now],
          )
          if (result.changes > 0) {
            // Record the edge against its source node so `auditLog(sourceId)`
            // surfaces it. field = relation; newValue = the target it now links.
            insertAudit(db, {
              nodeId: args.sourceId,
              action: 'create_edge',
              field: args.relation,
              newValue: args.targetId,
            })
          }
        })()
        // Read back the canonical row so the returned createdAt reflects the
        // existing edge on a duplicate call, not the discarded `now`.
        const edge = db.raw
          .query(
            'SELECT created_at FROM edges WHERE source_id = ? AND target_id = ? AND relation = ?',
          )
          .get(args.sourceId, args.targetId, args.relation) as {
          created_at: string
        }
        return {
          sourceId: args.sourceId,
          targetId: args.targetId,
          relation: args.relation,
          createdAt: edge.created_at,
        }
      },

      removeEdge: (
        _: unknown,
        args: { sourceId: string; targetId: string; relation: string },
      ) => {
        let changed = false
        db.raw.transaction(() => {
          const result = db.raw.run(
            'DELETE FROM edges WHERE source_id = ? AND target_id = ? AND relation = ?',
            [args.sourceId, args.targetId, args.relation],
          )
          changed = result.changes > 0
          // Only audit an edge that actually existed. oldValue = the target the
          // edge linked to before removal.
          if (changed) {
            insertAudit(db, {
              nodeId: args.sourceId,
              action: 'remove_edge',
              field: args.relation,
              oldValue: args.targetId,
            })
          }
        })()
        return changed
      },
    },
  }
}
