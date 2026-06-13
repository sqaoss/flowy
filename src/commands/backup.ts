import { spawnSync } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { Command } from 'commander'
import { output, outputError } from '../util/format.ts'

/**
 * Resolve the local SQLite database path the bundled server uses, from the same
 * sources `server/src/index.ts` and `flowy serve` honour:
 *   1. an explicit `--db <path>` flag
 *   2. the `FLOWY_DB_PATH` env var
 *   3. the default `./flowy.sqlite`
 */
export function resolveDbPath(dbOpt?: string): string {
  return dbOpt ?? process.env.FLOWY_DB_PATH ?? './flowy.sqlite'
}

/**
 * Snapshot one SQLite database into another file with `VACUUM INTO`.
 *
 * `VACUUM INTO` takes a transactionally-consistent snapshot even while the
 * source is open/being written by a running server (it reads under a read
 * transaction), and writes a single fully-checkpointed file with no `-wal`/
 * `-shm` sidecars — strictly safer than copying the file bytes. It also fails
 * cleanly if `src` is not a valid SQLite database, which doubles as validation.
 *
 * Runs in a `bun` subprocess so this module never imports `bun:sqlite`
 * (unavailable under the Node-based unit-test runner); the CLI itself always
 * runs under bun, so the subprocess shares the same runtime.
 */
function vacuumInto(src: string, dest: string): void {
  // Note: `bun -e` does not reliably exit non-zero on an uncaught throw, so the
  // script explicitly catches, writes the message to stderr, and exits 1 — that
  // is what lets the parent distinguish a corrupt source from a clean snapshot.
  const script = `
    const { Database } = require('bun:sqlite')
    try {
      const db = new Database(process.argv[1], { readonly: true })
      try {
        db.run('VACUUM INTO ?', [process.argv[2]])
      } finally {
        db.close()
      }
    } catch (e) {
      console.error(e && e.message ? e.message : String(e))
      process.exit(1)
    }
  `
  const result = spawnSync('bun', ['-e', script, src, dest], {
    encoding: 'utf-8',
  })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    const err = new Error(
      `Failed to snapshot SQLite database ${src}${detail ? `: ${detail}` : '.'}`,
    ) as Error & { code?: string }
    err.code = 'BACKUP_ERROR'
    throw err
  }
}

/** Remove a SQLite file together with its `-wal`/`-shm` sidecars. */
function removeDbFiles(path: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    rmSync(`${path}${suffix}`, { force: true })
  }
}

export const backupCommand = new Command('backup')
  .description(
    'Write a consistent file-level snapshot of the local SQLite database',
  )
  .argument('<dest>', 'Path to write the backup file to')
  .option(
    '-d, --db <path>',
    'SQLite database to back up (default: $FLOWY_DB_PATH or ./flowy.sqlite)',
  )
  .action((dest: string, opts: { db?: string }) => {
    try {
      const src = resolveDbPath(opts.db)
      if (!existsSync(src)) {
        const err = new Error(
          `No SQLite database at ${resolve(src)}. ` +
            `Set --db or FLOWY_DB_PATH, or start the server first.`,
        ) as Error & { code?: string }
        err.code = 'NOT_FOUND'
        throw err
      }
      // VACUUM INTO refuses to write an existing file, so clear a stale dest.
      removeDbFiles(dest)
      vacuumInto(src, dest)
      output({ source: src, file: dest })
    } catch (error) {
      outputError(error)
    }
  })

export const restoreCommand = new Command('restore')
  .description('Restore the local SQLite database from a backup file')
  .argument('<src>', 'Path to a backup file produced by "flowy backup"')
  .option(
    '-d, --db <path>',
    'SQLite database to restore into (default: $FLOWY_DB_PATH or ./flowy.sqlite)',
  )
  .option('-f, --force', 'Overwrite the target database if it already exists')
  .action((src: string, opts: { db?: string; force?: boolean }) => {
    try {
      if (!existsSync(src)) {
        const err = new Error(`No backup file at ${resolve(src)}.`) as Error & {
          code?: string
        }
        err.code = 'NOT_FOUND'
        throw err
      }
      const target = resolveDbPath(opts.db)
      if (existsSync(target) && !opts.force) {
        const err = new Error(
          `Target database ${resolve(target)} already exists. ` +
            `Re-run with --force to overwrite it (the current data will be lost).`,
        ) as Error & { code?: string }
        err.code = 'TARGET_EXISTS'
        throw err
      }
      // VACUUM INTO validates that `src` is a real SQLite database and writes a
      // clean single-file copy. Stage it next to the target first, so a corrupt
      // backup never destroys the existing DB before validation succeeds.
      const staged = `${target}.restore-tmp`
      removeDbFiles(staged)
      try {
        vacuumInto(src, staged)
      } catch (error) {
        removeDbFiles(staged)
        throw error
      }
      // Validation passed — swap the staged copy into place. `staged` sits in
      // the same directory as `target`, so this rename stays on one filesystem.
      // VACUUM INTO never creates `-wal`/`-shm` sidecars, so only the main file
      // needs moving.
      removeDbFiles(target)
      renameSync(staged, target)
      output({ restored: target, source: src })
    } catch (error) {
      outputError(error)
    }
  })
