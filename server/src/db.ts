import { Database } from 'bun:sqlite'
import { runMigrations } from './migrations.ts'

export type FlowyDb = ReturnType<typeof createDb>

export function createDb(path: string) {
  const db = new Database(path)

  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')

  runMigrations(db)

  return {
    raw: db,
    close: () => db.close(),
  }
}
