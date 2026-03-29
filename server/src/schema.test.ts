import { describe, expect, it } from 'vitest'
import { schema } from './schema.ts'

describe('schema', () => {
  it('exports a valid GraphQL schema object', () => {
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
  })

  it('defines Node type with required fields', () => {
    const nodeType = schema.getType(
      'Node',
    ) as import('graphql').GraphQLObjectType
    expect(nodeType).toBeDefined()
    const fields = nodeType.getFields()
    expect(fields.id).toBeDefined()
    expect(fields.type).toBeDefined()
    expect(fields.title).toBeDefined()
    expect(fields.description).toBeDefined()
    expect(fields.status).toBeDefined()
    expect(fields.metadata).toBeDefined()
    expect(fields.createdAt).toBeDefined()
    expect(fields.updatedAt).toBeDefined()
  })

  it('uses String types instead of enums (no NodeType, Status, Relation enums)', () => {
    expect(schema.getType('NodeType')).toBeUndefined()
    expect(schema.getType('Status')).toBeUndefined()
    expect(schema.getType('Relation')).toBeUndefined()
  })

  it('Node type does not have children, blockedBy, or blocking fields', () => {
    const nodeType = schema.getType(
      'Node',
    ) as import('graphql').GraphQLObjectType
    const fields = nodeType.getFields()
    expect(fields.children).toBeUndefined()
    expect(fields.blockedBy).toBeUndefined()
    expect(fields.blocking).toBeUndefined()
  })

  it('Edge type has sourceId, targetId, relation, createdAt as String fields', () => {
    const edgeType = schema.getType(
      'Edge',
    ) as import('graphql').GraphQLObjectType
    const fields = edgeType.getFields()
    expect(fields.sourceId).toBeDefined()
    expect(fields.targetId).toBeDefined()
    expect(fields.relation).toBeDefined()
    expect(fields.createdAt).toBeDefined()
  })

  it('Query type has node, nodes, descendants, subtree, search', () => {
    const queryType = schema.getType(
      'Query',
    ) as import('graphql').GraphQLObjectType
    const fields = queryType.getFields()
    expect(fields.node).toBeDefined()
    expect(fields.nodes).toBeDefined()
    expect(fields.descendants).toBeDefined()
    expect(fields.subtree).toBeDefined()
    expect(fields.search).toBeDefined()
  })

  it('Query type does not have tree', () => {
    const queryType = schema.getType(
      'Query',
    ) as import('graphql').GraphQLObjectType
    const fields = queryType.getFields()
    expect(fields.tree).toBeUndefined()
  })

  it('Mutation type has createNode, updateNode, approveNode, createEdge, removeEdge', () => {
    const mutationType = schema.getType(
      'Mutation',
    ) as import('graphql').GraphQLObjectType
    const fields = mutationType.getFields()
    expect(fields.createNode).toBeDefined()
    expect(fields.updateNode).toBeDefined()
    expect(fields.approveNode).toBeDefined()
    expect(fields.createEdge).toBeDefined()
    expect(fields.removeEdge).toBeDefined()
  })

  it('Mutation type does not have deleteNode or deleteEdge', () => {
    const mutationType = schema.getType(
      'Mutation',
    ) as import('graphql').GraphQLObjectType
    const fields = mutationType.getFields()
    expect(fields.deleteNode).toBeUndefined()
    expect(fields.deleteEdge).toBeUndefined()
  })
})
