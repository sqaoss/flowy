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
})
