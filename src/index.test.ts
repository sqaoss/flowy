import { describe, expect, test, vi } from 'vitest'

vi.mock('./commands/approve.ts', () => ({
  approveCommand: { name: () => 'approve' },
}))
vi.mock('./commands/client.ts', () => ({
  clientCommand: { name: () => 'client' },
}))
vi.mock('./commands/feature.ts', () => ({
  featureCommand: { name: () => 'feature' },
}))
vi.mock('./commands/init.ts', () => ({
  initCommand: { name: () => 'init' },
}))
vi.mock('./commands/project.ts', () => ({
  projectCommand: { name: () => 'project' },
}))
vi.mock('./commands/search.ts', () => ({
  searchCommand: { name: () => 'search' },
}))
vi.mock('./commands/setup.ts', () => ({
  setupCommand: { name: () => 'setup' },
}))
vi.mock('./commands/status.ts', () => ({
  statusCommand: { name: () => 'status' },
}))
vi.mock('./commands/task.ts', () => ({
  taskCommand: { name: () => 'task' },
}))
vi.mock('./commands/tree.ts', () => ({
  treeCommand: { name: () => 'tree' },
}))
vi.mock('./commands/whoami.ts', () => ({
  whoamiCommand: { name: () => 'whoami' },
}))
vi.mock('./commands/billing.ts', () => ({
  billingCommand: { name: () => 'billing' },
}))
vi.mock('./commands/key.ts', () => ({
  keyCommand: { name: () => 'key' },
}))
vi.mock('./commands/serve.ts', () => ({
  serveCommand: { name: () => 'serve' },
}))
vi.mock('./commands/import.ts', () => ({
  importCommand: { name: () => 'import' },
}))
vi.mock('./commands/export.ts', () => ({
  exportCommand: { name: () => 'export' },
}))

describe('index.ts command registration', () => {
  test('registers billing and key commands', async () => {
    const { readFileSync } = await import('node:fs')
    const indexSource = readFileSync(
      new URL('./index.ts', import.meta.url).pathname,
      'utf-8',
    )

    expect(indexSource).toContain(
      "import { billingCommand } from './commands/billing.ts'",
    )
    expect(indexSource).toContain(
      "import { keyCommand } from './commands/key.ts'",
    )
    expect(indexSource).toContain('program.addCommand(billingCommand)')
    expect(indexSource).toContain('program.addCommand(keyCommand)')
  })

  test('registers the serve command', async () => {
    const { readFileSync } = await import('node:fs')
    const indexSource = readFileSync(
      new URL('./index.ts', import.meta.url).pathname,
      'utf-8',
    )

    expect(indexSource).toContain(
      "import { serveCommand } from './commands/serve.ts'",
    )
    expect(indexSource).toContain('program.addCommand(serveCommand)')
  })

  test('registers the import and export commands', async () => {
    const { readFileSync } = await import('node:fs')
    const indexSource = readFileSync(
      new URL('./index.ts', import.meta.url).pathname,
      'utf-8',
    )

    expect(indexSource).toContain(
      "import { importCommand } from './commands/import.ts'",
    )
    expect(indexSource).toContain(
      "import { exportCommand } from './commands/export.ts'",
    )
    expect(indexSource).toContain('program.addCommand(importCommand)')
    expect(indexSource).toContain('program.addCommand(exportCommand)')
  })
})
