import { spawnSync } from 'node:child_process'
import { Command, Option } from 'commander'
import { fingerprintKey, loadConfig, saveConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'
import { pinnedInstallSpec } from './serve.ts'

export const setupCommand = new Command('setup').description(
  'Configure the Flowy CLI \u2014 use "flowy setup local" or "flowy setup remote"',
)

const SKILL_PACKAGE = 'sqaoss/flowy'

/**
 * Install the Flowy agent skill, surfacing failure instead of swallowing it.
 *
 * `npx skills add` can fail (offline, npx unavailable, registry hiccup). If it
 * does, setup should still succeed \u2014 but the user must be told the skill was
 * NOT installed, with the exact command to retry, rather than silently
 * assuming their agent now knows the commands (F14).
 */
function installSkill(): void {
  const result = spawnSync('npx', ['skills', 'add', SKILL_PACKAGE, '--yes'], {
    stdio: 'inherit',
  })
  if (result.error != null || result.status !== 0) {
    const reason = result.error
      ? result.error.message
      : `exit code ${result.status}`
    console.error(
      `Warning: failed to install the Flowy agent skill (${reason}). ` +
        `Your agent will not know Flowy's commands until you install it manually:\n` +
        `  npx skills add ${SKILL_PACKAGE}`,
    )
  }
}

setupCommand
  .command('local')
  .description('Set up Flowy with a native local server (no Docker)')
  .action(async () => {
    try {
      // Pin the install to this CLI's exact version so the server can never
      // drift to a stale npm release behind a cached Docker layer (F15).
      const spec = pinnedInstallSpec()
      const install = spawnSync('bun', ['add', spec], { stdio: 'inherit' })
      if (install.status !== 0) {
        throw new Error(`Failed to install ${spec}.`)
      }

      const apiUrl = 'http://localhost:4000/graphql'
      const config = loadConfig()
      config.mode = 'local'
      config.apiUrl = apiUrl
      saveConfig(config)
      installSkill()

      output({
        mode: 'local',
        apiUrl,
        installed: spec,
        next: 'Run "flowy serve" to start the local server (binds 127.0.0.1:4000).',
      })
    } catch (error) {
      outputError(error)
    }
  })

setupCommand
  .command('remote')
  .description('Connect to the hosted Flowy service')
  .option('--email <email>', 'Email address for registration')
  .option(
    '--show-key',
    'Print the full API key instead of a non-reversible fingerprint',
  )
  .addOption(
    new Option(
      '--tier <tier>',
      'Subscription tier (optional — pick one later at checkout)',
    ).choices(['explorer', 'pro', 'team']),
  )
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
        `mutation Register($email: String!, $tier: String) {
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

      installSkill()

      const { user, apiKey, checkoutUrl } = data.register
      // Default output never leaks the secret; --show-key opts in (F35).
      output(
        opts.showKey
          ? { user, apiKey, checkoutUrl }
          : { user, keyFingerprint: fingerprintKey(apiKey), checkoutUrl },
      )
    } catch (error) {
      outputError(error)
    }
  })
