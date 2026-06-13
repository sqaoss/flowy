import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// The MCP server is a thin wrapper over the same operations.ts + graphql() the
// CLI uses. These unit tests mock graphql()/config (exactly like the command
// tests) and assert each tool maps to the right operation with the right vars,
// and that coded errors surface cleanly as MCP tool errors. The stdio protocol
// transport itself is integration-ish and only smoke-checked.

let mockGraphql: ReturnType<typeof vi.fn>
let mockResolveProject: ReturnType<typeof vi.fn>
let mockRequireProject: ReturnType<typeof vi.fn>
let mockRequireFeature: ReturnType<typeof vi.fn>
let mockResolveFeature: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockGraphql = vi.fn()
  mockResolveProject = vi.fn(() => ({ id: 'proj_active', name: 'active' }))
  mockRequireProject = vi.fn(() => ({ id: 'proj_active', name: 'active' }))
  mockRequireFeature = vi.fn(() => 'feat_active')
  mockResolveFeature = vi.fn(() => 'feat_active')

  vi.doMock('./client.ts', () => ({ graphql: mockGraphql }))
  vi.doMock('./config.ts', () => ({
    resolveProject: mockResolveProject,
    requireProject: mockRequireProject,
    requireFeature: mockRequireFeature,
    resolveFeature: mockResolveFeature,
  }))
})

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

async function loadTools() {
  const mod = await import('./mcp.ts')
  return mod.tools
}

function byName(tools: Awaited<ReturnType<typeof loadTools>>, name: string) {
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`tool not found: ${name}`)
  return tool
}

describe('mcp tool registry', () => {
  test('exposes the full agent workflow as named tools', async () => {
    const tools = await loadTools()
    const names = tools.map((t) => t.name)

    const expected = [
      'flowy_project_create',
      'flowy_project_update',
      'flowy_project_delete',
      'flowy_project_show',
      'flowy_project_list',
      'flowy_feature_create',
      'flowy_feature_update',
      'flowy_feature_delete',
      'flowy_feature_show',
      'flowy_feature_list',
      'flowy_task_create',
      'flowy_task_update',
      'flowy_task_delete',
      'flowy_task_show',
      'flowy_task_list',
      'flowy_task_deps',
      'flowy_ready_tasks',
      'flowy_claim_task',
      'flowy_next_task',
      'flowy_set_status',
      'flowy_approve',
      'flowy_block',
      'flowy_unblock',
      'flowy_search',
      'flowy_tree',
      'flowy_import',
      'flowy_export',
      'flowy_history',
      'flowy_whoami',
    ]
    for (const name of expected) {
      expect(names, `missing tool: ${name}`).toContain(name)
    }
  })

  test('every tool has a non-trivial description and an input schema', async () => {
    const tools = await loadTools()
    expect(tools.length).toBeGreaterThanOrEqual(29)
    for (const tool of tools) {
      expect(tool.config.description.length).toBeGreaterThan(15)
      expect(tool.config.inputSchema).toBeTypeOf('object')
      expect(tool.handler).toBeTypeOf('function')
    }
  })

  test('tool names are unique and consistently prefixed', async () => {
    const tools = await loadTools()
    const names = tools.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) {
      expect(name).toMatch(/^flowy_[a-z_]+$/)
    }
  })
})

describe('mcp tool handlers map to operations + graphql', () => {
  test('flowy_project_create issues CreateProject', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ createNode: { id: 'proj_1' } })
    const res = await byName(tools, 'flowy_project_create').handler({
      name: 'Billing',
    })

    const [query, vars] = mockGraphql.mock.calls[0] ?? []
    expect(query).toContain('createNode')
    expect(vars).toEqual({ type: 'project', title: 'Billing' })
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent).toEqual({ id: 'proj_1' })
  })

  test('flowy_feature_create resolves the active project and creates atomically', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ createNode: { id: 'feat_1' } })
    await byName(tools, 'flowy_feature_create').handler({
      title: 'Login',
      description: 'OAuth login',
    })

    expect(mockRequireProject).toHaveBeenCalled()
    const [query, vars] = mockGraphql.mock.calls[0] ?? []
    expect(query).toContain('createNode')
    expect(vars).toMatchObject({
      type: 'feature',
      title: 'Login',
      description: 'OAuth login',
      parentId: 'proj_active',
    })
  })

  test('flowy_task_create resolves the active feature as parent', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ createNode: { id: 'task_1' } })
    await byName(tools, 'flowy_task_create').handler({
      title: 'Write tests',
      description: 'cover the claim path',
    })

    expect(mockRequireFeature).toHaveBeenCalled()
    const [, vars] = mockGraphql.mock.calls[0] ?? []
    expect(vars).toMatchObject({
      type: 'task',
      title: 'Write tests',
      parentId: 'feat_active',
    })
  })

  test('flowy_task_create accepts an explicit featureId override', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ createNode: { id: 'task_2' } })
    await byName(tools, 'flowy_task_create').handler({
      title: 'X',
      featureId: 'feat_override',
    })
    const [, vars] = mockGraphql.mock.calls[0] ?? []
    expect(vars).toMatchObject({ parentId: 'feat_override' })
    expect(mockRequireFeature).not.toHaveBeenCalled()
  })

  test('flowy_claim_task issues ClaimNode and returns the claimed task', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({
      claimNode: { id: 'task_1', status: 'in_progress' },
    })
    const res = await byName(tools, 'flowy_claim_task').handler({
      id: 'task_1',
    })
    const [query, vars] = mockGraphql.mock.calls[0] ?? []
    expect(query).toContain('claimNode')
    expect(vars).toEqual({ id: 'task_1' })
    expect(res.structuredContent).toMatchObject({ status: 'in_progress' })
  })

  test('flowy_claim_task surfaces a lost-race as a tool error', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ claimNode: null })
    const res = await byName(tools, 'flowy_claim_task').handler({
      id: 'task_1',
    })
    expect(res.isError).toBe(true)
    const text = res.content[0]?.text ?? ''
    expect(text).toMatch(/claim/i)
  })

  test('flowy_next_task claims the first ready task it wins', async () => {
    const tools = await loadTools()
    mockGraphql
      .mockResolvedValueOnce({
        readyTasks: [{ id: 'task_a' }, { id: 'task_b' }],
      })
      .mockResolvedValueOnce({ claimNode: null }) // task_a lost
      .mockResolvedValueOnce({ claimNode: { id: 'task_b' } }) // task_b won

    const res = await byName(tools, 'flowy_next_task').handler({})
    expect(mockGraphql.mock.calls[0]?.[0]).toContain('readyTasks')
    expect(mockGraphql.mock.calls[1]?.[0]).toContain('claimNode')
    expect(res.structuredContent).toMatchObject({ id: 'task_b' })
  })

  test('flowy_next_task errors cleanly when nothing is ready', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ readyTasks: [] })
    const res = await byName(tools, 'flowy_next_task').handler({})
    expect(res.isError).toBe(true)
    expect(res.content[0]?.text).toMatch(/ready/i)
  })

  test('flowy_ready_tasks scopes to the active project by default', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ readyTasks: [] })
    await byName(tools, 'flowy_ready_tasks').handler({})
    const [query, vars] = mockGraphql.mock.calls[0] ?? []
    expect(query).toContain('readyTasks')
    expect(vars).toEqual({ projectId: 'proj_active' })
  })

  test('flowy_block creates a blocks edge', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ createEdge: { relation: 'blocks' } })
    await byName(tools, 'flowy_block').handler({
      blockingId: 'task_a',
      blockedId: 'task_b',
    })
    const [query, vars] = mockGraphql.mock.calls[0] ?? []
    expect(query).toContain('createEdge')
    expect(vars).toEqual({
      sourceId: 'task_a',
      targetId: 'task_b',
      relation: 'blocks',
    })
  })

  test('flowy_unblock removes a blocks edge', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ removeEdge: true })
    await byName(tools, 'flowy_unblock').handler({
      blockingId: 'task_a',
      blockedId: 'task_b',
    })
    const [query, vars] = mockGraphql.mock.calls[0] ?? []
    expect(query).toContain('removeEdge')
    expect(vars).toEqual({
      sourceId: 'task_a',
      targetId: 'task_b',
      relation: 'blocks',
    })
  })

  test('flowy_set_status issues UpdateStatus', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ updateNode: { id: 'task_1' } })
    await byName(tools, 'flowy_set_status').handler({
      id: 'task_1',
      status: 'done',
    })
    const [query, vars] = mockGraphql.mock.calls[0] ?? []
    expect(query).toContain('updateNode')
    expect(vars).toEqual({ id: 'task_1', status: 'done' })
  })

  test('flowy_search passes filters through to the search query', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({
      search: { nodes: [], truncated: false, total: 0 },
    })
    await byName(tools, 'flowy_search').handler({
      query: 'auth',
      type: 'task',
      limit: 10,
    })
    const [query, vars] = mockGraphql.mock.calls[0] ?? []
    expect(query).toContain('search')
    expect(vars).toMatchObject({ query: 'auth', type: 'task', limit: 10 })
  })

  test('flowy_tree follows the requested relation', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ subtree: [] })
    await byName(tools, 'flowy_tree').handler({
      id: 'proj_1',
      relation: 'blocks',
      depth: 5,
    })
    const [query, vars] = mockGraphql.mock.calls[0] ?? []
    expect(query).toContain('subtree')
    expect(vars).toEqual({
      nodeId: 'proj_1',
      relation: 'blocks',
      maxDepth: 5,
    })
  })

  test('flowy_history issues the AuditLog query', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ auditLog: [] })
    await byName(tools, 'flowy_history').handler({ id: 'task_1', limit: 20 })
    const [query, vars] = mockGraphql.mock.calls[0] ?? []
    expect(query).toContain('auditLog')
    expect(vars).toEqual({ nodeId: 'task_1', limit: 20 })
  })

  test('flowy_whoami issues the Whoami query', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ whoami: { id: 'u_1', email: 'a@b.co' } })
    const res = await byName(tools, 'flowy_whoami').handler({})
    const [query] = mockGraphql.mock.calls[0] ?? []
    expect(query).toContain('whoami')
    expect(res.structuredContent).toMatchObject({ id: 'u_1' })
  })

  test('handlers surface a coded graphql error as an MCP tool error', async () => {
    const tools = await loadTools()
    const err = Object.assign(new Error('Node not found: task_x'), {
      code: 'NOT_FOUND',
    })
    mockGraphql.mockRejectedValue(err)
    const res = await byName(tools, 'flowy_task_show').handler({ id: 'task_x' })
    expect(res.isError).toBe(true)
    const text = res.content[0]?.text ?? ''
    expect(text).toContain('Node not found: task_x')
    expect(text).toContain('NOT_FOUND')
  })
})

// Exercise the remaining handlers' op-mapping so every tool is covered. They
// are all the same thin shape: resolve context → graphql(OP, vars) → ok().
describe('mcp remaining handlers map to their operations', () => {
  test('flowy_project_update defaults to the active project and only sends set fields', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ updateNode: { id: 'proj_active' } })
    await byName(tools, 'flowy_project_update').handler({
      title: 'New',
      metadata: '{"k":1}',
    })
    expect(mockRequireProject).toHaveBeenCalled()
    const [query, vars] = mockGraphql.mock.calls[0] ?? []
    expect(query).toContain('updateNode')
    expect(vars).toEqual({
      id: 'proj_active',
      title: 'New',
      metadata: '{"k":1}',
    })
  })

  test('flowy_project_delete defaults to the active project', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ deleteNode: true })
    const res = await byName(tools, 'flowy_project_delete').handler({})
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({ id: 'proj_active' })
    expect(res.structuredContent).toEqual({ deleted: true })
  })

  test('flowy_project_show defaults to the active project', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ node: { id: 'proj_active' } })
    await byName(tools, 'flowy_project_show').handler({})
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({ id: 'proj_active' })
  })

  test('flowy_project_list lists projects by type', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ nodes: [{ id: 'proj_1' }] })
    const res = await byName(tools, 'flowy_project_list').handler({})
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({ type: 'project' })
    expect(res.structuredContent).toEqual({ result: [{ id: 'proj_1' }] })
  })

  test('flowy_feature_update falls back to the active feature and errors if none', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ updateNode: { id: 'feat_active' } })
    await byName(tools, 'flowy_feature_update').handler({ title: 'T' })
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({
      id: 'feat_active',
      title: 'T',
    })

    mockResolveFeature.mockReturnValueOnce(null)
    const res = await byName(tools, 'flowy_feature_update').handler({
      title: 'T',
    })
    expect(res.isError).toBe(true)
  })

  test('flowy_feature_delete defaults to the active feature', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ deleteNode: true })
    await byName(tools, 'flowy_feature_delete').handler({})
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({ id: 'feat_active' })
  })

  test('flowy_feature_show errors cleanly when no feature is resolvable', async () => {
    const tools = await loadTools()
    mockResolveFeature.mockReturnValueOnce(null)
    const res = await byName(tools, 'flowy_feature_show').handler({})
    expect(res.isError).toBe(true)
    expect(mockGraphql).not.toHaveBeenCalled()
  })

  test('flowy_feature_show fetches a feature node by id', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ node: { id: 'feat_1', type: 'feature' } })
    await byName(tools, 'flowy_feature_show').handler({ id: 'feat_1' })
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({ id: 'feat_1' })
  })

  test('flowy_feature_list filters descendants to features', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({
      descendants: [
        { id: 'feat_1', type: 'feature' },
        { id: 'task_1', type: 'task' },
      ],
    })
    const res = await byName(tools, 'flowy_feature_list').handler({})
    expect(res.structuredContent).toEqual({
      result: [{ id: 'feat_1', type: 'feature' }],
    })
  })

  test('flowy_task_update only sends provided fields', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ updateNode: { id: 'task_1' } })
    await byName(tools, 'flowy_task_update').handler({
      id: 'task_1',
      description: 'd',
    })
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({
      id: 'task_1',
      description: 'd',
    })
  })

  test('flowy_task_delete deletes by id', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ deleteNode: true })
    await byName(tools, 'flowy_task_delete').handler({ id: 'task_1' })
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({ id: 'task_1' })
  })

  test('flowy_task_show merges node + deps', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({
      node: { id: 'task_1' },
      blockedBy: [{ id: 'b1' }],
      blocks: [],
    })
    const res = await byName(tools, 'flowy_task_show').handler({ id: 'task_1' })
    expect(res.structuredContent).toMatchObject({
      id: 'task_1',
      blockedBy: [{ id: 'b1' }],
      blocks: [],
    })
  })

  test('flowy_task_list defaults to active feature, filtering to tasks', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({
      descendants: [
        { id: 'task_1', type: 'task' },
        { id: 'sub', type: 'feature' },
      ],
    })
    const res = await byName(tools, 'flowy_task_list').handler({})
    expect(mockRequireFeature).toHaveBeenCalled()
    expect(res.structuredContent).toEqual({
      result: [{ id: 'task_1', type: 'task' }],
    })
  })

  test('flowy_task_list with all:true lists every task', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ nodes: [{ id: 'task_1' }] })
    await byName(tools, 'flowy_task_list').handler({ all: true })
    expect(mockGraphql.mock.calls[0]?.[0]).toContain('nodes')
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({ type: 'task' })
  })

  test('flowy_task_deps returns blockedBy/blocks', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ blockedBy: [], blocks: [{ id: 'x' }] })
    const res = await byName(tools, 'flowy_task_deps').handler({ id: 'task_1' })
    expect(res.structuredContent).toMatchObject({
      id: 'task_1',
      blocks: [{ id: 'x' }],
    })
  })

  test('flowy_ready_tasks with all:true clears the project scope', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ readyTasks: [] })
    await byName(tools, 'flowy_ready_tasks').handler({ all: true })
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({ projectId: null })
  })

  test('flowy_next_task with explicit projectId scopes ready', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValueOnce({ readyTasks: [{ id: 'task_a' }] })
    mockGraphql.mockResolvedValueOnce({ claimNode: { id: 'task_a' } })
    await byName(tools, 'flowy_next_task').handler({ projectId: 'proj_x' })
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({ projectId: 'proj_x' })
  })

  test('flowy_next_task errors when every candidate is claimed away', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValueOnce({ readyTasks: [{ id: 'task_a' }] })
    mockGraphql.mockResolvedValueOnce({ claimNode: null })
    const res = await byName(tools, 'flowy_next_task').handler({})
    expect(res.isError).toBe(true)
    expect(res.content[0]?.text).toMatch(/claimed/i)
  })

  test('flowy_approve issues ApproveNode', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValue({ approveNode: { id: 'task_1' } })
    await byName(tools, 'flowy_approve').handler({ id: 'task_1' })
    expect(mockGraphql.mock.calls[0]?.[0]).toContain('approveNode')
    expect(mockGraphql.mock.calls[0]?.[1]).toEqual({ id: 'task_1' })
  })

  test('flowy_export builds a manifest from the active project', async () => {
    const tools = await loadTools()
    mockGraphql
      .mockResolvedValueOnce({
        node: {
          id: 'proj_active',
          type: 'project',
          title: 'P',
          description: null,
          status: 'draft',
          metadata: null,
        },
      })
      .mockResolvedValueOnce({
        descendants: [
          {
            id: 'feat_1',
            type: 'feature',
            title: 'F',
            description: 'desc',
            status: 'draft',
            metadata: null,
          },
        ],
      })
      // EXPORT_EDGES is queried per node × relation; default to empty.
      .mockResolvedValue({ edges: [] })

    const res = await byName(tools, 'flowy_export').handler({})
    expect(mockRequireProject).toHaveBeenCalled()
    const manifest = res.structuredContent as {
      version: number
      nodes: unknown[]
    }
    expect(manifest.version).toBe(1)
    expect(manifest.nodes.length).toBe(2)
  })

  test('flowy_export errors when the active project is missing', async () => {
    const tools = await loadTools()
    mockGraphql.mockResolvedValueOnce({ node: null })
    const res = await byName(tools, 'flowy_export').handler({})
    expect(res.isError).toBe(true)
    expect(res.content[0]?.text).toMatch(/not found/i)
  })

  test('flowy_import validates and materializes a manifest object', async () => {
    const tools = await loadTools()
    // import flow: loadExisting reads each node type (3 queries), then upserts.
    mockGraphql.mockResolvedValue({ nodes: [] })
    mockGraphql.mockResolvedValueOnce({ nodes: [] }) // project
    mockGraphql.mockResolvedValueOnce({ nodes: [] }) // feature
    mockGraphql.mockResolvedValueOnce({ nodes: [] }) // task
    mockGraphql.mockResolvedValue({ createNode: { id: 'srv_1' } })

    const res = await byName(tools, 'flowy_import').handler({
      manifest: {
        version: 1,
        nodes: [{ key: 'p1', type: 'project', title: 'P' }],
        edges: [],
      },
    })
    expect(res.isError).toBeFalsy()
    const out = res.structuredContent as { imported: number }
    expect(out.imported).toBe(1)
  })

  test('flowy_import surfaces a manifest validation error', async () => {
    const tools = await loadTools()
    const res = await byName(tools, 'flowy_import').handler({
      manifest: { version: 1, nodes: 'not-an-array' },
    })
    expect(res.isError).toBe(true)
    expect(res.content[0]?.text).toMatch(/manifest/i)
  })
})

describe('mcp server wiring', () => {
  test('createServer registers all tools and lists them', async () => {
    const { createServer, tools } = await import('./mcp.ts')
    const server = createServer()
    expect(server).toBeDefined()
    // The McpServer instance must expose exactly the tools in our registry.
    const registered = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })
        ._registeredTools,
    )
    for (const tool of tools) {
      expect(registered).toContain(tool.name)
    }
  })

  // Light smoke test (bonus): the server starts on a real in-memory transport
  // and a real MCP client can list its tools with their input schemas. This
  // exercises the protocol layer end-to-end without any network or stdio.
  test('a client can connect and list every tool with a schema', async () => {
    const { createServer, tools } = await import('./mcp.ts')
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { InMemoryTransport } = await import(
      '@modelcontextprotocol/sdk/inMemory.js'
    )

    const server = createServer()
    const client = new Client({ name: 'test', version: '0.0.0' })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ])

    const { tools: listed } = await client.listTools()
    const listedNames = listed.map((t) => t.name).sort()
    expect(listedNames).toEqual(tools.map((t) => t.name).sort())
    for (const t of listed) {
      expect(t.inputSchema).toBeTypeOf('object')
      expect(t.description?.length ?? 0).toBeGreaterThan(0)
    }

    await client.close()
    await server.close()
  })
})
