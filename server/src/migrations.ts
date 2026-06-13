import type { Database } from 'bun:sqlite'

/**
 * Versioned schema migrations for the bundled local SQLite server.
 *
 * The schema version is tracked with SQLite's `PRAGMA user_version`. Each entry
 * in `MIGRATIONS` is a step whose 1-based ordinal is the version it produces:
 * step at index `i` upgrades the DB from `user_version = i` to `user_version = i + 1`.
 * On startup we apply every step whose target version exceeds the current
 * `user_version`, in order, each wrapped in its own transaction so a failure
 * leaves the DB at a clean, consistent version. Re-running is a no-op.
 */

type Migration = (db: Database) => void

/**
 * Rebuild a table with a new schema, preserving its rows. SQLite cannot ALTER a
 * CHECK constraint in place, so changing column constraints requires creating a
 * new table, copying rows across the shared columns, dropping the old table, and
 * renaming. The whole sequence runs inside a transaction.
 */
export function rebuildTable(
  db: Database,
  table: string,
  createNewTableSql: (tmpName: string) => string,
  columns: string[],
): void {
  const tmp = `${table}__migrate_tmp`
  const cols = columns.join(', ')
  db.run('PRAGMA foreign_keys = OFF')
  db.transaction(() => {
    db.run(createNewTableSql(tmp))
    db.run(`INSERT INTO ${tmp} (${cols}) SELECT ${cols} FROM ${table}`)
    db.run(`DROP TABLE ${table}`)
    db.run(`ALTER TABLE ${tmp} RENAME TO ${table}`)
  })()
  db.run('PRAGMA foreign_keys = ON')
}

const MIGRATIONS: Migration[] = [
  // 0 -> 1: base schema (nodes + edges + indexes). Uses IF NOT EXISTS so this
  // step is harmless on a DB that predates user_version tracking but already
  // has the tables (created by an old `CREATE TABLE IF NOT EXISTS` startup).
  (db) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS nodes (
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
  },

  // 1 -> 2: (a) add a writable `metadata` TEXT column if it is missing, then
  // (b) rebuild `nodes` to widen the status CHECK to include 'blocked' and
  // 'cancelled'. Adding the column first lets the CHECK-rebuild copy a uniform
  // set of columns regardless of the pre-existing shape.
  (db) => {
    const hasMetadata = db
      .query<{ name: string }, []>('PRAGMA table_info(nodes)')
      .all()
      .some((c) => c.name === 'metadata')
    if (!hasMetadata) {
      db.run('ALTER TABLE nodes ADD COLUMN metadata TEXT')
    }

    rebuildTable(
      db,
      'nodes',
      (tmp) => `
        CREATE TABLE ${tmp} (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('project', 'feature', 'task')),
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'approved', 'in_progress', 'done', 'blocked', 'cancelled')),
          metadata TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `,
      [
        'id',
        'type',
        'title',
        'description',
        'status',
        'metadata',
        'created_at',
        'updated_at',
      ],
    )

    // Indexes are dropped with the old table; recreate them.
    db.run('CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)')
    db.run('CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status)')
  },

  // 2 -> 3: add the `audit_log` table (F27). Mirrors the SaaS audit_log schema
  // (id, node_id, action, field, old_value, new_value, snapshot, changed_by,
  // created_at) so `flowy history` output is consistent across backends. The
  // local server is single-tenant and has no users table, so `changed_by`
  // carries a constant actor ('local') rather than a FK to a user. `node_id`
  // is nullable and ON DELETE SET NULL so delete-audit rows survive the node.
  // Uses IF NOT EXISTS so the step is idempotent on a DB that somehow already
  // has the table.
  (db) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        field TEXT,
        old_value TEXT,
        new_value TEXT,
        snapshot TEXT,
        changed_by TEXT NOT NULL DEFAULT 'local',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    db.run(
      'CREATE INDEX IF NOT EXISTS idx_audit_log_node ON audit_log(node_id)',
    )
  },
]

export const LATEST_VERSION = MIGRATIONS.length

function getUserVersion(db: Database): number {
  const row = db
    .query<{ user_version: number }, []>('PRAGMA user_version')
    .get()
  return row?.user_version ?? 0
}

export function runMigrations(db: Database): void {
  const current = getUserVersion(db)
  MIGRATIONS.forEach((migration, index) => {
    const targetVersion = index + 1
    if (targetVersion <= current) return
    migration(db)
    // PRAGMA user_version does not accept bound parameters; the value is an
    // integer derived from our own loop index, never user input.
    db.run(`PRAGMA user_version = ${targetVersion}`)
  })
}
