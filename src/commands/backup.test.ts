import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let mockOutput: ReturnType<typeof vi.fn>
let mockOutputError: ReturnType<typeof vi.fn>
let workDir: string

// `bun:sqlite` is unavailable under the Node-based root test runner, so these
// tests drive a real `bun` subprocess to seed and read SQLite files. That keeps
// the row-level assertions genuine (open the backup, compare rows) without
// importing `bun:sqlite` into Node — exactly how the CLI runs at runtime.

/** Create a populated SQLite DB at `path` via a real bun subprocess. */
function seedDb(
  path: string,
  rows: Array<{ id: string; title: string }> = [
    { id: 'n1', title: 'Alpha' },
    { id: 'n2', title: 'Beta' },
    { id: 'n3', title: 'Gamma' },
  ],
): Array<{ id: string; title: string }> {
  const script = `
    const { Database } = require('bun:sqlite')
    const db = new Database(process.argv[1])
    db.run('PRAGMA journal_mode = WAL')
    db.run('CREATE TABLE nodes (id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL)')
    const rows = JSON.parse(process.argv[2])
    for (const r of rows) db.run('INSERT INTO nodes (id, type, title) VALUES (?, ?, ?)', [r.id, 'task', r.title])
    db.close()
  `
  const res = spawnSync('bun', ['-e', script, path, JSON.stringify(rows)], {
    encoding: 'utf-8',
  })
  if (res.status !== 0) throw new Error(`seedDb failed: ${res.stderr}`)
  return rows
}

/** Read all node {id,title} rows from a SQLite file via a real bun subprocess. */
function readNodes(path: string): Array<{ id: string; title: string }> {
  const script = `
    const { Database } = require('bun:sqlite')
    const db = new Database(process.argv[1], { readonly: true })
    console.log(JSON.stringify(db.query('SELECT id, title FROM nodes ORDER BY id').all()))
    db.close()
  `
  const res = spawnSync('bun', ['-e', script, path], { encoding: 'utf-8' })
  if (res.status !== 0) throw new Error(`readNodes failed: ${res.stderr}`)
  return JSON.parse(res.stdout.trim())
}

beforeEach(() => {
  mockOutput = vi.fn()
  mockOutputError = vi.fn()
  vi.doMock('../util/format.ts', () => ({
    output: mockOutput,
    outputError: mockOutputError,
  }))
  workDir = mkdtempSync(join(tmpdir(), 'flowy-backup-'))
  delete process.env.FLOWY_DB_PATH
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
  delete process.env.FLOWY_DB_PATH
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('backup command', () => {
  test('exports a command named "backup"', async () => {
    const { backupCommand } = await import('./backup.ts')
    expect(backupCommand.name()).toBe('backup')
  })

  test('declares a --db option', async () => {
    const { backupCommand } = await import('./backup.ts')
    const flags = backupCommand.options.map((o) => o.long)
    expect(flags).toContain('--db')
  })

  test('writes a valid SQLite snapshot whose rows match the source DB', async () => {
    const src = join(workDir, 'flowy.sqlite')
    const dest = join(workDir, 'backup.sqlite')
    const expected = seedDb(src)

    const { backupCommand } = await import('./backup.ts')
    await backupCommand.parseAsync([dest, '--db', src], { from: 'user' })

    expect(mockOutputError).not.toHaveBeenCalled()
    expect(existsSync(dest)).toBe(true)
    // The backup is a real, openable SQLite database with identical rows.
    expect(readNodes(dest)).toEqual(expected)
  })

  test('resolves the DB path from FLOWY_DB_PATH when --db is omitted', async () => {
    const src = join(workDir, 'env.sqlite')
    const dest = join(workDir, 'backup.sqlite')
    const expected = seedDb(src)
    process.env.FLOWY_DB_PATH = src

    const { backupCommand } = await import('./backup.ts')
    await backupCommand.parseAsync([dest], { from: 'user' })

    expect(mockOutputError).not.toHaveBeenCalled()
    expect(readNodes(dest)).toEqual(expected)
  })

  test('produces a consistent snapshot while the source DB is open (WAL)', async () => {
    const src = join(workDir, 'flowy.sqlite')
    const dest = join(workDir, 'backup.sqlite')
    const expected = seedDb(src)

    // A long-lived bun process holds the DB open to mimic a running server.
    const holder = spawnSync(
      'bun',
      [
        '-e',
        `const { Database } = require('bun:sqlite'); const db = new Database(process.argv[1]); db.query('SELECT 1').get(); Bun.sleepSync(50); db.close()`,
        src,
      ],
      { encoding: 'utf-8' },
    )
    expect(holder.status).toBe(0)

    const { backupCommand } = await import('./backup.ts')
    await backupCommand.parseAsync([dest, '--db', src], { from: 'user' })

    expect(mockOutputError).not.toHaveBeenCalled()
    expect(readNodes(dest)).toEqual(expected)
  })

  test('errors when the source DB does not exist', async () => {
    const dest = join(workDir, 'backup.sqlite')
    const missing = join(workDir, 'nope.sqlite')

    const { backupCommand } = await import('./backup.ts')
    await backupCommand.parseAsync([dest, '--db', missing], { from: 'user' })

    expect(mockOutputError).toHaveBeenCalled()
    expect(existsSync(dest)).toBe(false)
  })

  test('reports the source and destination on success', async () => {
    const src = join(workDir, 'flowy.sqlite')
    const dest = join(workDir, 'backup.sqlite')
    seedDb(src)

    const { backupCommand } = await import('./backup.ts')
    await backupCommand.parseAsync([dest, '--db', src], { from: 'user' })

    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({ source: src, file: dest }),
    )
  })
})

describe('restore command', () => {
  test('exports a command named "restore"', async () => {
    const { restoreCommand } = await import('./backup.ts')
    expect(restoreCommand.name()).toBe('restore')
  })

  test('declares --db and --force options', async () => {
    const { restoreCommand } = await import('./backup.ts')
    const flags = restoreCommand.options.map((o) => o.long)
    expect(flags).toContain('--db')
    expect(flags).toContain('--force')
  })

  test('round-trips: restoring a backup reproduces the original rows', async () => {
    const src = join(workDir, 'flowy.sqlite')
    const backup = join(workDir, 'backup.sqlite')
    const target = join(workDir, 'restored.sqlite')
    const expected = seedDb(src)

    const { backupCommand, restoreCommand } = await import('./backup.ts')
    await backupCommand.parseAsync([backup, '--db', src], { from: 'user' })
    await restoreCommand.parseAsync([backup, '--db', target], { from: 'user' })

    expect(mockOutputError).not.toHaveBeenCalled()
    expect(readNodes(target)).toEqual(expected)
  })

  test('refuses to clobber an existing DB without --force', async () => {
    const src = join(workDir, 'flowy.sqlite')
    const backup = join(workDir, 'backup.sqlite')
    const target = join(workDir, 'existing.sqlite')
    // Pre-existing target whose content must NOT be overwritten.
    const original = seedDb(target, [{ id: 'keep', title: 'Original' }])
    // Source (and thus backup) differs from the existing target.
    seedDb(src, [{ id: 'new', title: 'Incoming' }])

    const { backupCommand, restoreCommand } = await import('./backup.ts')
    await backupCommand.parseAsync([backup, '--db', src], { from: 'user' })

    mockOutputError.mockClear()
    await restoreCommand.parseAsync([backup, '--db', target], { from: 'user' })

    expect(mockOutputError).toHaveBeenCalled()
    // The existing DB is untouched.
    expect(readNodes(target)).toEqual(original)
  })

  test('overwrites an existing DB when --force is given', async () => {
    const src = join(workDir, 'flowy.sqlite')
    const backup = join(workDir, 'backup.sqlite')
    const target = join(workDir, 'existing.sqlite')
    seedDb(target, [{ id: 'old', title: 'Stale' }]) // pre-existing, replaced
    seedDb(src, [{ id: 'z9', title: 'New' }])

    const { backupCommand, restoreCommand } = await import('./backup.ts')
    await backupCommand.parseAsync([backup, '--db', src], { from: 'user' })
    await restoreCommand.parseAsync([backup, '--db', target, '--force'], {
      from: 'user',
    })

    expect(mockOutputError).not.toHaveBeenCalled()
    expect(readNodes(target)).toEqual([{ id: 'z9', title: 'New' }])
  })

  test('errors when the backup source does not exist', async () => {
    const target = join(workDir, 'restored.sqlite')
    const missing = join(workDir, 'nope.sqlite')

    const { restoreCommand } = await import('./backup.ts')
    await restoreCommand.parseAsync([missing, '--db', target], { from: 'user' })

    expect(mockOutputError).toHaveBeenCalled()
    expect(existsSync(target)).toBe(false)
  })

  test('errors when the backup source is not a valid SQLite database', async () => {
    const target = join(workDir, 'restored.sqlite')
    const garbage = join(workDir, 'garbage.bin')
    writeFileSync(garbage, 'this is not a sqlite database')

    const { restoreCommand } = await import('./backup.ts')
    await restoreCommand.parseAsync([garbage, '--db', target], { from: 'user' })

    // A corrupt source must surface as a clean snapshot failure, not an
    // incidental downstream error (e.g. a rename ENOENT).
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'BACKUP_ERROR' }),
    )
    expect(existsSync(target)).toBe(false)
    // No staged temp file is left behind.
    expect(existsSync(`${target}.restore-tmp`)).toBe(false)
  })
})
