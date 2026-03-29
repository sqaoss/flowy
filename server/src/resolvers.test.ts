import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, type FlowyDb } from './db.ts'
import { createResolvers } from './resolvers.ts'

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
    it('creates a project node with default status draft', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Test Project',
      })

      expect(node).toMatchObject({
        type: 'project',
        title: 'Test Project',
        status: 'draft',
      })
      expect(node.id).toBeDefined()
      expect(node.createdAt).toBeDefined()
      expect(node.updatedAt).toBeDefined()
    })

    it('creates a node with description and metadata', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'Auth Flow',
        description: 'OAuth2 integration',
        metadata: '{"priority":"high"}',
      })

      expect(node).toMatchObject({
        type: 'feature',
        title: 'Auth Flow',
        description: 'OAuth2 integration',
        metadata: '{"priority":"high"}',
      })
    })

    it('creates a part_of edge when parentId is provided', () => {
      const project = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Parent',
      })
      const feature = resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'Child',
        parentId: project.id,
      })

      const edge = db.raw
        .query(
          'SELECT * FROM edges WHERE source_id = ? AND target_id = ? AND relation = ?',
        )
        .get(feature.id, project.id, 'part_of')
      expect(edge).toBeDefined()
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
    it('returns all nodes when no filters given', () => {
      resolvers.Mutation.createNode(null, { type: 'project', title: 'P1' })
      resolvers.Mutation.createNode(null, { type: 'project', title: 'P2' })

      const nodes = resolvers.Query.nodes(null, {})
      expect(nodes).toHaveLength(2)
    })

    it('filters by type', () => {
      resolvers.Mutation.createNode(null, { type: 'project', title: 'P1' })
      resolvers.Mutation.createNode(null, { type: 'feature', title: 'F1' })

      const projects = resolvers.Query.nodes(null, { type: 'project' })
      expect(projects).toHaveLength(1)
      expect(projects[0].title).toBe('P1')
    })

    it('filters children by parentId', () => {
      const project = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Parent',
      })
      resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'Child',
        parentId: project.id,
      })
      resolvers.Mutation.createNode(null, {
        type: 'feature',
        title: 'Orphan',
      })

      const children = resolvers.Query.nodes(null, {
        parentId: project.id,
      })
      expect(children).toHaveLength(1)
      expect(children[0].title).toBe('Child')
    })
  })

  describe('Mutation.updateNode', () => {
    it('updates title and preserves other fields', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'project',
        title: 'Original',
        description: 'Keep me',
      })

      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        title: 'Renamed',
      })

      expect(updated).toMatchObject({
        id: node.id,
        title: 'Renamed',
        description: 'Keep me',
        status: 'draft',
      })
    })

    it('updates status', () => {
      const node = resolvers.Mutation.createNode(null, {
        type: 'task',
        title: 'Do thing',
      })

      const updated = resolvers.Mutation.updateNode(null, {
        id: node.id,
        status: 'in_progress',
      })

      expect(updated.status).toBe('in_progress')
    })

    it('throws when node does not exist', () => {
      expect(() =>
        resolvers.Mutation.updateNode(null, {
          id: 'nonexistent',
          title: 'Nope',
        }),
      ).toThrow('Node nonexistent not found')
    })
  })
})
