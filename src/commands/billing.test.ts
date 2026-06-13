import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let mockGraphql: ReturnType<typeof vi.fn>
let mockOutput: ReturnType<typeof vi.fn>
let mockOutputError: ReturnType<typeof vi.fn>
let mockMode: 'local' | 'remote'

beforeEach(() => {
  mockGraphql = vi.fn()
  mockOutput = vi.fn()
  mockOutputError = vi.fn()
  mockMode = 'remote'

  vi.doMock('../util/client.ts', () => ({
    graphql: mockGraphql,
  }))

  vi.doMock('../util/format.ts', () => ({
    output: mockOutput,
    outputError: mockOutputError,
  }))

  vi.doMock('../util/config.ts', () => ({
    requireRemoteMode: (commandName: string) => {
      if (mockMode === 'local') {
        const err = new Error(
          `"flowy ${commandName}" is only available in remote mode. The active mode is local mode.`,
        ) as Error & { code?: string }
        err.code = 'LOCAL_MODE'
        throw err
      }
    },
  }))
})

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('billing command', () => {
  test('exports a command named "billing"', async () => {
    const { billingCommand } = await import('./billing.ts')
    expect(billingCommand.name()).toBe('billing')
  })

  test('has checkout subcommand', async () => {
    const { billingCommand } = await import('./billing.ts')
    const subcommandNames = billingCommand.commands.map((c) => c.name())
    expect(subcommandNames).toContain('checkout')
    expect(billingCommand.commands).toHaveLength(1)
  })

  test('checkout calls createCheckout mutation and outputs result', async () => {
    const checkoutResult = { url: 'https://checkout.stripe.com/session_123' }
    mockGraphql.mockResolvedValue({ createCheckout: checkoutResult })

    const { billingCommand } = await import('./billing.ts')
    await billingCommand.parseAsync(['checkout', '--tier', 'pro'], {
      from: 'user',
    })

    expect(mockGraphql).toHaveBeenCalledWith(
      expect.stringContaining('createCheckout'),
      { tier: 'pro' },
    )
    expect(mockOutput).toHaveBeenCalledWith(checkoutResult)
  })

  test('checkout errors when --tier is not provided', async () => {
    const { billingCommand } = await import('./billing.ts')

    billingCommand.exitOverride()
    billingCommand.configureOutput({ writeErr: () => {}, writeOut: () => {} })
    for (const cmd of billingCommand.commands) {
      cmd.exitOverride()
      cmd.configureOutput({ writeErr: () => {}, writeOut: () => {} })
    }

    await expect(
      billingCommand.parseAsync(['checkout'], { from: 'user' }),
    ).rejects.toThrow('--tier')
  })

  test('checkout sends correct tier in mutation variables', async () => {
    mockGraphql.mockResolvedValue({
      createCheckout: { url: 'https://checkout.stripe.com/session_abc' },
    })

    const { billingCommand } = await import('./billing.ts')
    await billingCommand.parseAsync(['checkout', '--tier', 'team'], {
      from: 'user',
    })

    expect(mockGraphql).toHaveBeenCalledOnce()
    const [, variables] = mockGraphql.mock.calls[0]!
    expect(variables).toEqual({ tier: 'team' })
  })

  test('checkout calls outputError on failure', async () => {
    const error = new Error('Unauthorized')
    mockGraphql.mockRejectedValue(error)

    const { billingCommand } = await import('./billing.ts')
    await billingCommand.parseAsync(['checkout', '--tier', 'explorer'], {
      from: 'user',
    })

    expect(mockOutputError).toHaveBeenCalledWith(error)
  })

  test('checkout errors cleanly in local mode without hitting the server', async () => {
    mockMode = 'local'

    const { billingCommand } = await import('./billing.ts')
    await billingCommand.parseAsync(['checkout', '--tier', 'pro'], {
      from: 'user',
    })

    expect(mockGraphql).not.toHaveBeenCalled()
    expect(mockOutput).not.toHaveBeenCalled()
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/local mode/i),
        code: 'LOCAL_MODE',
      }),
    )
  })
})
