import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'

export const whoamiCommand = new Command('whoami')
  .description('Show current user info')
  .action(async () => {
    try {
      const data = await graphql<{ whoami: unknown }>(
        `query Whoami {
          whoami {
            id email tier createdAt
          }
        }`,
      )
      output(data.whoami)
    } catch (error) {
      outputError(error)
    }
  })
