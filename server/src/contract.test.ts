/**
 * CLI <-> bundled-local-server CONTRACT GUARD (Flowy improvement plan P1-1).
 *
 * This test executes every GraphQL operation the Flowy CLI sends (the canonical
 * set in `src/util/operations.ts`) against a live instance of the *bundled
 * local server* (`server/src/index.ts`'s `createServer`), over its real HTTP +
 * GraphQL transport. Because Yoga parses and validates each operation against
 * the server's schema before executing it, this catches drift the unit tests
 * (which call resolvers directly) cannot:
 *
 *   - a renamed query/mutation (e.g. `readyTasks` -> `actionableTasks`),
 *   - a renamed or dropped field on a returned type (e.g. `Node.metadata`),
 *   - a renamed, dropped, or retyped argument (e.g. `search(limit:)`),
 *
 * any of which would make the CLI break at runtime. If you rename anything the
 * CLI relies on, this test fails — forcing the CLI and the local server to move
 * together.
 *
 * Scope: this guards the LOCAL side of the contract. The hosted `flowy-saas`
 * repo keeps its own mirror of these query strings in
 * `test/helpers/cli-queries.ts` and should assert them the same way against its
 * Postgres schema.
 *
 * ── Intentional local / SaaS divergences (documented, NOT failures) ──────────
 * The CLI's operations module also exports SAAS_ONLY_OPERATIONS. The bundled
 * local server deliberately does NOT implement these — they require auth,
 * billing, or audit infrastructure that only exists in the hosted backend:
 *
 *   - `register`        (setup.ts)  — account creation; local has no accounts.
 *   - `whoami`          (whoami.ts) — current user; local is unauthenticated.
 *   - `rotateApiKey`    (key.ts)    — API key lifecycle; local has no keys.
 *   - `createCheckout`  (billing.ts)— Polar checkout; local has no billing.
 *
 * Conversely, the SaaS schema carries some operations the local server still
 * lacks and the CLI does not yet call against local: `ancestors` and
 * `nodes(status/limit/offset)` pagination. (`auditLog` was such a divergence
 * until P1-2/F27 ported it to the bundled local server; it is now part of
 * LOCAL_CONTRACT_OPERATIONS and exercised below.)
 * Status vocabulary and edge relations are shared (`part_of`, `blocks`); the
 * SaaS schema additionally recognises `epic`/`depends_on`/`informs` relations
 * the bundled server does not. The test below asserts the local server rejects
 * each SAAS_ONLY operation (proving the divergence is real and explicit), and
 * that it satisfies every LOCAL_CONTRACT_OPERATIONS entry.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  LOCAL_CONTRACT_OPERATIONS,
  SAAS_ONLY_OPERATIONS,
} from '../../src/util/operations.ts'
import { createServer } from './index.ts'

let instance: ReturnType<typeof createServer>
let endpoint: string

/** Run an operation through the live server's HTTP/GraphQL transport. */
async function run<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data: T | null; errors?: Array<{ message: string }> }> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return (await res.json()) as {
    data: T | null
    errors?: Array<{ message: string }>
  }
}

/** Run an operation and fail loudly if the server reports any GraphQL error. */
async function ok<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const body = await run<T>(query, variables)
  expect(
    body.errors,
    `operation produced GraphQL errors: ${JSON.stringify(body.errors)}`,
  ).toBeUndefined()
  expect(body.data).not.toBeNull()
  return body.data as T
}

beforeAll(() => {
  instance = createServer({ dbPath: ':memory:', port: 0 })
  endpoint = `http://localhost:${instance.port}/graphql`
})

afterAll(() => {
  instance.close()
})

describe('CLI/local-server contract (P1-1)', () => {
  it('exercises every CLI operation against the bundled local server', async () => {
    // --- Mutations: build a project -> feature -> task hierarchy ------------
    const { createNode: project } = await ok<{
      createNode: { id: string; type: string; status: string }
    }>(LOCAL_CONTRACT_OPERATIONS.CREATE_PROJECT, {
      type: 'project',
      title: 'Contract Project',
    })
    expect(project.id).toMatch(/^proj_/)
    expect(project.status).toBe('draft')

    const { createNode: feature } = await ok<{
      createNode: { id: string; description: string | null }
    }>(LOCAL_CONTRACT_OPERATIONS.CREATE_NODE, {
      type: 'feature',
      title: 'Contract Feature',
      description: 'A feature',
    })
    expect(feature.id).toMatch(/^feat_/)
    expect(feature.description).toBe('A feature')

    const { createNode: task } = await ok<{
      createNode: { id: string }
    }>(LOCAL_CONTRACT_OPERATIONS.CREATE_TASK, {
      type: 'task',
      title: 'Contract Task',
      description: 'Do the thing',
    })
    expect(task.id).toMatch(/^task_/)

    const { createNode: blocker } = await ok<{ createNode: { id: string } }>(
      LOCAL_CONTRACT_OPERATIONS.CREATE_TASK,
      { type: 'task', title: 'Blocker Task', description: 'first' },
    )

    // import.ts CREATE/UPDATE carry status + metadata; verify they round-trip.
    const { createNode: imported } = await ok<{ createNode: { id: string } }>(
      LOCAL_CONTRACT_OPERATIONS.IMPORT_CREATE,
      {
        type: 'task',
        title: 'Imported Task',
        description: 'imported',
        status: 'in_progress',
        metadata: JSON.stringify({ clientKey: 'k-1' }),
      },
    )
    expect(imported.id).toMatch(/^task_/)

    await ok(LOCAL_CONTRACT_OPERATIONS.IMPORT_UPDATE, {
      id: imported.id,
      title: 'Imported Task v2',
      description: 'updated',
      status: 'done',
      metadata: JSON.stringify({ clientKey: 'k-1' }),
    })

    // --- Edges: part_of hierarchy + a blocks dependency --------------------
    const { createEdge: featureEdge } = await ok<{
      createEdge: { sourceId: string; targetId: string; relation: string }
    }>(LOCAL_CONTRACT_OPERATIONS.CREATE_EDGE, {
      sourceId: feature.id,
      targetId: project.id,
      relation: 'part_of',
    })
    expect(featureEdge.relation).toBe('part_of')

    await ok(LOCAL_CONTRACT_OPERATIONS.LINK_TASK, {
      sourceId: task.id,
      targetId: feature.id,
      relation: 'part_of',
    })
    await ok(LOCAL_CONTRACT_OPERATIONS.LINK_TASK, {
      sourceId: blocker.id,
      targetId: feature.id,
      relation: 'part_of',
    })
    await ok(LOCAL_CONTRACT_OPERATIONS.IMPORT_EDGE, {
      sourceId: imported.id,
      targetId: feature.id,
      relation: 'part_of',
    })

    // CREATE_NODE_WITH_PARENT (P1-4/F24): create a node AND its part_of edge to
    // the feature in one atomic call. The returned node must be a real child of
    // the feature (reachable via the part_of hierarchy), proving the edge was
    // created in the same unit of work — no separate createEdge call needed.
    const { createNode: parentedTask } = await ok<{
      createNode: { id: string }
    }>(LOCAL_CONTRACT_OPERATIONS.CREATE_NODE_WITH_PARENT, {
      type: 'task',
      title: 'Parented Task',
      description: 'linked atomically',
      parentId: feature.id,
    })
    expect(parentedTask.id).toMatch(/^task_/)
    const parentedChildren = await ok<{ descendants: Array<{ id: string }> }>(
      LOCAL_CONTRACT_OPERATIONS.LIST_TASKS,
      { nodeId: feature.id, relation: 'part_of', maxDepth: 1 },
    )
    expect(parentedChildren.descendants.map((n) => n.id)).toContain(
      parentedTask.id,
    )

    // A non-existent parent must be rejected (NOT_FOUND) and leave no orphan.
    const beforeOrphan = await ok<{ nodes: Array<{ id: string }> }>(
      LOCAL_CONTRACT_OPERATIONS.ALL_TASKS,
      { type: 'task' },
    )
    const badParent = await run(
      LOCAL_CONTRACT_OPERATIONS.CREATE_NODE_WITH_PARENT,
      {
        type: 'task',
        title: 'Should Not Exist',
        description: 'orphan attempt',
        parentId: 'feat_missing',
      },
    )
    expect(badParent.errors).toBeDefined()
    const afterOrphan = await ok<{ nodes: Array<{ id: string }> }>(
      LOCAL_CONTRACT_OPERATIONS.ALL_TASKS,
      { type: 'task' },
    )
    expect(afterOrphan.nodes).toHaveLength(beforeOrphan.nodes.length)

    // blocker blocks task
    const { createEdge: blocksEdge } = await ok<{
      createEdge: { relation: string; createdAt: string }
    }>(LOCAL_CONTRACT_OPERATIONS.BLOCK_TASK, {
      sourceId: blocker.id,
      targetId: task.id,
      relation: 'blocks',
    })
    expect(blocksEdge.relation).toBe('blocks')
    expect(typeof blocksEdge.createdAt).toBe('string')

    // --- Status / approval -------------------------------------------------
    const { updateNode: statusUpdated } = await ok<{
      updateNode: { status: string; updatedAt: string }
    }>(LOCAL_CONTRACT_OPERATIONS.UPDATE_STATUS, {
      id: task.id,
      status: 'pending_review',
    })
    expect(statusUpdated.status).toBe('pending_review')

    const { approveNode } = await ok<{ approveNode: { status: string } }>(
      LOCAL_CONTRACT_OPERATIONS.APPROVE_NODE,
      { id: task.id },
    )
    expect(approveNode.status).toBe('approved')

    // update content (title/description/metadata)
    const { updateNode } = await ok<{
      updateNode: { title: string; metadata: string | null }
    }>(LOCAL_CONTRACT_OPERATIONS.UPDATE_NODE, {
      id: task.id,
      title: 'Renamed Task',
      description: 'New body',
      metadata: JSON.stringify({ note: 'x' }),
    })
    expect(updateNode.title).toBe('Renamed Task')
    expect(updateNode.metadata).toContain('note')

    // CLAIM_NODE (P2-1/F28): atomically claim a task for work. A fresh draft
    // task is claimable -> flips to in_progress and is returned. A second claim
    // on the same (now in_progress) task loses the race -> claimNode is null.
    // A non-claimable (done) task is also rejected with null. This is the
    // primitive `task claim`/`task next` use so parallel agents never
    // double-claim; the SaaS contract guard mirrors it (flowy-ai v35).
    const { createNode: claimable } = await ok<{
      createNode: { id: string }
    }>(LOCAL_CONTRACT_OPERATIONS.CREATE_TASK, {
      type: 'task',
      title: 'Claimable Task',
      description: 'up for grabs',
    })
    const firstClaim = await ok<{
      claimNode: { id: string; status: string } | null
    }>(LOCAL_CONTRACT_OPERATIONS.CLAIM_NODE, { id: claimable.id })
    expect(firstClaim.claimNode?.id).toBe(claimable.id)
    expect(firstClaim.claimNode?.status).toBe('in_progress')
    // Second claim on the same task loses: already in_progress, not claimable.
    const secondClaim = await ok<{ claimNode: { id: string } | null }>(
      LOCAL_CONTRACT_OPERATIONS.CLAIM_NODE,
      { id: claimable.id },
    )
    expect(secondClaim.claimNode).toBeNull()
    // A done task is never claimable.
    await ok(LOCAL_CONTRACT_OPERATIONS.UPDATE_STATUS, {
      id: claimable.id,
      status: 'done',
    })
    const doneClaim = await ok<{ claimNode: { id: string } | null }>(
      LOCAL_CONTRACT_OPERATIONS.CLAIM_NODE,
      { id: claimable.id },
    )
    expect(doneClaim.claimNode).toBeNull()

    // --- Queries: reads ----------------------------------------------------
    const getNode = await ok<{ node: { id: string } | null }>(
      LOCAL_CONTRACT_OPERATIONS.GET_NODE,
      { id: feature.id },
    )
    expect(getNode.node?.id).toBe(feature.id)

    const getProject = await ok<{ node: { id: string } | null }>(
      LOCAL_CONTRACT_OPERATIONS.GET_PROJECT,
      { id: project.id },
    )
    expect(getProject.node?.id).toBe(project.id)

    const exportProject = await ok<{
      node: { metadata: string | null } | null
    }>(LOCAL_CONTRACT_OPERATIONS.EXPORT_PROJECT, { id: project.id })
    expect(exportProject.node).not.toBeNull()

    const listForSet = await ok<{
      nodes: Array<{ id: string; title: string }>
    }>(LOCAL_CONTRACT_OPERATIONS.LIST_PROJECTS_FOR_SET, { type: 'project' })
    expect(listForSet.nodes.some((n) => n.id === project.id)).toBe(true)

    const listProjects = await ok<{ nodes: unknown[] }>(
      LOCAL_CONTRACT_OPERATIONS.LIST_PROJECTS,
      { type: 'project' },
    )
    expect(listProjects.nodes.length).toBeGreaterThan(0)

    const allTasks = await ok<{ nodes: Array<{ type: string }> }>(
      LOCAL_CONTRACT_OPERATIONS.ALL_TASKS,
      { type: 'task' },
    )
    expect(allTasks.nodes.every((n) => n.type === 'task')).toBe(true)

    const importExisting = await ok<{
      nodes: Array<{ metadata: string | null }>
    }>(LOCAL_CONTRACT_OPERATIONS.IMPORT_EXISTING, { type: 'task' })
    expect(importExisting.nodes.length).toBeGreaterThan(0)

    const descendants = await ok<{ descendants: Array<{ id: string }> }>(
      LOCAL_CONTRACT_OPERATIONS.DESCENDANTS,
      { nodeId: project.id, relation: 'part_of', maxDepth: 1 },
    )
    expect(descendants.descendants.some((n) => n.id === feature.id)).toBe(true)

    const descendantsBrief = await ok<{
      descendants: Array<{ status: string }>
    }>(LOCAL_CONTRACT_OPERATIONS.DESCENDANTS_BRIEF, {
      nodeId: project.id,
      relation: 'part_of',
      maxDepth: 1,
    })
    expect(descendantsBrief.descendants.length).toBeGreaterThan(0)

    const listTasks = await ok<{ descendants: unknown[] }>(
      LOCAL_CONTRACT_OPERATIONS.LIST_TASKS,
      { nodeId: feature.id, relation: 'part_of', maxDepth: 1 },
    )
    expect(listTasks.descendants.length).toBeGreaterThan(0)

    const exportDescendants = await ok<{
      descendants: Array<{ metadata: string | null }>
    }>(LOCAL_CONTRACT_OPERATIONS.EXPORT_DESCENDANTS, {
      nodeId: project.id,
      relation: 'part_of',
      maxDepth: 100,
    })
    expect(exportDescendants.descendants.length).toBeGreaterThan(0)

    // SUBTREE follows one relation (default part_of) and annotates each node
    // with parentId/depth/relation. From the project, the part_of view is:
    //   project -> feature (depth 1) -> {task, blocker, imported} (depth 2),
    // all reached via part_of edges. The blocker -> task `blocks` edge must NOT
    // change anyone's parent/relation: every returned node carries
    // relation 'part_of' and its part_of parent, never the blocks linkage.
    const subtree = await ok<{
      subtree: Array<{
        id: string
        parentId: string
        depth: number
        relation: string
      }>
    }>(LOCAL_CONTRACT_OPERATIONS.SUBTREE, {
      nodeId: project.id,
      relation: 'part_of',
      maxDepth: 10,
    })
    const subtreeById = new Map(subtree.subtree.map((n) => [n.id, n]))
    expect(subtreeById.get(feature.id)).toMatchObject({
      parentId: project.id,
      depth: 1,
      relation: 'part_of',
    })
    expect(subtreeById.get(task.id)).toMatchObject({
      parentId: feature.id,
      depth: 2,
      relation: 'part_of',
    })
    // the blocker is reached via its part_of edge to the feature (depth 2),
    // NOT via the blocks edge that points at the task — proving blocks edges
    // do not leak into the hierarchy view.
    expect(subtreeById.get(blocker.id)).toMatchObject({
      parentId: feature.id,
      depth: 2,
      relation: 'part_of',
    })
    expect(subtree.subtree.every((n) => n.relation === 'part_of')).toBe(true)

    // task is blocked by an unfinished blocker, so readyTasks excludes it.
    const ready = await ok<{ readyTasks: Array<{ id: string }> }>(
      LOCAL_CONTRACT_OPERATIONS.READY_TASKS,
      { projectId: project.id },
    )
    const readyIds = ready.readyTasks.map((t) => t.id)
    expect(readyIds).toContain(blocker.id)
    expect(readyIds).not.toContain(task.id)

    // edges via SHOW_TASK: blockedBy (incoming) + blocks (outgoing)
    const showTask = await ok<{
      node: { id: string } | null
      blockedBy: Array<{ id: string }>
      blocks: Array<{ id: string }>
    }>(LOCAL_CONTRACT_OPERATIONS.SHOW_TASK, { id: task.id })
    expect(showTask.node?.id).toBe(task.id)
    expect(showTask.blockedBy.map((n) => n.id)).toContain(blocker.id)

    const taskDeps = await ok<{
      blockedBy: Array<{ id: string }>
      blocks: Array<{ id: string }>
    }>(LOCAL_CONTRACT_OPERATIONS.TASK_DEPS, { id: blocker.id })
    expect(taskDeps.blocks.map((n) => n.id)).toContain(task.id)

    const importEdges = await ok<{ edges: Array<{ id: string }> }>(
      LOCAL_CONTRACT_OPERATIONS.IMPORT_EDGES,
      { nodeId: feature.id, relation: 'part_of' },
    )
    expect(Array.isArray(importEdges.edges)).toBe(true)

    const exportEdges = await ok<{
      edges: Array<{ id: string; metadata: string | null }>
    }>(LOCAL_CONTRACT_OPERATIONS.EXPORT_EDGES, {
      nodeId: feature.id,
      relation: 'part_of',
    })
    expect(Array.isArray(exportEdges.edges)).toBe(true)

    // SEARCH returns a SearchResult envelope (F32): nodes + truncation meta.
    const search = await ok<{
      search: {
        nodes: Array<{ id: string }>
        truncated: boolean
        total: number
      }
    }>(LOCAL_CONTRACT_OPERATIONS.SEARCH, {
      query: 'Contract',
      type: 'project',
      status: null,
      limit: 50,
    })
    expect(search.search.nodes.some((n) => n.id === project.id)).toBe(true)
    expect(search.search.truncated).toBe(false)
    expect(typeof search.search.total).toBe('number')

    // auditLog (P1-2/F27): the task has accumulated a trail — a `create` on
    // insert, a `status_change` to pending_review, an `approve`, plus the
    // content `update`s. Entries come back newest-first and carry the
    // SaaS-shaped fields.
    const history = await ok<{
      auditLog: Array<{
        id: string
        action: string
        field: string | null
        oldValue: string | null
        newValue: string | null
        snapshot: string | null
        changedBy: string
        createdAt: string
      }>
    }>(LOCAL_CONTRACT_OPERATIONS.AUDIT_LOG, { nodeId: task.id, limit: 50 })
    const actions = history.auditLog.map((e) => e.action)
    expect(actions).toContain('create')
    expect(actions).toContain('status_change')
    expect(actions).toContain('approve')
    // changedBy default actor + ISO timestamps
    expect(history.auditLog.every((e) => e.changedBy === 'local')).toBe(true)
    expect(history.auditLog.every((e) => typeof e.createdAt === 'string')).toBe(
      true,
    )
    // the status_change entry carries the field-level diff
    const statusEntry = history.auditLog.find(
      (e) => e.action === 'status_change',
    )
    expect(statusEntry?.field).toBe('status')
    expect(statusEntry?.newValue).toBe('pending_review')

    // --- Edge removal + node deletion --------------------------------------
    const { removeEdge } = await ok<{ removeEdge: boolean }>(
      LOCAL_CONTRACT_OPERATIONS.UNBLOCK_TASK,
      { sourceId: blocker.id, targetId: task.id, relation: 'blocks' },
    )
    expect(removeEdge).toBe(true)

    const { deleteNode } = await ok<{ deleteNode: boolean }>(
      LOCAL_CONTRACT_OPERATIONS.DELETE_NODE,
      { id: task.id },
    )
    expect(deleteNode).toBe(true)
  })

  it('covers the entire LOCAL_CONTRACT_OPERATIONS set (no op left untested)', () => {
    // Guards against silently adding a CLI operation that the contract above
    // never exercises. Keep this list in lockstep with the assertions above.
    const exercised = new Set([
      'GET_NODE',
      'GET_PROJECT',
      'LIST_PROJECTS_FOR_SET',
      'LIST_PROJECTS',
      'ALL_TASKS',
      'DESCENDANTS',
      'DESCENDANTS_BRIEF',
      'LIST_TASKS',
      'SUBTREE',
      'READY_TASKS',
      'SHOW_TASK',
      'TASK_DEPS',
      'SEARCH',
      'CREATE_PROJECT',
      'CREATE_NODE',
      'CREATE_TASK',
      'CREATE_NODE_WITH_PARENT',
      'UPDATE_NODE',
      'UPDATE_STATUS',
      'APPROVE_NODE',
      'CLAIM_NODE',
      'DELETE_NODE',
      'CREATE_EDGE',
      'LINK_TASK',
      'BLOCK_TASK',
      'UNBLOCK_TASK',
      'IMPORT_EXISTING',
      'IMPORT_EDGES',
      'IMPORT_CREATE',
      'IMPORT_UPDATE',
      'IMPORT_EDGE',
      'EXPORT_PROJECT',
      'EXPORT_DESCENDANTS',
      'EXPORT_EDGES',
      'AUDIT_LOG',
    ])
    expect(new Set(Object.keys(LOCAL_CONTRACT_OPERATIONS))).toEqual(exercised)
  })

  describe('intentional SaaS-only divergences (must NOT resolve on local)', () => {
    for (const [name, query] of Object.entries(SAAS_ONLY_OPERATIONS)) {
      it(`local server rejects ${name}`, async () => {
        const variables: Record<string, Record<string, unknown>> = {
          REGISTER: { email: 'a@b.co', tier: 'pro' },
          CREATE_CHECKOUT: { tier: 'pro' },
        }
        const body = await run(query, variables[name] ?? {})
        // The bundled local server's schema has no register/whoami/
        // rotateApiKey/createCheckout, so Yoga rejects with a validation error
        // ("Cannot query field ..." / "Unknown ..."). This is the contract: the
        // CLI must NOT route these to a local backend.
        expect(
          body.errors,
          `${name} unexpectedly resolved on the local server`,
        ).toBeDefined()
      })
    }
  })
})
