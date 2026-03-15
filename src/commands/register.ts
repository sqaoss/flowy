import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'

export const registerCommand = new Command('register')
  .description('Register a new account')
  .requiredOption('--email <email>', 'Your email address')
  .action(async (opts) => {
    try {
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
      output(data.register)
    } catch (error) {
      outputError(error)
    }
  })
