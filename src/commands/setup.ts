import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { Command, Option } from 'commander'
import { loadConfig, saveConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'

const COMPOSE_CONTENT = `services:
  server:
    build:
      context: .
      dockerfile_inline: |
        FROM oven/bun:1.3.11
        WORKDIR /app
        RUN bun init -y && bun add @sqaoss/flowy
        WORKDIR /app/node_modules/@sqaoss/flowy/server
        RUN bun install --production
        EXPOSE 4000
        VOLUME /data
        CMD ["bun", "src/index.ts"]
    ports:
      - "4000:4000"
    volumes:
      - flowy-data:/data
    environment:
      - FLOWY_DB_PATH=/data/flowy.sqlite
      - PORT=4000
    healthcheck:
      test: ["CMD", "bun", "-e", "fetch('http://localhost:4000/health').then(r => r.ok ? process.exit(0) : process.exit(1))"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  flowy-data:
`

function ensureComposeFile(): string {
  const dir = resolve(homedir(), '.config', 'flowy')
  mkdirSync(dir, { recursive: true })
  const composePath = resolve(dir, 'docker-compose.yml')
  writeFileSync(composePath, COMPOSE_CONTENT)
  return composePath
}

async function pollHealth(url: string, timeoutMs = 60_000): Promise<void> {
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
  'Configure the Flowy CLI \u2014 use "flowy setup local" or "flowy setup remote"',
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

      const composePath = ensureComposeFile()
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
      spawnSync('npx', ['skills', 'add', 'sqaoss/flowy', '--yes'], {
        stdio: 'inherit',
      })

      output({ mode: 'local', apiUrl })
    } catch (error) {
      outputError(error)
    }
  })

setupCommand
  .command('remote')
  .description('Connect to the hosted Flowy service')
  .option('--email <email>', 'Email address for registration')
  .addOption(
    new Option('--tier <tier>', 'Subscription tier').choices([
      'explorer',
      'pro',
      'team',
    ]),
  )
  .action(async (opts) => {
    try {
      if (!opts.email) {
        throw new Error('--email is required for registration')
      }
      if (!opts.tier) {
        throw new Error('--tier is required for registration')
      }

      const { graphql } = await import('../util/client.ts')

      const config = loadConfig()
      config.mode = 'remote'
      config.apiUrl = 'https://flowy-ai.fly.dev/graphql'
      saveConfig(config)

      const data = await graphql<{
        register: {
          user: {
            id: string
            email: string
            tier: string
            createdAt: string
            graceEndsAt: string
          }
          apiKey: string
          checkoutUrl: string
        }
      }>(
        `mutation Register($email: String!, $tier: String!) {
          register(email: $email, tier: $tier) {
            user { id email tier createdAt graceEndsAt }
            apiKey
            checkoutUrl
          }
        }`,
        { email: opts.email, tier: opts.tier },
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
