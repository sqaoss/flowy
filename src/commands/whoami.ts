import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { fingerprintKey, loadConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'

export const whoamiCommand = new Command('whoami')
  .description('Show current user info')
  .action(async () => {
    try {
      const data = await graphql<{ whoami: Record<string, unknown> }>(
        `query Whoami {
          whoami {
            id email tier createdAt graceEndsAt
          }
        }`,
      )
      // Surface a non-reversible fingerprint of the configured key so a human
      // can confirm *which* credential is active without exposing it (F35).
      output({
        ...data.whoami,
        keyFingerprint: fingerprintKey(loadConfig().apiKey),
      })
    } catch (error) {
      outputError(error)
    }
  })
