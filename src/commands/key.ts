import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { fingerprintKey, loadConfig, saveConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'

export const keyCommand = new Command('key').description('API key management')

keyCommand
  .command('rotate')
  .description('Rotate API key')
  .option(
    '--show-key',
    'Print the full API key instead of a non-reversible fingerprint',
  )
  .action(async (opts) => {
    try {
      const data = await graphql<{
        rotateApiKey: {
          user: {
            id: string
            email: string
            tier: string
            createdAt: string
            graceEndsAt: string | null
          }
          apiKey: string
        }
      }>(
        `mutation RotateApiKey {
          rotateApiKey {
            user { id email tier createdAt graceEndsAt }
            apiKey
          }
        }`,
      )

      const { user, apiKey } = data.rotateApiKey
      const config = loadConfig()
      config.apiKey = apiKey
      saveConfig(config)

      // Default output never leaks the secret; --show-key opts in (F35).
      output(
        opts.showKey
          ? { user, apiKey }
          : { user, keyFingerprint: fingerprintKey(apiKey) },
      )
    } catch (error) {
      outputError(error)
    }
  })
