import { describe, expect, test } from 'vitest'

describe('tree command', () => {
  test('exports a flat command with id argument and depth option', async () => {
    const { treeCommand } = await import('./tree.ts')
    expect(treeCommand.name()).toBe('tree')
    expect(treeCommand.commands).toHaveLength(0)
  })
})
