import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { outputError } from '../util/format.ts'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..', '..')

/**
 * The exact, version-pinned npm spec for this CLI's own package. Used by
 * `setup local` so the installed server matches the CLI rather than drifting
 * to whatever an unpinned `bun add @sqaoss/flowy` happens to resolve.
 */
export function pinnedInstallSpec(): string {
  const pkg = JSON.parse(
    readFileSync(resolve(packageRoot, 'package.json'), 'utf-8'),
  ) as { name: string; version: string }
  return `${pkg.name}@${pkg.version}`
}

function serverDir(): string {
  return resolve(packageRoot, 'server')
}

function serverEntry(): string {
  return resolve(serverDir(), 'src', 'index.ts')
}

/** Install the bundled server's runtime deps once, if they're missing. */
function ensureServerDeps(dir: string): void {
  if (existsSync(resolve(dir, 'node_modules', 'graphql-yoga'))) return
  const install = spawnSync('bun', ['install', '--production'], {
    cwd: dir,
    stdio: 'inherit',
  })
  if (install.status !== 0) {
    throw new Error('Failed to install the bundled server dependencies.')
  }
}

export const serveCommand = new Command('serve')
  .description('Run the bundled local Flowy server natively (no Docker)')
  .option('-p, --port <port>', 'Port to bind', '4000')
  .option('-H, --host <host>', 'Hostname to bind', '127.0.0.1')
  .option('-d, --db <path>', 'SQLite database file path', './flowy.sqlite')
  .action((opts: { port: string; host: string; db: string }) => {
    try {
      const dir = serverDir()
      const entry = serverEntry()
      if (!existsSync(entry)) {
        throw new Error(
          `Bundled server not found at ${entry}. Reinstall ${pinnedInstallSpec()}.`,
        )
      }

      ensureServerDeps(dir)

      const result = spawnSync('bun', [entry], {
        cwd: dir,
        stdio: 'inherit',
        env: {
          ...process.env,
          PORT: String(opts.port),
          HOST: opts.host,
          FLOWY_DB_PATH: opts.db,
        },
      })
      if (result.status !== 0 && result.status !== null) {
        throw new Error(`Server exited with status ${result.status}.`)
      }
    } catch (error) {
      outputError(error)
    }
  })
