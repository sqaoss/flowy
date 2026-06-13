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

  it('round-trips metadata through createNode and the node query', async () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    const created = (await gql(
      'mutation ($m: String!) { createNode(type: "task", title: "T", metadata: $m) { id metadata } }',
      { m: '{"priority":"high"}' },
    )) as { data: { createNode: { id: string; metadata: string } } }
    expect(created.data.createNode.metadata).toBe('{"priority":"high"}')

    const id = created.data.createNode.id
    const fetched = (await gql(
      'query ($id: String!) { node(id: $id) { metadata } }',
      { id },
    )) as { data: { node: { metadata: string } } }
    expect(JSON.parse(fetched.data.node.metadata)).toEqual({ priority: 'high' })
  })

  it('updates title/description/status/metadata via updateNode', async () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    const created = (await gql(
      'mutation { createNode(type: "task", title: "Old") { id } }',
    )) as { data: { createNode: { id: string } } }
    const id = created.data.createNode.id

    const updated = (await gql(
      `mutation ($id: String!) {
        updateNode(id: $id, title: "New", description: "d", status: "in_progress", metadata: "{\\"k\\":1}") {
          title description status metadata
        }
      }`,
      { id },
    )) as {
      data: {
        updateNode: {
          title: string
          description: string
          status: string
          metadata: string
        }
      }
    }
    expect(updated.data.updateNode.title).toBe('New')
    expect(updated.data.updateNode.description).toBe('d')
    expect(updated.data.updateNode.status).toBe('in_progress')
    expect(JSON.parse(updated.data.updateNode.metadata)).toEqual({ k: 1 })
  })

  it('rejects non-JSON metadata with VALIDATION_ERROR over the wire', async () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    const json = await gql(
      'mutation { createNode(type: "task", title: "T", metadata: "not json") { id } }',
    )
    expect(json.errors).toBeDefined()
    const error = json.errors![0]
    expect(error.message).not.toBe('Unexpected error.')
    expect(error.extensions?.code).toBe('VALIDATION_ERROR')
  })

  it('deletes a leaf node via deleteNode', async () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    const created = (await gql(
      'mutation { createNode(type: "task", title: "T") { id } }',
    )) as { data: { createNode: { id: string } } }
    const id = created.data.createNode.id

    const del = (await gql('mutation ($id: String!) { deleteNode(id: $id) }', {
      id,
    })) as { data: { deleteNode: boolean } }
    expect(del.data.deleteNode).toBe(true)

    const fetched = await gql('query ($id: String!) { node(id: $id) { id } }', {
      id,
    })
    // The node is gone: querying it now fails loud with NOT_FOUND.
    expect(fetched.errors).toBeDefined()
    expect(fetched.errors![0].extensions?.code).toBe('NOT_FOUND')
  })

  it('refuses to delete a parent with children (CONFLICT)', async () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    const project = (await gql(
      'mutation { createNode(type: "project", title: "P") { id } }',
    )) as { data: { createNode: { id: string } } }
    const feature = (await gql(
      'mutation { createNode(type: "feature", title: "F") { id } }',
    )) as { data: { createNode: { id: string } } }
    await gql(
      'mutation ($s: String!, $t: String!) { createEdge(sourceId: $s, targetId: $t, relation: "part_of") { relation } }',
      { s: feature.data.createNode.id, t: project.data.createNode.id },
    )

    const json = await gql('mutation ($id: String!) { deleteNode(id: $id) }', {
      id: project.data.createNode.id,
    })
    expect(json.errors).toBeDefined()
    const error = json.errors![0]
    expect(error.message).not.toBe('Unexpected error.')
    expect(error.extensions?.code).toBe('CONFLICT')
  })
})
