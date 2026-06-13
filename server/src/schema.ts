import { createSchema } from 'graphql-yoga'

export const typeDefs = /* GraphQL */ `
  type Node {
    id: String!
    type: String!
    title: String!
    description: String
    status: String!
    metadata: String
    createdAt: String!
    updatedAt: String!
  }

  type Edge {
    sourceId: String!
    targetId: String!
    relation: String!
    createdAt: String!
  }

  # An audit-log entry. Shaped to match the SaaS \`auditLog\` field so
  # \`flowy history\` output is consistent across backends. \`snapshot\` is a
  # JSON-encoded string (or null).
  type AuditEntry {
    id: String!
    nodeId: String
    action: String!
    field: String
    oldValue: String
    newValue: String
    snapshot: String
    changedBy: String!
    createdAt: String!
  }

  # A node returned from a subtree traversal, annotated with how it was reached:
  # the parent it descends from (parentId), how many edges down the root it sits
  # (depth, root's direct children are depth 1), and the relation of the edge
  # that links it to its parent.
  type SubtreeNode {
    id: String!
    type: String!
    title: String!
    description: String
    status: String!
    metadata: String
    createdAt: String!
    updatedAt: String!
    parentId: String!
    depth: Int!
    relation: String!
  }

  type Query {
    node(id: String!): Node
    nodes(type: String): [Node!]!
    descendants(nodeId: String!, relation: String, maxDepth: Int): [Node!]!
    subtree(nodeId: String!, relation: String, maxDepth: Int): [SubtreeNode!]!
    edges(nodeId: String!, relation: String!, direction: String): [Node!]!
    readyTasks(projectId: String): [Node!]!
    search(query: String!, type: String, status: String, limit: Int): [Node!]!
    auditLog(nodeId: String!, limit: Int): [AuditEntry!]!
  }

  type Mutation {
    createNode(
      type: String!
      title: String!
      description: String
      status: String
      metadata: String
    ): Node!
    updateNode(
      id: String!
      title: String
      description: String
      status: String
      metadata: String
    ): Node!
    approveNode(id: String!): Node!
    deleteNode(id: String!): Boolean!
    createEdge(sourceId: String!, targetId: String!, relation: String!): Edge!
    removeEdge(sourceId: String!, targetId: String!, relation: String!): Boolean!
  }
`

export const schema = createSchema({
  typeDefs,
  resolvers: {
    Query: {},
    Mutation: {},
  },
})
