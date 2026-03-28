import { Command } from 'commander'
import { loadConfig, saveConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'

const SUPPORTED_PROPERTIES = ['name'] as const

export const clientCommand = new Command('client').description(
  'Manage client settings',
)

clientCommand
  .command('set')
  .description('Set a client property')
  .argument('<property>', 'Property to set')
  .argument('<value>', 'Value to set')
  .action((property: string, value: string) => {
    try {
      if (
        !SUPPORTED_PROPERTIES.includes(
          property as (typeof SUPPORTED_PROPERTIES)[number],
        )
      ) {
        throw new Error(
          `Unknown property "${property}". Supported: ${SUPPORTED_PROPERTIES.join(', ')}`,
        )
      }
      const config = loadConfig()
      config.client.name = value
      saveConfig(config)
      output({ property, value })
    } catch (error) {
      outputError(error)
    }
  })
