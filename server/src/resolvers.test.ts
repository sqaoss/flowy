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

    it('persists metadata as JSON and reads it back unchanged', () => {
      const created = resolvers.Mutation.createNode(null, {
        type: 'task',
        title: 'With meta',
        metadata: '{"priority":"high","effort":3}',
      })
      expect(created.metadata).toBe('{"priority":"high","effort":3}')
      const found = find(resolvers, created.id)
      expect(JSON.parse(found.metadata as string)).toEqual({
        priority: 'high',
        effort: 3,
      })
    })

    it('accepts an explicit initial status', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'task',
        title: 'Started',
        status: 'in_progress',
      })
      expect(node.status).toBe('in_progress')
    })

    it('rejects an invalid initial status with VALIDATION_ERROR', () => {
      try {
        resolvers.Mutation.createNode(null, {
          type: 'task',
          title: 'Bad',
          status: 'bogus',
        })
        throw new Error('expected createNode to throw')
      } catch (err) {
        const e = err as { message: string; extensions?: { code?: string } }
        expect(e.message).toContain('Invalid status: bogus')
        expect(e.extensions?.code).toBe('VALIDATION_ERROR')
      }
    })

    it('rejects non-JSON metadata with VALIDATION_ERROR', () => {
      try {
        resolvers.Mutation.createNode(null, {
          type: 'task',
          title: 'Bad meta',
          metadata: 'not json',
        })
        throw new Error('expected createNode to throw')
      } catch (err) {
        const e = err as { message: string; extensions?: { code?: string } }
        expect(e.message).toContain('metadata')
        expect(e.extensions?.code).toBe('VALIDATION_ERROR')
      }
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

    it('throws NOT_FOUND for a non-existent id (no silent null)', () => {
      expect(() => resolvers.Query.node(null, { id: 'nonexistent' })).toThrow(
        'Node nonexistent not found',
      )
      try {
        resolvers.Query.node(null, { id: 'nonexistent' })
      } catch (error) {
        expect(
          (error as { extensions?: { code?: string } }).extensions?.code,
        ).toBe('NOT_FOUND')
      }
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

    it('updates the title, leaving other fields untouched', () => {
      const node = create(resolvers, {
        type: 'task',
        title: 'Old title',
        description: 'keep me',
      })
      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        title: 'New title',
      })
      expect(updated.title).toBe('New title')
      expect(updated.description).toBe('keep me')
      expect(updated.status).toBe('draft')
    })

    it('updates the description independently', () => {
      const node = create(resolvers, {
        type: 'task',
        title: 'Title',
        description: 'old desc',
      })
      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        description: 'new desc',
      })
      expect(updated.description).toBe('new desc')
      expect(updated.title).toBe('Title')
    })

    it('updates metadata independently and round-trips', () => {
      const node = create(resolvers, { type: 'task', title: 'Title' })
      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        metadata: '{"source":"import","effort":5}',
      })
      expect(JSON.parse(updated.metadata as string)).toEqual({
        source: 'import',
        effort: 5,
      })
      const found = find(resolvers, node.id)
      expect(JSON.parse(found.metadata as string)).toEqual({
        source: 'import',
        effort: 5,
      })
    })

    it('updates several fields at once', () => {
      const node = create(resolvers, { type: 'task', title: 'Title' })
      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        title: 'Renamed',
        description: 'desc',
        status: 'in_progress',
        metadata: '{"k":"v"}',
      })
      expect(updated.title).toBe('Renamed')
      expect(updated.description).toBe('desc')
      expect(updated.status).toBe('in_progress')
      expect(JSON.parse(updated.metadata as string)).toEqual({ k: 'v' })
    })

    it('rejects non-JSON metadata on update with VALIDATION_ERROR', () => {
      const node = create(resolvers, { type: 'task', title: 'Title' })
      try {
        resolvers.Mutation.updateNode(null, {
          id: node.id,
          metadata: 'nope',
        })
        throw new Error('expected updateNode to throw')
      } catch (err) {
        const e = err as { message: string; extensions?: { code?: string } }
        expect(e.message).toContain('metadata')
        expect(e.extensions?.code).toBe('VALIDATION_ERROR')
      }
    })

    it('not-found error carries the NOT_FOUND code', () => {
      try {
        resolvers.Mutation.updateNode(null, {
          id: 'missing',
          title: 'x',
        })
        throw new Error('expected updateNode to throw')
      } catch (err) {
        const e = err as { extensions?: { code?: string } }
        expect(e.extensions?.code).toBe('NOT_FOUND')
      }
    })

    it('rejects an empty title with VALIDATION_ERROR', () => {
      const node = create(resolvers, { type: 'task', title: 'Title' })
      try {
        resolvers.Mutation.updateNode(null, { id: node.id, title: '   ' })
        throw new Error('expected updateNode to throw')
      } catch (err) {
        const e = err as { extensions?: { code?: string } }
        expect(e.extensions?.code).toBe('VALIDATION_ERROR')
      }
    })
  })

  describe('Mutation.deleteNode', () => {
    it('deletes a leaf node and returns true', () => {
      const node = create(resolvers, { type: 'task', title: 'Leaf' })
      const result = resolvers.Mutation.deleteNode(null, { id: node.id })
      expect(result).toBe(true)
      // After deletion the node is gone: Query.node now fails loud (NOT_FOUND).
      expect(() => resolvers.Query.node(null, { id: node.id })).toThrow(
        `Node ${node.id} not found`,
      )
    })

    it('removes incident blocks edges when deleting a leaf', () => {
      const blocker = create(resolvers, { type: 'task', title: 'Blocker' })
      const blocked = create(resolvers, { type: 'task', title: 'Blocked' })
      resolvers.Mutation.createEdge(null, {
        sourceId: blocker.id,
        targetId: blocked.id,
        relation: 'blocks',
      })

      resolvers.Mutation.deleteNode(null, { id: blocked.id })

      // the blocks edge that referenced the deleted node must be gone
      const edges = db.raw
        .query<{ c: number }, [string, string]>(
          'SELECT COUNT(*) AS c FROM edges WHERE source_id = ? OR target_id = ?',
        )
        .get(blocked.id, blocked.id) as { c: number }
      expect(edges.c).toBe(0)
    })

    it('deletes a node together with its part_of edge to its parent', () => {
      const project = create(resolvers, { type: 'project', title: 'P' })
      const feature = create(resolvers, { type: 'feature', title: 'F' })
      resolvers.Mutation.createEdge(null, {
        sourceId: feature.id,
        targetId: project.id,
        relation: 'part_of',
      })

      const result = resolvers.Mutation.deleteNode(null, { id: feature.id })
      expect(result).toBe(true)
      // parent survives
      expect(resolvers.Query.node(null, { id: project.id })).not.toBeNull()
      // the part_of edge is gone
      const edges = db.raw
        .query<{ c: number }, [string]>(
          'SELECT COUNT(*) AS c FROM edges WHERE source_id = ?',
        )
        .get(feature.id) as { c: number }
      expect(edges.c).toBe(0)
    })

    it('refuses to delete a node that has children (CONFLICT)', () => {
      const project = create(resolvers, { type: 'project', title: 'P' })
      const feature = create(resolvers, { type: 'feature', title: 'F' })
      resolvers.Mutation.createEdge(null, {
        sourceId: feature.id,
        targetId: project.id,
        relation: 'part_of',
      })

      try {
        resolvers.Mutation.deleteNode(null, { id: project.id })
        throw new Error('expected deleteNode to throw')
      } catch (err) {
        const e = err as { message: string; extensions?: { code?: string } }
        expect(e.extensions?.code).toBe('CONFLICT')
        expect(e.message).toContain('child')
      }
      // node not deleted
      expect(resolvers.Query.node(null, { id: project.id })).not.toBeNull()
    })

    it('throws NOT_FOUND for a missing node', () => {
      try {
        resolvers.Mutation.deleteNode(null, { id: 'missing' })
        throw new Error('expected deleteNode to throw')
      } catch (err) {
        const e = err as { message: string; extensions?: { code?: string } }
        expect(e.extensions?.code).toBe('NOT_FOUND')
        expect(e.message).toContain('missing')
      }
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

  describe('Mutation.createNode — title and description validation', () => {
    it('throws on empty title', () => {
      expect(() =>
        resolvers.Mutation.createNode(null, { type: 'task', title: '' }),
      ).toThrow('Title is required')
    })

    it('throws on whitespace-only title', () => {
      expect(() =>
        resolvers.Mutation.createNode(null, { type: 'task', title: '   ' }),
      ).toThrow('Title is required')
    })

    it('throws on empty description', () => {
      expect(() =>
        resolvers.Mutation.createNode(null, {
          type: 'task',
          title: 'Valid',
          description: '',
        }),
      ).toThrow('Description cannot be empty')
    })
  })

  describe('Mutation.createNode — input validation', () => {
    it('throws on invalid type', () => {
      expect(() =>
        resolvers.Mutation.createNode(null, {
          type: 'epic',
          title: 'Bad Type',
        }),
      ).toThrow()
    })
  })

  describe('Mutation.updateNode — input validation', () => {
    it('throws on invalid status with friendly message', () => {
      const node = create(resolvers, { type: 'task', title: 'Test' })
      expect(() =>
        resolvers.Mutation.updateNode(null, {
          id: node.id,
          status: 'invalid_status',
        }),
      ).toThrow(
        'Invalid status: invalid_status. Must be one of: draft, pending_review, approved, in_progress, done, blocked, cancelled',
      )
    })

    it('keeps current status when status is omitted', () => {
      const node = create(resolvers, { type: 'task', title: 'Test' })
      const updated = resolvers.Mutation.updateNode(null, { id: node.id })
      expect(updated.status).toBe('draft')
    })
  })

  describe('Mutation.approveNode — decision table completeness', () => {
    it('rejects approval of in_progress nodes', () => {
      const node = create(resolvers, { type: 'feature', title: 'Test' })
      resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'in_progress',
      })
      expect(() =>
        resolvers.Mutation.approveNode(null, { id: node.id }),
      ).toThrow('Cannot approve node with status "in_progress"')
    })

    it('rejects approval of done nodes', () => {
      const node = create(resolvers, { type: 'feature', title: 'Test' })
      resolvers.Mutation.updateNode(null, { id: node.id, status: 'done' })
      expect(() =>
        resolvers.Mutation.approveNode(null, { id: node.id }),
      ).toThrow('Cannot approve node with status "done"')
    })

    it('rejects approval of already approved nodes', () => {
      const node = create(resolvers, { type: 'feature', title: 'Test' })
      resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'pending_review',
      })
      resolvers.Mutation.approveNode(null, { id: node.id })
      expect(() =>
        resolvers.Mutation.approveNode(null, { id: node.id }),
      ).toThrow('Cannot approve node with status "approved"')
    })

    it('rejects approval of blocked nodes', () => {
      const node = create(resolvers, { type: 'feature', title: 'Test' })
      resolvers.Mutation.updateNode(null, { id: node.id, status: 'blocked' })
      expect(() =>
        resolvers.Mutation.approveNode(null, { id: node.id }),
      ).toThrow('Cannot approve node with status "blocked"')
    })

    it('rejects approval of cancelled nodes', () => {
      const node = create(resolvers, { type: 'feature', title: 'Test' })
      resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'cancelled',
      })
      expect(() =>
        resolvers.Mutation.approveNode(null, { id: node.id }),
      ).toThrow('Cannot approve node with status "cancelled"')
    })
  })

  describe('Query.search — edge cases', () => {
    it('returns empty array when no matches', () => {
      create(resolvers, { type: 'project', title: 'Authentication' })
      const results = resolvers.Query.search(null, {
        query: 'zzz_no_match',
      })
      expect(results).toEqual([])
    })

    it('throws when query is shorter than 3 characters', () => {
      expect(() => resolvers.Query.search(null, { query: '' })).toThrow(
        'Search query must be at least 3 characters',
      )
      expect(() => resolvers.Query.search(null, { query: 'a' })).toThrow(
        'Search query must be at least 3 characters',
      )
      expect(() => resolvers.Query.search(null, { query: 'ab' })).toThrow(
        'Search query must be at least 3 characters',
      )
    })

    it('succeeds with 3-character query', () => {
      create(resolvers, { type: 'project', title: 'abc match' })
      const results = resolvers.Query.search(null, { query: 'abc' })
      expect(results).toHaveLength(1)
    })

    it('does not treat % as LIKE wildcard', () => {
      create(resolvers, { type: 'project', title: '100% done' })
      create(resolvers, { type: 'project', title: '100 things' })
      const results = resolvers.Query.search(null, { query: '100%' })
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('100% done')
    })

    it('does not treat _ as LIKE wildcard', () => {
      create(resolvers, { type: 'project', title: '_est something' })
      create(resolvers, { type: 'project', title: 'Test something' })
      const results = resolvers.Query.search(null, { query: '_est' })
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('_est something')
    })
  })

  describe('Mutation.updateNode — state transitions', () => {
    it('transitions approved to in_progress', () => {
      const node = create(resolvers, { type: 'task', title: 'Test' })
      resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'pending_review',
      })
      resolvers.Mutation.approveNode(null, { id: node.id })
      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'in_progress',
      })
      expect(updated.status).toBe('in_progress')
    })

    it('transitions in_progress to done', () => {
      const node = create(resolvers, { type: 'task', title: 'Test' })
      resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'in_progress',
      })
      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'done',
      })
      expect(updated.status).toBe('done')
    })

    it('allows skipping states: draft to done', () => {
      const node = create(resolvers, { type: 'task', title: 'Test' })
      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'done',
      })
      expect(updated.status).toBe('done')
    })

    it('allows backwards transition: done to draft', () => {
      const node = create(resolvers, { type: 'task', title: 'Test' })
      resolvers.Mutation.updateNode(null, { id: node.id, status: 'done' })
      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'draft',
      })
      expect(updated.status).toBe('draft')
    })

    it('transitions to blocked', () => {
      const node = create(resolvers, { type: 'task', title: 'Test' })
      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'blocked',
      })
      expect(updated.status).toBe('blocked')
    })

    it('transitions to cancelled', () => {
      const node = create(resolvers, { type: 'task', title: 'Test' })
      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'cancelled',
      })
      expect(updated.status).toBe('cancelled')
    })

    it('allows same status transition (no-op)', () => {
      const node = create(resolvers, { type: 'task', title: 'Test' })
      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'draft',
      })
      expect(updated.status).toBe('draft')
    })
  })

  describe('Query.descendants — edge cases', () => {
    it('returns empty array for leaf node', () => {
      const leaf = create(resolvers, { type: 'task', title: 'Leaf' })
      const result = resolvers.Query.descendants(null, {
        nodeId: leaf.id,
        relation: 'part_of',
      })
      expect(result).toEqual([])
    })

    it('returns empty array for non-existent node', () => {
      const result = resolvers.Query.descendants(null, {
        nodeId: 'nonexistent_id',
        relation: 'part_of',
      })
      expect(result).toEqual([])
    })

    it('returns empty array when maxDepth is 0', () => {
      const project = create(resolvers, { type: 'project', title: 'Root' })
      const feature = create(resolvers, { type: 'feature', title: 'Child' })
      resolvers.Mutation.createEdge(null, {
        sourceId: feature.id,
        targetId: project.id,
        relation: 'part_of',
      })
      const result = resolvers.Query.descendants(null, {
        nodeId: project.id,
        relation: 'part_of',
        maxDepth: 0,
      })
      expect(result).toEqual([])
    })

    it('traverses blocks relation', () => {
      const task1 = create(resolvers, { type: 'task', title: 'Blocker' })
      const task2 = create(resolvers, { type: 'task', title: 'Blocked' })
      resolvers.Mutation.createEdge(null, {
        sourceId: task1.id,
        targetId: task2.id,
        relation: 'blocks',
      })
      const blockers = resolvers.Query.descendants(null, {
        nodeId: task2.id,
        relation: 'blocks',
      })
      expect(blockers).toHaveLength(1)
      expect(blockers[0].id).toBe(task1.id)
    })
  })

  describe('Mutation.createEdge — edge cases', () => {
    it('throws on duplicate edge', () => {
      const p = create(resolvers, { type: 'project', title: 'P' })
      const f = create(resolvers, { type: 'feature', title: 'F' })
      resolvers.Mutation.createEdge(null, {
        sourceId: f.id,
        targetId: p.id,
        relation: 'part_of',
      })
      expect(() =>
        resolvers.Mutation.createEdge(null, {
          sourceId: f.id,
          targetId: p.id,
          relation: 'part_of',
        }),
      ).toThrow()
    })

    it('throws when source node does not exist', () => {
      const target = create(resolvers, { type: 'project', title: 'Target' })
      expect(() =>
        resolvers.Mutation.createEdge(null, {
          sourceId: 'nonexistent_id',
          targetId: target.id,
          relation: 'part_of',
        }),
      ).toThrow('Source node nonexistent_id not found')
    })

    it('throws when target node does not exist', () => {
      const source = create(resolvers, { type: 'feature', title: 'Source' })
      expect(() =>
        resolvers.Mutation.createEdge(null, {
          sourceId: source.id,
          targetId: 'nonexistent_id',
          relation: 'part_of',
        }),
      ).toThrow('Target node nonexistent_id not found')
    })

    it('throws on invalid relation', () => {
      const a = create(resolvers, { type: 'project', title: 'A' })
      const b = create(resolvers, { type: 'feature', title: 'B' })
      expect(() =>
        resolvers.Mutation.createEdge(null, {
          sourceId: b.id,
          targetId: a.id,
          relation: 'depends_on',
        }),
      ).toThrow("Invalid relation: depends_on. Must be 'part_of' or 'blocks'")
    })

    it('throws on self-blocking edge', () => {
      const node = create(resolvers, { type: 'task', title: 'Self' })
      expect(() =>
        resolvers.Mutation.createEdge(null, {
          sourceId: node.id,
          targetId: node.id,
          relation: 'blocks',
        }),
      ).toThrow('A node cannot block itself')
    })
  })

  describe('Query.subtree — edge cases', () => {
    it('returns empty array for leaf node', () => {
      const leaf = create(resolvers, { type: 'task', title: 'Leaf' })
      const result = resolvers.Query.subtree(null, { nodeId: leaf.id })
      expect(result).toEqual([])
    })

    it('returns empty array when maxDepth is 0', () => {
      const project = create(resolvers, { type: 'project', title: 'Root' })
      const feature = create(resolvers, { type: 'feature', title: 'Child' })
      resolvers.Mutation.createEdge(null, {
        sourceId: feature.id,
        targetId: project.id,
        relation: 'part_of',
      })
      const result = resolvers.Query.subtree(null, {
        nodeId: project.id,
        maxDepth: 0,
      })
      expect(result).toEqual([])
    })
  })

  describe('Query.search — boundary values', () => {
    it('returns empty array when limit is 0', () => {
      create(resolvers, { type: 'project', title: 'Test' })
      const results = resolvers.Query.search(null, {
        query: 'Test',
        limit: 0,
      })
      expect(results).toEqual([])
    })
  })

  describe('Query.readyTasks', () => {
    function setStatus(id: string, status: string): void {
      resolvers.Mutation.updateNode(null, { id, status })
    }
    function block(blockerId: string, blockedId: string): void {
      resolvers.Mutation.createEdge(null, {
        sourceId: blockerId,
        targetId: blockedId,
        relation: 'blocks',
      })
    }

    it('returns an unblocked, not-done task', () => {
      const t = create(resolvers, { type: 'task', title: 'Free' })
      const ready = resolvers.Query.readyTasks(null, {})
      expect(ready.map((n) => n.id)).toEqual([t.id])
    })

    it('excludes done and cancelled tasks', () => {
      const open = create(resolvers, { type: 'task', title: 'Open' })
      const done = create(resolvers, { type: 'task', title: 'Done' })
      const cancelled = create(resolvers, { type: 'task', title: 'Cancelled' })
      setStatus(done.id, 'done')
      setStatus(cancelled.id, 'cancelled')

      const ready = resolvers.Query.readyTasks(null, {})
      const ids = ready.map((n) => n.id)
      expect(ids).toContain(open.id)
      expect(ids).not.toContain(done.id)
      expect(ids).not.toContain(cancelled.id)
    })

    it('excludes a task blocked by an unfinished blocker', () => {
      const blocker = create(resolvers, { type: 'task', title: 'Blocker' })
      const blocked = create(resolvers, { type: 'task', title: 'Blocked' })
      block(blocker.id, blocked.id)

      const ready = resolvers.Query.readyTasks(null, {})
      const ids = ready.map((n) => n.id)
      expect(ids).toContain(blocker.id)
      expect(ids).not.toContain(blocked.id)
    })

    it('includes a task once all its blockers are done', () => {
      const blocker = create(resolvers, { type: 'task', title: 'Blocker' })
      const blocked = create(resolvers, { type: 'task', title: 'Blocked' })
      block(blocker.id, blocked.id)
      setStatus(blocker.id, 'done')

      const ready = resolvers.Query.readyTasks(null, {})
      const ids = ready.map((n) => n.id)
      // The done blocker is itself excluded; the formerly-blocked task is ready.
      expect(ids).not.toContain(blocker.id)
      expect(ids).toContain(blocked.id)
    })

    it('treats a cancelled blocker as no longer blocking', () => {
      const blocker = create(resolvers, { type: 'task', title: 'Blocker' })
      const blocked = create(resolvers, { type: 'task', title: 'Blocked' })
      block(blocker.id, blocked.id)
      setStatus(blocker.id, 'cancelled')

      const ready = resolvers.Query.readyTasks(null, {})
      expect(ready.map((n) => n.id)).toContain(blocked.id)
    })

    it('still blocks when any one of several blockers is unfinished', () => {
      const b1 = create(resolvers, { type: 'task', title: 'B1' })
      const b2 = create(resolvers, { type: 'task', title: 'B2' })
      const blocked = create(resolvers, { type: 'task', title: 'Blocked' })
      block(b1.id, blocked.id)
      block(b2.id, blocked.id)
      setStatus(b1.id, 'done')
      // b2 still open -> blocked stays not-ready

      const ready = resolvers.Query.readyTasks(null, {})
      expect(ready.map((n) => n.id)).not.toContain(blocked.id)
    })

    it('returns only tasks, never features or projects', () => {
      const project = create(resolvers, { type: 'project', title: 'P' })
      const feature = create(resolvers, { type: 'feature', title: 'F' })
      const task = create(resolvers, { type: 'task', title: 'T' })

      const ready = resolvers.Query.readyTasks(null, {})
      const ids = ready.map((n) => n.id)
      expect(ids).toContain(task.id)
      expect(ids).not.toContain(project.id)
      expect(ids).not.toContain(feature.id)
    })

    it('returns exactly the unblocked not-done tasks across a mixed fixture', () => {
      // free: ready. blocked-by-open: not ready. blocked-by-done: ready.
      // done: not ready. in_progress + unblocked: ready.
      const free = create(resolvers, { type: 'task', title: 'free' })
      const openBlocker = create(resolvers, { type: 'task', title: 'open-b' })
      const blockedByOpen = create(resolvers, { type: 'task', title: 'bbo' })
      const doneBlocker = create(resolvers, { type: 'task', title: 'done-b' })
      const blockedByDone = create(resolvers, { type: 'task', title: 'bbd' })
      const finished = create(resolvers, { type: 'task', title: 'finished' })
      const started = create(resolvers, { type: 'task', title: 'started' })

      block(openBlocker.id, blockedByOpen.id)
      block(doneBlocker.id, blockedByDone.id)
      setStatus(doneBlocker.id, 'done')
      setStatus(finished.id, 'done')
      setStatus(started.id, 'in_progress')

      const ready = resolvers.Query.readyTasks(null, {})
      const ids = new Set(ready.map((n) => n.id))
      expect(ids).toEqual(
        new Set([free.id, openBlocker.id, blockedByDone.id, started.id]),
      )
    })

    it('scopes to a project via part_of when projectId is given', () => {
      const projA = create(resolvers, { type: 'project', title: 'A' })
      const featA = create(resolvers, { type: 'feature', title: 'FA' })
      const taskA = create(resolvers, { type: 'task', title: 'TA' })
      resolvers.Mutation.createEdge(null, {
        sourceId: featA.id,
        targetId: projA.id,
        relation: 'part_of',
      })
      resolvers.Mutation.createEdge(null, {
        sourceId: taskA.id,
        targetId: featA.id,
        relation: 'part_of',
      })

      const projB = create(resolvers, { type: 'project', title: 'B' })
      const featB = create(resolvers, { type: 'feature', title: 'FB' })
      const taskB = create(resolvers, { type: 'task', title: 'TB' })
      resolvers.Mutation.createEdge(null, {
        sourceId: featB.id,
        targetId: projB.id,
        relation: 'part_of',
      })
      resolvers.Mutation.createEdge(null, {
        sourceId: taskB.id,
        targetId: featB.id,
        relation: 'part_of',
      })

      const ready = resolvers.Query.readyTasks(null, { projectId: projA.id })
      expect(ready.map((n) => n.id)).toEqual([taskA.id])
    })
  })

  describe('Query.edges', () => {
    function block(blockerId: string, blockedId: string): void {
      resolvers.Mutation.createEdge(null, {
        sourceId: blockerId,
        targetId: blockedId,
        relation: 'blocks',
      })
    }

    it('returns blockedBy: incoming blocks edges (sources that block the node)', () => {
      const blocker = create(resolvers, { type: 'task', title: 'Blocker' })
      const blocked = create(resolvers, { type: 'task', title: 'Blocked' })
      block(blocker.id, blocked.id)

      const blockedBy = resolvers.Query.edges(null, {
        nodeId: blocked.id,
        relation: 'blocks',
        direction: 'incoming',
      })
      expect(blockedBy.map((n) => n.id)).toEqual([blocker.id])
    })

    it('returns blocks: outgoing blocks edges (targets the node blocks)', () => {
      const blocker = create(resolvers, { type: 'task', title: 'Blocker' })
      const blocked = create(resolvers, { type: 'task', title: 'Blocked' })
      block(blocker.id, blocked.id)

      const blocks = resolvers.Query.edges(null, {
        nodeId: blocker.id,
        relation: 'blocks',
        direction: 'outgoing',
      })
      expect(blocks.map((n) => n.id)).toEqual([blocked.id])
    })

    it('returns an empty array for a node with no edges', () => {
      const lonely = create(resolvers, { type: 'task', title: 'Lonely' })
      expect(
        resolvers.Query.edges(null, {
          nodeId: lonely.id,
          relation: 'blocks',
          direction: 'incoming',
        }),
      ).toEqual([])
    })
  })
})
