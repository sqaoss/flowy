import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from './index.ts'

interface GraphQLResponse {
  data?: unknown
  errors?: Array<{ message: string; extensions?: { code?: string } }>
}

describe('server error masking', () => {
  let instance: ReturnType<typeof createServer> | undefined

  afterEach(() => {
    instance?.close()
    instance = undefined
  })

  async function gql(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResponse> {
    const res = await fetch(`http://localhost:${instance!.port}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    return (await res.json()) as GraphQLResponse
  }

  it('surfaces a too-short search error with real message and VALIDATION_ERROR code', async () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    const json = await gql('query ($q: String!) { search(query: $q) { id } }', {
      q: 'ab',
    })

    expect(json.errors).toBeDefined()
    const error = json.errors![0]
    expect(error.message).toBe('Search query must be at least 3 characters')
    expect(error.message).not.toBe('Unexpected error.')
    expect(error.extensions?.code).toBe('VALIDATION_ERROR')
  })

  it('surfaces a not-found update error with real message and NOT_FOUND code', async () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    const json = await gql(
      'mutation ($id: String!) { updateNode(id: $id, status: "done") { id } }',
      { id: 'nonexistent' },
    )

    expect(json.errors).toBeDefined()
    const error = json.errors![0]
    expect(error.message).toBe('Node nonexistent not found')
    expect(error.message).not.toBe('Unexpected error.')
    expect(error.extensions?.code).toBe('NOT_FOUND')
  })

  it('surfaces an invalid-status error with real message and VALIDATION_ERROR code', async () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    const created = (await gql(
      'mutation { createNode(type: "task", title: "T") { id } }',
    )) as { data: { createNode: { id: string } } }
    const id = created.data.createNode.id

    const json = await gql(
      'mutation ($id: String!) { updateNode(id: $id, status: "bogus") { id } }',
      { id },
    )

    expect(json.errors).toBeDefined()
    const error = json.errors![0]
    expect(error.message).toContain('Invalid status: bogus')
    expect(error.message).not.toBe('Unexpected error.')
    expect(error.extensions?.code).toBe('VALIDATION_ERROR')
  })

  it('surfaces a not-found node query with real message and NOT_FOUND code (no silent null)', async () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    const json = await gql('query ($id: String!) { node(id: $id) { id } }', {
      id: 'task_nonexistent',
    })

    expect(json.errors).toBeDefined()
    const error = json.errors![0]
    expect(error.message).toBe('Node task_nonexistent not found')
    expect(error.extensions?.code).toBe('NOT_FOUND')
    const data = json.data as { node: unknown } | null | undefined
    expect(data?.node ?? null).toBeNull()
  })

  it('still returns a node when it exists', async () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    const created = (await gql(
      'mutation { createNode(type: "task", title: "T") { id } }',
    )) as { data: { createNode: { id: string } } }
    const id = created.data.createNode.id

    const json = (await gql('query ($id: String!) { node(id: $id) { id } }', {
      id,
    })) as { data: { node: { id: string } }; errors?: unknown[] }

    expect(json.errors).toBeUndefined()
    expect(json.data.node.id).toBe(id)
  })

  it('surfaces an approve-wrong-status error with CONFLICT code', async () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    const created = (await gql(
      'mutation { createNode(type: "feature", title: "F") { id } }',
    )) as { data: { createNode: { id: string } } }
    const id = created.data.createNode.id

    const json = await gql(
      'mutation ($id: String!) { approveNode(id: $id) { id } }',
      { id },
    )

    expect(json.errors).toBeDefined()
    const error = json.errors![0]
    expect(error.message).toContain('Cannot approve node with status "draft"')
    expect(error.message).not.toBe('Unexpected error.')
    expect(error.extensions?.code).toBe('CONFLICT')
  })
})
