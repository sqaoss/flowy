import { nanoid } from 'nanoid'
import type { createDb } from './db.ts'

type Db = ReturnType<typeof createDb>

const NODE_COLS =
  'id, type, title, description, status, metadata, created_at, updated_at'

const PREFIX_MAP: Record<string, string> = {
  project: 'proj',
  feature: 'feat',
  task: 'task',
}

function generateId(type: string): string {
  const prefix = PREFIX_MAP[type] ?? type
  return `${prefix}_${nanoid(12)}`
}

function rowToNode(row: Record<string, unknown>) {
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

function selectNode(db: Db, id: string) {
  const row = db.raw
    .query(`SELECT ${NODE_COLS} FROM nodes WHERE id = ?`)
    .get(id) as Record<string, unknown> | null
  return row ? rowToNode(row) : null
}

function selectNodes(rows: Record<string, unknown>[]) {
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
        const params: unknown[] = []
        if (args.type) {
          conditions.push('type = ?')
          params.push(args.type)
        }
        const where =
          conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        const rows = db.raw
          .query(`SELECT ${NODE_COLS} FROM nodes ${where}`)
          .all(...params) as Record<string, unknown>[]
        return selectNodes(rows)
      },

      descendants: (
        _: unknown,
        args: { nodeId: string; relation?: string; maxDepth?: number },
      ) => {
        const maxDepth = args.maxDepth ?? 100
        let rows: Record<string, unknown>[]
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
            .all(args.nodeId, maxDepth, args.relation) as Record<
            string,
            unknown
          >[]
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
            .all(args.nodeId, maxDepth) as Record<string, unknown>[]
        }
        return selectNodes(rows)
      },

      subtree: (_: unknown, args: { nodeId: string; maxDepth?: number }) => {
        const maxDepth = args.maxDepth ?? 100
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
          .all(args.nodeId, maxDepth) as Record<string, unknown>[]
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
        const conditions = ['(title LIKE ? OR description LIKE ?)']
        const params: unknown[] = [`%${args.query}%`, `%${args.query}%`]
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
          .all(...params, limit) as Record<string, unknown>[]
        return selectNodes(rows)
      },
    },

    Mutation: {
      createNode: (
        _: unknown,
        args: { type: string; title: string; description?: string },
      ) => {
        const id = generateId(args.type)
        const now = new Date().toISOString()
        db.raw.run(
          'INSERT INTO nodes (id, type, title, description, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            id,
            args.type,
            args.title,
            args.description ?? null,
            'draft',
            null,
            now,
            now,
          ],
        )
        return selectNode(db, id)
      },

      updateNode: (_: unknown, args: { id: string; status?: string }) => {
        const existing = db.raw
          .query('SELECT * FROM nodes WHERE id = ?')
          .get(args.id) as Record<string, unknown> | null
        if (!existing) throw new Error(`Node ${args.id} not found`)
        const now = new Date().toISOString()
        db.raw.run('UPDATE nodes SET status = ?, updated_at = ? WHERE id = ?', [
          args.status ?? existing.status,
          now,
          args.id,
        ])
        return selectNode(db, args.id)
      },

      approveNode: (_: unknown, args: { id: string }) => {
        const existing = db.raw
          .query('SELECT * FROM nodes WHERE id = ?')
          .get(args.id) as Record<string, unknown> | null
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
        return selectNode(db, args.id)
      },

      createEdge: (
        _: unknown,
        args: { sourceId: string; targetId: string; relation: string },
      ) => {
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
