import { createSchema, createYoga } from 'graphql-yoga'
import { createDb } from './db.ts'
import { createResolvers } from './resolvers.ts'
import { typeDefs } from './schema.ts'

export function createServer(opts?: { dbPath?: string; port?: number }) {
  const dbPath = opts?.dbPath ?? process.env.FLOWY_DB_PATH ?? './flowy.sqlite'
  const port = opts?.port ?? Number(process.env.PORT ?? 4000)

  const db = createDb(dbPath)
  const resolvers = createResolvers(db)

  const yoga = createYoga({
    schema: createSchema({ typeDefs, resolvers }),
    graphqlEndpoint: '/graphql',
  })

  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === '/health' && req.method === 'GET') {
        return Response.json({ status: 'ok' })
      }
      return yoga.fetch(req)
    },
  })

  return {
    server,
    port: server.port,
    db,
    close() {
      server.stop()
      db.close()
    },
  }
}

if (import.meta.main) {
  const { port } = createServer()
  console.log(`Flowy local server running on http://localhost:${port}`)
  console.log(`  GraphQL: http://localhost:${port}/graphql`)
  console.log(`  Health:  http://localhost:${port}/health`)
}
