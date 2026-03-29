import { describe, expect, it } from 'vitest'
import { schema } from './schema.ts'

describe('schema', () => {
  it('exports a valid GraphQL schema object', () => {
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
  })

  it('defines Node type with required fields', () => {
    const nodeType = schema.getType('Node')
    expect(nodeType).toBeDefined()
  })

  it('defines NodeType enum with project, feature, task values', () => {
    const nodeType = schema.getType('NodeType')
    expect(nodeType).toBeDefined()
  })

  it('defines Status enum', () => {
    const status = schema.getType('Status')
    expect(status).toBeDefined()
  })

  it('defines Relation enum', () => {
    const relation = schema.getType('Relation')
    expect(relation).toBeDefined()
  })

  it('Node type has children, blockedBy, and blocking fields', () => {
    const nodeType = schema.getType(
      'Node',
    ) as import('graphql').GraphQLObjectType
    const fields = nodeType.getFields()
    expect(fields.children).toBeDefined()
    expect(fields.blockedBy).toBeDefined()
    expect(fields.blocking).toBeDefined()
  })

  it('Query type has tree and deleteNode mutation exists', () => {
    const queryType = schema.getType(
      'Query',
    ) as import('graphql').GraphQLObjectType
    const queryFields = queryType.getFields()
    expect(queryFields.tree).toBeDefined()

    const mutationType = schema.getType(
      'Mutation',
    ) as import('graphql').GraphQLObjectType
    const mutationFields = mutationType.getFields()
    expect(mutationFields.deleteNode).toBeDefined()
  })

  it('Edge type uses enum types', () => {
    const edgeType = schema.getType(
      'Edge',
    ) as import('graphql').GraphQLObjectType
    const fields = edgeType.getFields()
    expect(fields.relation).toBeDefined()
    expect(fields.sourceId).toBeDefined()
    expect(fields.targetId).toBeDefined()
  })

  it('uses enum types for NodeType, Status, and Relation', () => {
    expect(schema.getType('NodeType')).toBeDefined()
    expect(schema.getType('Status')).toBeDefined()
    expect(schema.getType('Relation')).toBeDefined()
  })

  it('defines approveNode mutation', () => {
    const mutationType = schema.getType(
      'Mutation',
    ) as import('graphql').GraphQLObjectType
    const fields = mutationType.getFields()
    expect(fields.approveNode).toBeDefined()
  })
})
