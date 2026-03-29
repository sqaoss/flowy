import { describe, expect, it } from 'vitest'
import { createDb } from './db.ts'

describe('createDb', () => {
  it('creates nodes and edges tables', () => {
    const db = createDb(':memory:')

    const tables = db.raw
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map((r) => r.name)

    expect(tables).toContain('nodes')
    expect(tables).toContain('edges')

    db.close()
  })

  it('rejects invalid node type', () => {
    const db = createDb(':memory:')

    expect(() =>
      db.raw.run(
        "INSERT INTO nodes (id, type, title) VALUES ('n1', 'invalid_type', 'Test')",
      ),
    ).toThrow()

    db.close()
  })

  it('rejects invalid status', () => {
    const db = createDb(':memory:')

    expect(() =>
      db.raw.run(
        "INSERT INTO nodes (id, type, title, status) VALUES ('n1', 'project', 'Test', 'invalid_status')",
      ),
    ).toThrow()

    db.close()
  })

  it('rejects invalid edge relation', () => {
    const db = createDb(':memory:')

    db.raw.run(
      "INSERT INTO nodes (id, type, title) VALUES ('n1', 'project', 'P1')",
    )
    db.raw.run(
      "INSERT INTO nodes (id, type, title) VALUES ('n2', 'feature', 'F1')",
    )

    expect(() =>
      db.raw.run(
        "INSERT INTO edges (source_id, target_id, relation) VALUES ('n2', 'n1', 'invalid_rel')",
      ),
    ).toThrow()

    db.close()
  })

  it('creates indexes on nodes and edges', () => {
    const db = createDb(':memory:')

    const indexes = db.raw
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
      )
      .all()
      .map((r) => r.name)

    expect(indexes).toContain('idx_nodes_type')
    expect(indexes).toContain('idx_nodes_status')
    expect(indexes).toContain('idx_edges_target')
    expect(indexes).toContain('idx_edges_source')

    db.close()
  })

  it('enables foreign keys', () => {
    const db = createDb(':memory:')

    const result = db.raw
      .query<{ foreign_keys: number }, []>('PRAGMA foreign_keys')
      .get()

    expect(result?.foreign_keys).toBe(1)

    db.close()
  })
})
