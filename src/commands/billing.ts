import { Command, Option } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'

const checkoutCommand = new Command('checkout')
  .description('Create a checkout session for a subscription tier')
  .addOption(
    new Option('--tier <tier>', 'Subscription tier')
      .choices(['explorer', 'pro', 'team'])
      .makeOptionMandatory(),
  )
  .action(async (opts: { tier: string }) => {
    try {
      const data = await graphql<{ createCheckout: { url: string } }>(
        `mutation CreateCheckout($tier: String!) {
          createCheckout(tier: $tier) {
            url
          }
        }`,
        { tier: opts.tier },
      )
      output(data.createCheckout)
    } catch (error) {
      outputError(error)
    }
  })

export const billingCommand = new Command('billing')
  .description('Billing and subscription management')
  .addCommand(checkoutCommand)
