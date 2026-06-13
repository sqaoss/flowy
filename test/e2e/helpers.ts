/**
 * End-to-end harness for the Flowy CLI.
 *
 * Unlike the unit suites (which `vi.mock` the transport boundary) and the
 * contract test (which fires raw GraphQL at the bundled server), this harness
 * exercises the *real* CLI binary against a *real* server over HTTP:
 *
 *   - `startServer()` spawns the bundled local server (`server/src/index.ts`)
 *     on an OS-assigned ephemeral port (PORT=0, parsed back from its banner)
 *     with an in-memory SQLite db, so runs are isolated and parallel-safe.
 *   - `runCli()` spawns `bun src/index.ts <args>` with `FLOWY_API_URL` pointed
 *     at that server and `HOME` redirected to a throwaway dir, so the CLI's
 *     `~/.config/flowy/config.json` is sandboxed per test run.
 *
 * The result is a genuine round-trip: stdin/argv/env in, real GraphQL over the
 * wire, JSON on stdout and a real process exit code out — the only kind of test
 * that can catch the F4/F9 dogfood regression classes.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
/** Repo root: test/e2e/helpers.ts -> ../../ */
export const repoRoot = resolve(here, '..', '..')
const serverEntry = resolve(repoRoot, 'server', 'src', 'index.ts')
const cliEntry = resolve(repoRoot, 'src', 'index.ts')

export interface RunningServer {
  /** Full GraphQL endpoint, e.g. http://127.0.0.1:54321/graphql */
  apiUrl: string
  /** Health endpoint, used by readiness polling. */
  healthUrl: string
  stop(): Promise<void>
}

/** Wait until the server answers GET /health 200, or throw after `timeoutMs`. */
async function waitForHealth(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(
    `Server health check timed out after ${timeoutMs}ms (${url}): ${String(lastErr)}`,
  )
}

/**
 * Boot the bundled local server on an ephemeral port with an in-memory db.
 * Resolves once /health is reachable.
 */
export async function startServer(): Promise<RunningServer> {
  const child = spawn('bun', [serverEntry], {
    cwd: resolve(repoRoot, 'server'),
    env: {
      ...process.env,
      PORT: '0',
      HOST: '127.0.0.1',
      FLOWY_DB_PATH: ':memory:',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const port = await new Promise<number>((resolveFn, rejectFn) => {
    let buffer = ''
    const timer = setTimeout(() => {
      rejectFn(new Error(`Server did not announce a port. Output:\n${buffer}`))
    }, 15_000)

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString()
      // The server logs: "...running on http://127.0.0.1:<port>"
      const match = buffer.match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if (match) {
        clearTimeout(timer)
        child.stdout?.off('data', onData)
        child.stderr?.off('data', onData)
        resolveFn(Number(match[1]))
      }
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', (err) => {
      clearTimeout(timer)
      rejectFn(err)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      rejectFn(new Error(`Server exited early with code ${code}:\n${buffer}`))
    })
  })

  const apiUrl = `http://127.0.0.1:${port}/graphql`
  const healthUrl = `http://127.0.0.1:${port}/health`
  await waitForHealth(healthUrl)

  return {
    apiUrl,
    healthUrl,
    stop() {
      return new Promise<void>((resolveFn) => {
        if (child.exitCode != null || child.signalCode != null) {
          resolveFn()
          return
        }
        child.once('exit', () => resolveFn())
        child.kill('SIGTERM')
        // Hard backstop so a wedged child never hangs the suite.
        setTimeout(() => {
          child.kill('SIGKILL')
          resolveFn()
        }, 2_000)
      })
    },
  }
}

export interface CliResult {
  code: number
  stdout: string
  stderr: string
  /** `stdout` parsed as JSON (CLI prints JSON to stdout on success). */
  json<T = unknown>(): T
}

export interface CliEnv {
  /** GraphQL endpoint the CLI talks to. */
  apiUrl: string
  /** Sandbox HOME so config lands in a throwaway dir, not the real ~/.config. */
  home: string
  /** Optional extra env (FLOWY_PROJECT, FLOWY_FEATURE, ...). */
  extraEnv?: Record<string, string>
  /** Optional cwd for the CLI process (project dir-mapping resolution). */
  cwd?: string
  /** Optional stdin payload (e.g. for `--description-file -`). */
  stdin?: string
}

/** Run the real CLI as a child process and capture its exit code + streams. */
export function runCli(args: string[], env: CliEnv): Promise<CliResult> {
  return new Promise((resolveFn, rejectFn) => {
    const child = spawn('bun', [cliEntry, ...args], {
      cwd: env.cwd ?? repoRoot,
      env: {
        ...process.env,
        HOME: env.home,
        // Defang any inherited Flowy config so only our sandbox applies.
        FLOWY_API_KEY: '',
        FLOWY_PROJECT: '',
        FLOWY_FEATURE: '',
        FLOWY_API_URL: env.apiUrl,
        ...env.extraEnv,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString()
    })
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString()
    })
    child.on('error', rejectFn)
    child.on('close', (code) => {
      resolveFn({
        code: code ?? 0,
        stdout,
        stderr,
        json<T = unknown>(): T {
          try {
            return JSON.parse(stdout) as T
          } catch (err) {
            throw new Error(
              `CLI stdout was not JSON (exit ${code}).\nstdout:\n${stdout}\nstderr:\n${stderr}\n${String(err)}`,
            )
          }
        },
      })
    })

    if (env.stdin != null) {
      child.stdin.write(env.stdin)
    }
    child.stdin.end()
  })
}

/** Create an isolated HOME dir for a CLI run; remember to clean it up. */
export function makeHome(): string {
  return mkdtempSync(join(tmpdir(), 'flowy-e2e-home-'))
}

/** Best-effort recursive cleanup of a temp dir. */
export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
