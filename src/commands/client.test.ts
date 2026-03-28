import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

const CONFIG_PATH = resolve(homedir(), '.config', 'flowy', 'config.json')

describe('client command', () => {
  let originalConfig: string | null = null

  beforeEach(() => {
    originalConfig = existsSync(CONFIG_PATH)
      ? readFileSync(CONFIG_PATH, 'utf-8')
      : null
  })

  afterEach(() => {
    if (originalConfig !== null) {
      writeFileSync(CONFIG_PATH, originalConfig)
    } else if (existsSync(CONFIG_PATH)) {
      rmSync(CONFIG_PATH)
    }
  })

  test('exports a command group named client', async () => {
    const { clientCommand } = await import('./client.ts')
    expect(clientCommand.name()).toBe('client')
  })

  test('set name updates config', async () => {
    const { clientCommand } = await import('./client.ts')
    await clientCommand.parseAsync(['set', 'name', 'Acme Corp'], {
      from: 'user',
    })

    const { loadConfig } = await import('../util/config.ts')
    const config = loadConfig()
    expect(config.client.name).toBe('Acme Corp')
  })
})
