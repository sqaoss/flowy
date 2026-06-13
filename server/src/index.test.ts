import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from './index.ts'

describe('createServer', () => {
  let instance: ReturnType<typeof createServer> | undefined

  afterEach(() => {
    instance?.close()
    instance = undefined
  })

  it('exports a createServer function', () => {
    expect(typeof createServer).toBe('function')
  })

  it('responds to /health with status ok', async () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    const res = await fetch(`http://localhost:${instance.port}/health`)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'ok' })
  })

  it('binds to 127.0.0.1 by default, not all interfaces', () => {
    instance = createServer({ dbPath: ':memory:', port: 0 })

    expect(instance.hostname).toBe('127.0.0.1')
    expect(instance.server.hostname).toBe('127.0.0.1')
  })

  it('allows the bind hostname to be overridden via opts', () => {
    instance = createServer({
      dbPath: ':memory:',
      port: 0,
      hostname: '0.0.0.0',
    })

    expect(instance.hostname).toBe('0.0.0.0')
  })

  it('allows the bind hostname to be overridden via HOST env', () => {
    const prev = process.env.HOST
    process.env.HOST = '0.0.0.0'
    try {
      instance = createServer({ dbPath: ':memory:', port: 0 })
      expect(instance.hostname).toBe('0.0.0.0')
    } finally {
      if (prev === undefined) delete process.env.HOST
      else process.env.HOST = prev
    }
  })
})
