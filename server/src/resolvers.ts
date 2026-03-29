import type { createDb } from './db.ts'

type Db = ReturnType<typeof createDb>

export function createResolvers(db: Db) {
  return {
    Query: {
      node: (_: unknown, args: { id: string }) => {
        return (
          db.raw.query('SELECT * FROM nodes WHERE id = ?').get(args.id) ?? null
        )
      },

      nodes: (
        _: unknown,
        args: { type?: string; status?: string; parentId?: string },
      ) => {
        const conditions: string[] = []
        const params: unknown[] = []
        if (args.type) {
          conditions.push('type = ?')
          params.push(args.type)
        }
        if (args.status) {
          conditions.push('status = ?')
          params.push(args.status)
        }
        if (args.parentId) {
          conditions.push(
            'id IN (SELECT source_id FROM edges WHERE target_id = ? AND relation = ?)',
          )
          params.push(args.parentId, 'part_of')
        }
        const where =
          conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        return db.raw.query(`SELECT * FROM nodes ${where}`).all(...params)
      },

      tree: (_: unknown, args: { rootId: string }) => {
        return (
          db.raw.query('SELECT * FROM nodes WHERE id = ?').get(args.rootId) ??
          null
        )
      },

      search: (_: unknown, args: { query: string; type?: string }) => {
        const conditions = ['(title LIKE ? OR description LIKE ?)']
        const params: unknown[] = [`%${args.query}%`, `%${args.query}%`]
        if (args.type) {
          conditions.push('type = ?')
          params.push(args.type)
        }
        return db.raw
          .query(`SELECT * FROM nodes WHERE ${conditions.join(' AND ')}`)
          .all(...params)
      },
    },

    Mutation: {
      createNode: (
        _: unknown,
        args: {
          type: string
          title: string
          description?: string
          parentId?: string
          metadata?: string
        },
      ) => {
        const { nanoid } = require('nanoid') as { nanoid: () => string }
        const id = nanoid()
        const now = new Date().toISOString()
        db.raw.run(
          'INSERT INTO nodes (id, type, title, description, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            id,
            args.type,
            args.title,
            args.description ?? null,
            'draft',
            args.metadata ?? null,
            now,
            now,
          ],
        )
        if (args.parentId) {
          db.raw.run(
            'INSERT INTO edges (source_id, target_id, relation, created_at) VALUES (?, ?, ?, ?)',
            [id, args.parentId, 'part_of', now],
          )
        }
        return db.raw.query('SELECT * FROM nodes WHERE id = ?').get(id)
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
        const existing = db.raw
          .query('SELECT * FROM nodes WHERE id = ?')
          .get(args.id) as Record<string, unknown> | null
        if (!existing) throw new Error(`Node ${args.id} not found`)
        const now = new Date().toISOString()
        db.raw.run(
          'UPDATE nodes SET title = ?, description = ?, status = ?, metadata = ?, updated_at = ? WHERE id = ?',
          [
            args.title ?? existing.title,
            args.description ?? existing.description,
            args.status ?? existing.status,
            args.metadata ?? existing.metadata,
            now,
            args.id,
          ],
        )
        return db.raw.query('SELECT * FROM nodes WHERE id = ?').get(args.id)
      },

      deleteNode: (_: unknown, args: { id: string }) => {
        db.raw.run('DELETE FROM edges WHERE source_id = ? OR target_id = ?', [
          args.id,
          args.id,
        ])
        const result = db.raw.run('DELETE FROM nodes WHERE id = ?', [args.id])
        return result.changes > 0
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

      deleteEdge: (
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

    Node: {
      children: (parent: { id: string }) => {
        return db.raw
          .query(
            'SELECT n.* FROM nodes n JOIN edges e ON n.id = e.source_id WHERE e.target_id = ? AND e.relation = ?',
          )
          .all(parent.id, 'part_of')
      },

      blockedBy: (parent: { id: string }) => {
        return db.raw
          .query(
            'SELECT n.* FROM nodes n JOIN edges e ON n.id = e.source_id WHERE e.target_id = ? AND e.relation = ?',
          )
          .all(parent.id, 'blocks')
      },

      blocking: (parent: { id: string }) => {
        return db.raw
          .query(
            'SELECT n.* FROM nodes n JOIN edges e ON n.id = e.target_id WHERE e.source_id = ? AND e.relation = ?',
          )
          .all(parent.id, 'blocks')
      },
    },
  }
}
