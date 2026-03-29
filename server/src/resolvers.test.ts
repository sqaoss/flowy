import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, type FlowyDb } from './db.ts'
import { createResolvers, type NodeGql } from './resolvers.ts'

// Helper to create a node (always succeeds, typed non-null)
function create(
  r: ReturnType<typeof createResolvers>,
  args: { type: string; title: string; description?: string },
): NodeGql {
  return r.Mutation.createNode(null, args)
}

// Helper to find a node (throws if not found, for tests only)
function find(r: ReturnType<typeof createResolvers>, id: string): NodeGql {
  const node = r.Query.node(null, { id })
  if (!node) throw new Error(`Test helper: node ${id} not found`)
  return node
}

describe('createResolvers', () => {
  let db: FlowyDb
  let resolvers: ReturnType<typeof createResolvers>

  beforeEach(() => {
    db = createDb(':memory:')
    resolvers = createResolvers(db)
  })

  afterEach(() => {
    db.close()
  })

  it('returns an object with Query and Mutation keys', () => {
    expect(resolvers).toHaveProperty('Query')
    expect(resolvers).toHaveProperty('Mutation')
  })

  describe('Mutation.createNode', () => {
    it('creates a project node with id starting with proj_', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Test Project',
      })
      expect(node.id).toMatch(/^proj_/)
      expect(node).toMatchObject({
        type: 'project',
        title: 'Test Project',
        status: 'draft',
      })
    })

    it('creates a feature node with id starting with feat_', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'Auth Flow',
      })
      expect(node.id).toMatch(/^feat_/)
    })

    it('creates a task node with id starting with task_', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'task',
        title: 'Write tests',
      })
      expect(node.id).toMatch(/^task_/)
    })

    it('creates a node with default status draft', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Test',
      })
      expect(node.status).toBe('draft')
    })

    it('creates a node with description', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'Auth Flow',
        description: 'OAuth2 integration',
      })
      expect(node).toMatchObject({
        type: 'feature',
        title: 'Auth Flow',
        description: 'OAuth2 integration',
      })
    })

    it('returns camelCase timestamps', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Test',
      })
      expect(node.createdAt).toBeDefined()
      expect(node.updatedAt).toBeDefined()
      expect(typeof node.createdAt).toBe('string')
      expect(typeof node.updatedAt).toBe('string')
    })
  })

  describe('Query.node', () => {
    it('returns a node by id', () => {
      const created = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Find Me',
      })
      const found = resolvers.Query.node(null, { id: created.id })
      expect(found).toMatchObject({
        id: created.id,
        type: 'project',
        title: 'Find Me',
      })
    })

    it('returns null for non-existent id', () => {
      const found = resolvers.Query.node(null, { id: 'nonexistent' })
      expect(found).toBeNull()
    })
  })

  describe('Query.nodes', () => {
    it('lists nodes by type', () => {
      resolvers.Mutation.createNode(null, { type: 'project', title: 'P1' })
      resolvers.Mutation.createNode(null, { type: 'project', title: 'P2' })
      resolvers.Mutation.createNode(null, { type: 'feature', title: 'F1' })

      const projects = resolvers.Query.nodes(null, { type: 'project' })
      expect(projects).toHaveLength(2)
      expect(
        projects.every((n: { type: string }) => n.type === 'project'),
      ).toBe(true)
    })

    it('lists all nodes when no type filter', () => {
      resolvers.Mutation.createNode(null, { type: 'project', title: 'P1' })
      resolvers.Mutation.createNode(null, { type: 'feature', title: 'F1' })

      const all = resolvers.Query.nodes(null, {})
      expect(all).toHaveLength(2)
    })
  })

  describe('Mutation.updateNode', () => {
    it('changes node status', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'task',
        title: 'Test',
      })
      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'in_progress',
      })
      expect(updated.status).toBe('in_progress')
    })

    it('throws for missing node id', () => {
      expect(() =>
        resolvers.Mutation.updateNode(null, {
          id: 'nonexistent',
          status: 'done',
        }),
      ).toThrow('Node nonexistent not found')
    })
  })

  describe('Mutation.approveNode', () => {
    it('transitions pending_review to approved', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'Review Me',
      })
      resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'pending_review',
      })
      const approved = resolvers.Mutation.approveNode(null, { id: node.id })
      expect(approved.status).toBe('approved')
    })

    it('rejects approval of draft nodes', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'Draft',
      })
      expect(() =>
        resolvers.Mutation.approveNode(null, { id: node.id }),
      ).toThrow('Cannot approve node with status "draft"')
    })

    it('throws for missing node', () => {
      expect(() =>
        resolvers.Mutation.approveNode(null, { id: 'nonexistent' }),
      ).toThrow('Node nonexistent not found')
    })
  })

  describe('Mutation.createEdge', () => {
    it('links two nodes', () => {
      const project = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Parent',
      })
      const feature = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'Child',
      })
      const edge = resolvers.Mutation.createEdge(null, {
        sourceId: feature.id,
        targetId: project.id,
        relation: 'part_of',
      })
      expect(edge).toMatchObject({
        sourceId: feature.id,
        targetId: project.id,
        relation: 'part_of',
      })
      expect(edge.createdAt).toBeDefined()
    })
  })

  describe('Mutation.removeEdge', () => {
    it('removes an existing edge and returns true', () => {
      const project = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'P',
      })
      const feature = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'F',
      })
      resolvers.Mutation.createEdge(null, {
        sourceId: feature.id,
        targetId: project.id,
        relation: 'part_of',
      })
      const result = resolvers.Mutation.removeEdge(null, {
        sourceId: feature.id,
        targetId: project.id,
        relation: 'part_of',
      })
      expect(result).toBe(true)
    })

    it('returns false for nonexistent edge', () => {
      const result = resolvers.Mutation.removeEdge(null, {
        sourceId: 'a',
        targetId: 'b',
        relation: 'part_of',
      })
      expect(result).toBe(false)
    })
  })

  describe('Query.descendants', () => {
    it('returns direct children with maxDepth 1', () => {
      const project = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Root',
      })
      const feat1 = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'F1',
      })
      const feat2 = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'F2',
      })
      const task = resolvers.Mutation.createNode(null, {
        type: 'task',
        title: 'T1',
      })
      resolvers.Mutation.createEdge(null, {
        sourceId: feat1.id,
        targetId: project.id,
        relation: 'part_of',
      })
      resolvers.Mutation.createEdge(null, {
        sourceId: feat2.id,
        targetId: project.id,
        relation: 'part_of',
      })
      resolvers.Mutation.createEdge(null, {
        sourceId: task.id,
        targetId: feat1.id,
        relation: 'part_of',
      })

      const children = resolvers.Query.descendants(null, {
        nodeId: project.id,
        relation: 'part_of',
        maxDepth: 1,
      })
      expect(children).toHaveLength(2)
      const ids = children.map((n: { id: string }) => n.id)
      expect(ids).toContain(feat1.id)
      expect(ids).toContain(feat2.id)
      expect(ids).not.toContain(task.id)
    })

    it('returns multi-level descendants without maxDepth constraint', () => {
      const project = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Root',
      })
      const feature = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'F1',
      })
      const task = resolvers.Mutation.createNode(null, {
        type: 'task',
        title: 'T1',
      })
      resolvers.Mutation.createEdge(null, {
        sourceId: feature.id,
        targetId: project.id,
        relation: 'part_of',
      })
      resolvers.Mutation.createEdge(null, {
        sourceId: task.id,
        targetId: feature.id,
        relation: 'part_of',
      })

      const all = resolvers.Query.descendants(null, {
        nodeId: project.id,
        relation: 'part_of',
      })
      expect(all).toHaveLength(2)
      const ids = all.map((n: { id: string }) => n.id)
      expect(ids).toContain(feature.id)
      expect(ids).toContain(task.id)
    })
  })

  describe('Query.subtree', () => {
    it('returns full tree traversal across all edge types', () => {
      const project = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Root',
      })
      const feature = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'F1',
      })
      const task = resolvers.Mutation.createNode(null, {
        type: 'task',
        title: 'T1',
      })
      resolvers.Mutation.createEdge(null, {
        sourceId: feature.id,
        targetId: project.id,
        relation: 'part_of',
      })
      resolvers.Mutation.createEdge(null, {
        sourceId: task.id,
        targetId: feature.id,
        relation: 'part_of',
      })

      const tree = resolvers.Query.subtree(null, { nodeId: project.id })
      expect(tree).toHaveLength(2)
    })

    it('respects maxDepth', () => {
      const project = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Root',
      })
      const feature = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'F1',
      })
      const task = resolvers.Mutation.createNode(null, {
        type: 'task',
        title: 'T1',
      })
      resolvers.Mutation.createEdge(null, {
        sourceId: feature.id,
        targetId: project.id,
        relation: 'part_of',
      })
      resolvers.Mutation.createEdge(null, {
        sourceId: task.id,
        targetId: feature.id,
        relation: 'part_of',
      })

      const shallow = resolvers.Query.subtree(null, {
        nodeId: project.id,
        maxDepth: 1,
      })
      expect(shallow).toHaveLength(1)
      expect(shallow[0].id).toBe(feature.id)
    })
  })

  describe('Query.search', () => {
    it('finds nodes by title', () => {
      resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Authentication',
      })
      resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Database',
      })

      const results = resolvers.Query.search(null, { query: 'Auth' })
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Authentication')
    })

    it('finds nodes by description', () => {
      resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'Login',
        description: 'OAuth2 integration',
      })

      const results = resolvers.Query.search(null, { query: 'OAuth' })
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Login')
    })

    it('filters by type', () => {
      resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Auth Project',
      })
      resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'Auth Feature',
      })

      const results = resolvers.Query.search(null, {
        query: 'Auth',
        type: 'project',
      })
      expect(results).toHaveLength(1)
      expect(results[0].type).toBe('project')
    })

    it('filters by status', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Auth',
      })
      resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'in_progress',
      })
      resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Auth2',
      })

      const results = resolvers.Query.search(null, {
        query: 'Auth',
        status: 'in_progress',
      })
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Auth')
    })

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        resolvers.Mutation.createNode(null, {
          type: 'task',
          title: `Task ${i}`,
        })
      }

      const results = resolvers.Query.search(null, {
        query: 'Task',
        limit: 2,
      })
      expect(results).toHaveLength(2)
    })
  })
})
