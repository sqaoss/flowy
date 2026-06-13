import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'vitest'
import { LATEST_VERSION, rebuildTable, runMigrations } from './migrations.ts'

function userVersion(db: Database): number {
  const row = db
    .query<{ user_version: number }, []>('PRAGMA user_version')
    .get()
  return row?.user_version ?? 0
}

function tableNames(db: Database): string[] {
  return db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    .all()
    .map((r) => r.name)
}

function columnNames(db: Database, table: string): string[] {
  return db
    .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
    .all()
    .map((r) => r.name)
}

describe('runMigrations', () => {
  it('brings a fresh DB to the latest user_version', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    expect(userVersion(db)).toBe(LATEST_VERSION)
    db.close()
  })

  it('creates the nodes and edges tables on a fresh DB', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const tables = tableNames(db)
    expect(tables).toContain('nodes')
    expect(tables).toContain('edges')
    db.close()
  })

  it('is a no-op when run twice (idempotent)', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const versionAfterFirst = userVersion(db)
    // second run must not throw and must not change the version
    runMigrations(db)
    expect(userVersion(db)).toBe(versionAfterFirst)
    expect(userVersion(db)).toBe(LATEST_VERSION)
    db.close()
  })

  it('upgrades an old-shaped DB forward without losing data', () => {
    const db = new Database(':memory:')
    // Simulate a March-era schema: nodes table WITHOUT a metadata column,
    // and a CHECK constraint that does not yet allow newer vocabulary.
    db.run(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('project', 'feature', 'task')),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'approved', 'in_progress', 'done')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    db.run(`
      CREATE TABLE edges (
        source_id TEXT NOT NULL REFERENCES nodes(id),
        target_id TEXT NOT NULL REFERENCES nodes(id),
        relation TEXT NOT NULL CHECK(relation IN ('part_of', 'blocks')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (source_id, target_id, relation)
      )
    `)
    db.run(
      "INSERT INTO nodes (id, type, title, description, status) VALUES ('proj_old', 'project', 'Legacy Project', 'from march', 'in_progress')",
    )

    runMigrations(db)

    expect(userVersion(db)).toBe(LATEST_VERSION)
    // metadata column now exists
    expect(columnNames(db, 'nodes')).toContain('metadata')
    // legacy row preserved
    const row = db
      .query<
        { id: string; title: string; status: string; metadata: string | null },
        []
      >('SELECT id, title, status, metadata FROM nodes WHERE id = ?')
      .get('proj_old') as {
      id: string
      title: string
      status: string
      metadata: string | null
    }
    expect(row.id).toBe('proj_old')
    expect(row.title).toBe('Legacy Project')
    expect(row.status).toBe('in_progress')
    db.close()
  })

  it('after migration the new vocabulary (blocked, cancelled) is accepted', () => {
    const db = new Database(':memory:')
    // Old DB with a restrictive status CHECK (no blocked/cancelled)
    db.run(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('project', 'feature', 'task')),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'approved', 'in_progress', 'done')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    db.run(`
      CREATE TABLE edges (
        source_id TEXT NOT NULL REFERENCES nodes(id),
        target_id TEXT NOT NULL REFERENCES nodes(id),
        relation TEXT NOT NULL CHECK(relation IN ('part_of', 'blocks')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (source_id, target_id, relation)
      )
    `)
    db.run("INSERT INTO nodes (id, type, title) VALUES ('task_1', 'task', 'T')")

    runMigrations(db)

    // The CHECK rebuild should now permit 'cancelled'
    expect(() =>
      db.run("UPDATE nodes SET status = 'cancelled' WHERE id = 'task_1'"),
    ).not.toThrow()
  })

  describe('rebuildTable helper', () => {
    it('rebuilds a table with a new CHECK constraint, preserving rows', () => {
      const db = new Database(':memory:')
      db.run(`
        CREATE TABLE widgets (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK(kind IN ('a', 'b'))
        )
      `)
      db.run("INSERT INTO widgets (id, kind) VALUES ('w1', 'a')")

      rebuildTable(
        db,
        'widgets',
        (tmp) => `
          CREATE TABLE ${tmp} (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL CHECK(kind IN ('a', 'b', 'c'))
          )
        `,
        ['id', 'kind'],
      )

      // existing row preserved
      const row = db
        .query<{ id: string; kind: string }, []>(
          'SELECT id, kind FROM widgets WHERE id = ?',
        )
        .get('w1') as { id: string; kind: string }
      expect(row).toEqual({ id: 'w1', kind: 'a' })
      // new value now allowed by the widened CHECK
      expect(() =>
        db.run("INSERT INTO widgets (id, kind) VALUES ('w2', 'c')"),
      ).not.toThrow()
      db.close()
    })
  })

  it('preserves edges across a nodes CHECK-rebuild migration', () => {
    const db = new Database(':memory:')
    db.run(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('project', 'feature', 'task')),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'approved', 'in_progress', 'done')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    db.run(`
      CREATE TABLE edges (
        source_id TEXT NOT NULL REFERENCES nodes(id),
        target_id TEXT NOT NULL REFERENCES nodes(id),
        relation TEXT NOT NULL CHECK(relation IN ('part_of', 'blocks')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (source_id, target_id, relation)
      )
    `)
    db.run(
      "INSERT INTO nodes (id, type, title) VALUES ('proj_1', 'project', 'P')",
    )
    db.run(
      "INSERT INTO nodes (id, type, title) VALUES ('feat_1', 'feature', 'F')",
    )
    db.run(
      "INSERT INTO edges (source_id, target_id, relation) VALUES ('feat_1', 'proj_1', 'part_of')",
    )

    runMigrations(db)

    const edgeCount = db
      .query<{ c: number }, []>('SELECT COUNT(*) AS c FROM edges')
      .get() as { c: number }
    expect(edgeCount.c).toBe(1)
    db.close()
  })
})
