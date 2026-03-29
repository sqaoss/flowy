import { describe, expect, it } from 'vitest'
import { createDb } from './db.ts'
import { createResolvers } from './resolvers.ts'

describe('createResolvers', () => {
  it('returns an object with Query and Mutation keys', () => {
    const db = createDb(':memory:')
    const resolvers = createResolvers(db)

    expect(resolvers).toHaveProperty('Query')
    expect(resolvers).toHaveProperty('Mutation')

    db.close()
  })
})
