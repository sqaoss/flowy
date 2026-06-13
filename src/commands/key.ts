import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { loadConfig, saveConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'
import { ROTATE_API_KEY } from '../util/operations.ts'

export const keyCommand = new Command('key').description('API key management')

keyCommand
  .command('rotate')
  .description('Rotate API key')
  .action(async () => {
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
      }>(ROTATE_API_KEY)

      const config = loadConfig()
      config.apiKey = data.rotateApiKey.apiKey
      saveConfig(config)

      output(data.rotateApiKey)
    } catch (error) {
      outputError(error)
    }
  })
