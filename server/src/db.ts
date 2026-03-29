import { Database } from 'bun:sqlite'

export function createDb(path: string) {
  const db = new Database(path)

  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('project', 'feature', 'task')),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'approved', 'in_progress', 'done', 'blocked', 'cancelled')),
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS edges (
      source_id TEXT NOT NULL REFERENCES nodes(id),
      target_id TEXT NOT NULL REFERENCES nodes(id),
      relation TEXT NOT NULL CHECK(relation IN ('part_of', 'blocks')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source_id, target_id, relation)
    )
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)')
  db.run('CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status)')
  db.run(
    'CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id, relation)',
  )
  db.run(
    'CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id, relation)',
  )

  return {
    raw: db,
    close: () => db.close(),
  }
}
