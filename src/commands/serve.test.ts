import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let mockSpawnSync: ReturnType<typeof vi.fn>
let mockOutputError: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockSpawnSync = vi.fn(() => ({ status: 0 }))
  mockOutputError = vi.fn()

  vi.doMock('node:child_process', () => ({
    spawnSync: mockSpawnSync,
  }))
  // Pretend the bundled server entry and its installed deps both exist so the
  // command takes its normal path deterministically — independent of whether
  // server/node_modules happens to be populated in this environment (CI runs
  // the root test job before installing server deps).
  vi.doMock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    return { ...actual, existsSync: () => true }
  })
  vi.doMock('../util/format.ts', () => ({
    output: vi.fn(),
    outputError: mockOutputError,
  }))
})

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('serve command', () => {
  test('exports a command named "serve"', async () => {
    const { serveCommand } = await import('./serve.ts')
    expect(serveCommand.name()).toBe('serve')
  })

  test('declares --port, --host and --db options', async () => {
    const { serveCommand } = await import('./serve.ts')
    const flags = serveCommand.options.map((o) => o.long)
    expect(flags).toContain('--port')
    expect(flags).toContain('--host')
    expect(flags).toContain('--db')
  })

  test('runs the bundled server with bun (no docker) on the chosen port/host', async () => {
    const { serveCommand } = await import('./serve.ts')
    await serveCommand.parseAsync(['--port', '4111', '--host', '127.0.0.1'], {
      from: 'user',
    })

    // The run invocation is the `bun` call whose args point at the bundled
    // server entry — not e.g. a `bun install` call. Target it explicitly so
    // the assertion does not depend on call ordering or environment state.
    const runCall = mockSpawnSync.mock.calls.find(
      (call) =>
        call[0] === 'bun' &&
        Array.isArray(call[1]) &&
        call[1].some((a: string) => a.endsWith('index.ts')),
    )
    expect(runCall).toBeDefined()
    const [, args, options] = runCall!
    // never invokes docker
    expect(mockSpawnSync.mock.calls.some((call) => call[0] === 'docker')).toBe(
      false,
    )
    // points bun at the bundled server entry
    expect(args.some((a: string) => a.endsWith('index.ts'))).toBe(true)
    expect(options.env.PORT).toBe('4111')
    expect(options.env.HOST).toBe('127.0.0.1')
  })
})

describe('pinnedInstallSpec', () => {
  test('derives the pinned package spec from package.json version', async () => {
    const { pinnedInstallSpec } = await import('./serve.ts')
    const { readFileSync } = await import('node:fs')
    const pkg = JSON.parse(
      readFileSync(
        new URL('../../package.json', import.meta.url).pathname,
        'utf-8',
      ),
    ) as { version: string }

    expect(pinnedInstallSpec()).toBe(`@sqaoss/flowy@${pkg.version}`)
    // never an unpinned install
    expect(pinnedInstallSpec()).not.toBe('@sqaoss/flowy')
  })
})
