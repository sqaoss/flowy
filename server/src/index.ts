import { createSchema, createYoga } from 'graphql-yoga'
import { createDb } from './db.ts'
import { createResolvers } from './resolvers.ts'
import { typeDefs } from './schema.ts'

export function createServer(opts?: {
  dbPath?: string
  port?: number
  hostname?: string
}) {
  const dbPath = opts?.dbPath ?? process.env.FLOWY_DB_PATH ?? './flowy.sqlite'
  const port = opts?.port ?? Number(process.env.PORT ?? 4000)
  // Bind loopback by default so the unauthenticated dev server is not exposed
  // on the LAN. Override with the `hostname` opt or the HOST env var.
  const hostname = opts?.hostname ?? process.env.HOST ?? '127.0.0.1'

  const db = createDb(dbPath)
  const resolvers = createResolvers(db)

  const yoga = createYoga({
    schema: createSchema({ typeDefs, resolvers }),
    graphqlEndpoint: '/graphql',
  })

  const server = Bun.serve({
    port,
    hostname,
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
    hostname: server.hostname,
    db,
    close() {
      server.stop()
      db.close()
    },
  }
}

if (import.meta.main) {
  const { port, hostname } = createServer()
  const host = hostname === '0.0.0.0' ? 'localhost' : hostname
  console.log(`Flowy local server running on http://${host}:${port}`)
  console.log(`  GraphQL: http://${host}:${port}/graphql`)
  console.log(`  Health:  http://${host}:${port}/health`)
}
