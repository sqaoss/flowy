import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { loadConfig, saveConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'

export const setupCommand = new Command('setup')
  .description('Configure the Flowy CLI for SaaS or self-hosted mode')
  .option('--mode <mode>', 'Setup mode: saas or local')
  .option('--email <email>', 'Email address for SaaS registration')
  .option('--api-url <url>', 'API URL for self-hosted server')
  .option('--api-key <key>', 'Existing API key to configure')
  .action(async (opts) => {
    try {
      const config = loadConfig()

      if (opts.apiKey) {
        config.apiKey = opts.apiKey
        saveConfig(config)
        output({ apiKey: config.apiKey })
        return
      }

      if (opts.mode === 'local') {
        config.mode = 'local'
        if (opts.apiUrl) {
          config.apiUrl = opts.apiUrl
        }
        saveConfig(config)
        output({ mode: config.mode, apiUrl: config.apiUrl })
        return
      }

      if (opts.mode === 'saas') {
        if (!opts.email) {
          outputError(new Error('--email is required for SaaS registration'))
          return
        }

        const data = await graphql<{
          register: { user: { id: string; email: string }; apiKey: string }
        }>(
          `mutation Register($email: String!) {
            register(email: $email) {
              user { id email tier createdAt }
              apiKey
            }
          }`,
          { email: opts.email },
        )

        config.mode = 'saas'
        config.apiKey = data.register.apiKey
        saveConfig(config)
        output(data.register)
        return
      }

      outputError(
        new Error(
          'Provide --mode (saas|local) or --api-key. See flowy setup --help.',
        ),
      )
    } catch (error) {
      outputError(error)
    }
  })
