import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { loadConfig, saveConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'

function findComposeFile(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  while (dir !== dirname(dir)) {
    const candidate = resolve(dir, 'docker-compose.yml')
    if (existsSync(candidate)) return candidate
    dir = dirname(dir)
  }
  throw new Error('docker-compose.yml not found in any parent directory.')
}

async function pollHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 1_000))
  }
  throw new Error(
    `Health check at ${url} did not respond within ${timeoutMs / 1_000}s.`,
  )
}

export const setupCommand = new Command('setup').description(
  'Configure the Flowy CLI — use "flowy setup local" or "flowy setup remote"',
)

setupCommand
  .command('local')
  .description('Set up Flowy with a local Docker server')
  .action(async () => {
    try {
      const dockerCheck = spawnSync('docker', ['--version'], {
        stdio: 'ignore',
      })
      if (dockerCheck.status !== 0) {
        throw new Error('Docker is required but was not found.')
      }

      const composePath = findComposeFile()
      spawnSync(
        'docker',
        ['compose', '-f', composePath, 'up', '-d', '--build'],
        {
          stdio: 'inherit',
        },
      )

      const apiUrl = 'http://localhost:4000/graphql'
      await pollHealth('http://localhost:4000/health')

      const config = loadConfig()
      config.mode = 'local'
      config.apiUrl = apiUrl
      saveConfig(config)
      output({ mode: 'local', apiUrl })
    } catch (error) {
      outputError(error)
    }
  })

setupCommand
  .command('remote')
  .description('Connect to the hosted Flowy service')
  .option('--email <email>', 'Email address for registration')
  .action(async (opts) => {
    try {
      if (!opts.email) {
        throw new Error('--email is required for registration')
      }

      const { graphql } = await import('../util/client.ts')

      const config = loadConfig()
      config.mode = 'remote'
      config.apiUrl = 'https://flowy-ai.fly.dev/graphql'
      saveConfig(config)

      const data = await graphql<{
        register: {
          user: { id: string; email: string; tier: string }
          apiKey: string
        }
      }>(
        `mutation Register($email: String!) {
          register(email: $email) {
            user { id email tier }
            apiKey
          }
        }`,
        { email: opts.email },
      )

      config.apiKey = data.register.apiKey
      saveConfig(config)

      spawnSync('npx', ['skills', 'add', 'sqaoss/flowy', '--yes'], {
        stdio: 'inherit',
      })

      output(data.register)
    } catch (error) {
      outputError(error)
    }
  })
