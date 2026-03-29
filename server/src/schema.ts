import { createSchema } from 'graphql-yoga'

export const typeDefs = /* GraphQL */ `
  enum NodeType {
    project
    feature
    task
  }

  enum Status {
    draft
    pending_review
    approved
    in_progress
    done
    blocked
    cancelled
  }

  enum Relation {
    part_of
    blocks
  }

  type Node {
    id: ID!
    type: NodeType!
    title: String!
    description: String
    status: Status!
    metadata: String
    createdAt: String!
    updatedAt: String!
    children: [Node!]!
    blockedBy: [Node!]!
    blocking: [Node!]!
  }

  type Edge {
    sourceId: ID!
    targetId: ID!
    relation: Relation!
    createdAt: String!
  }

  type Query {
    node(id: ID!): Node
    nodes(type: NodeType, status: Status, parentId: ID): [Node!]!
    tree(rootId: ID!): Node
    search(query: String!, type: NodeType): [Node!]!
  }

  type Mutation {
    createNode(
      type: NodeType!
      title: String!
      description: String
      parentId: ID
      metadata: String
    ): Node!

    updateNode(
      id: ID!
      title: String
      description: String
      status: Status
      metadata: String
    ): Node!

    deleteNode(id: ID!): Boolean!

    createEdge(
      sourceId: ID!
      targetId: ID!
      relation: Relation!
    ): Edge!

    deleteEdge(
      sourceId: ID!
      targetId: ID!
      relation: Relation!
    ): Boolean!
  }
`

export const schema = createSchema({
  typeDefs,
  resolvers: {
    Query: {},
    Mutation: {},
  },
})
