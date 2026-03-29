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

  type Query {
    node(id: String!): Node
    nodes(type: String): [Node!]!
    descendants(nodeId: String!, relation: String, maxDepth: Int): [Node!]!
    subtree(nodeId: String!, maxDepth: Int): [Node!]!
    search(query: String!, type: String, status: String, limit: Int): [Node!]!
  }

  type Mutation {
    createNode(type: String!, title: String!, description: String): Node!
    updateNode(id: String!, status: String): Node!
    approveNode(id: String!): Node!
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
