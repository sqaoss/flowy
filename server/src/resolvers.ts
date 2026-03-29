import { nanoid } from 'nanoid'
import type { FlowyDb } from './db.ts'

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

function generateId(type: string): string {
  const prefix = PREFIX_MAP[type] ?? type
  return `${prefix}_${nanoid(12)}`
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

export function createResolvers(db: Db) {
  return {
    Query: {
      node: (_: unknown, args: { id: string }) => {
        return selectNode(db, args.id)
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

      subtree: (_: unknown, args: { nodeId: string; maxDepth?: number }) => {
        const maxDepth = args.maxDepth ?? 100
        if (maxDepth === 0) return []
        const rows = db.raw
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
      ) => {
        if (args.query.trim().length < 3) {
          throw new Error('Search query must be at least 3 characters')
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
        const limit = args.limit ?? 50
        const rows = db.raw
          .query(
            `SELECT ${NODE_COLS} FROM nodes WHERE ${conditions.join(' AND ')} LIMIT ?`,
          )
          .all(...params, limit) as NodeRow[]
        return selectNodes(rows)
      },
    },

    Mutation: {
      createNode: (
        _: unknown,
        args: { type: string; title: string; description?: string },
      ): NodeGql => {
        if (!args.title.trim()) throw new Error('Title is required')
        if (args.description != null && !args.description.trim()) {
          throw new Error('Description cannot be empty')
        }
        const id = generateId(args.type)
        const now = new Date().toISOString()
        const description = args.description ?? null
        db.raw.run(
          'INSERT INTO nodes (id, type, title, description, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [id, args.type, args.title, description, 'draft', null, now, now],
        )
        return {
          id,
          type: args.type,
          title: args.title,
          description,
          status: 'draft',
          metadata: null,
          createdAt: now,
          updatedAt: now,
        }
      },

      updateNode: (_: unknown, args: { id: string; status?: string }) => {
        const existing = db.raw
          .query('SELECT * FROM nodes WHERE id = ?')
          .get(args.id) as NodeRow | null
        if (!existing) throw new Error(`Node ${args.id} not found`)
        const newStatus = args.status ?? existing.status
        if (args.status && !VALID_STATUSES.has(args.status)) {
          throw new Error(
            `Invalid status: ${args.status}. Must be one of: ${[...VALID_STATUSES].join(', ')}`,
          )
        }
        const now = new Date().toISOString()
        db.raw.run('UPDATE nodes SET status = ?, updated_at = ? WHERE id = ?', [
          newStatus,
          now,
          args.id,
        ])
        return rowToNode({ ...existing, status: newStatus, updated_at: now })
      },

      approveNode: (_: unknown, args: { id: string }) => {
        const existing = db.raw
          .query('SELECT * FROM nodes WHERE id = ?')
          .get(args.id) as NodeRow | null
        if (!existing) throw new Error(`Node ${args.id} not found`)
        if (existing.status !== 'pending_review') {
          throw new Error(
            `Cannot approve node with status "${existing.status}", must be "pending_review"`,
          )
        }
        const now = new Date().toISOString()
        db.raw.run('UPDATE nodes SET status = ?, updated_at = ? WHERE id = ?', [
          'approved',
          now,
          args.id,
        ])
        return rowToNode({ ...existing, status: 'approved', updated_at: now })
      },

      createEdge: (
        _: unknown,
        args: { sourceId: string; targetId: string; relation: string },
      ) => {
        const validRelations = new Set(['part_of', 'blocks'])
        if (!validRelations.has(args.relation)) {
          throw new Error(
            `Invalid relation: ${args.relation}. Must be 'part_of' or 'blocks'`,
          )
        }
        const sourceExists = db.raw
          .query('SELECT id FROM nodes WHERE id = ?')
          .get(args.sourceId)
        if (!sourceExists) {
          throw new Error(`Source node ${args.sourceId} not found`)
        }
        const targetExists = db.raw
          .query('SELECT id FROM nodes WHERE id = ?')
          .get(args.targetId)
        if (!targetExists) {
          throw new Error(`Target node ${args.targetId} not found`)
        }
        if (args.relation === 'blocks' && args.sourceId === args.targetId) {
          throw new Error('A node cannot block itself')
        }
        const now = new Date().toISOString()
        db.raw.run(
          'INSERT INTO edges (source_id, target_id, relation, created_at) VALUES (?, ?, ?, ?)',
          [args.sourceId, args.targetId, args.relation, now],
        )
        return {
          sourceId: args.sourceId,
          targetId: args.targetId,
          relation: args.relation,
          createdAt: now,
        }
      },

      removeEdge: (
        _: unknown,
        args: { sourceId: string; targetId: string; relation: string },
      ) => {
        const result = db.raw.run(
          'DELETE FROM edges WHERE source_id = ? AND target_id = ? AND relation = ?',
          [args.sourceId, args.targetId, args.relation],
        )
        return result.changes > 0
      },
    },
  }
}
