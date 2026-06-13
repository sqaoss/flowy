import { describe, expect, test } from 'vitest'
import { type Manifest, parseManifest, serializeManifest } from './manifest.ts'

const VALID: Manifest = {
  version: 1,
  nodes: [
    { key: 'proj', type: 'project', title: 'Demo' },
    { key: 'feat-1', type: 'feature', title: 'Auth', parent: 'proj' },
    {
      key: 'task-1',
      type: 'task',
      title: 'Login',
      parent: 'feat-1',
      status: 'draft',
      metadata: { priority: 'high' },
    },
    { key: 'task-2', type: 'task', title: 'Logout', parent: 'feat-1' },
  ],
  edges: [{ source: 'task-2', target: 'task-1', relation: 'blocks' }],
}

describe('parseManifest', () => {
  test('parses a well-formed JSON manifest', () => {
    const m = parseManifest(JSON.stringify(VALID))
    expect(m.version).toBe(1)
    expect(m.nodes).toHaveLength(4)
    expect(m.edges).toHaveLength(1)
    expect(m.nodes[0]).toMatchObject({ key: 'proj', type: 'project' })
  })

  test('defaults edges to an empty array when omitted', () => {
    const m = parseManifest(
      JSON.stringify({
        version: 1,
        nodes: [{ key: 'proj', type: 'project', title: 'Demo' }],
      }),
    )
    expect(m.edges).toEqual([])
  })

  test('throws on invalid JSON', () => {
    expect(() => parseManifest('{not json')).toThrow(/invalid json/i)
  })

  test('throws when nodes is missing', () => {
    expect(() => parseManifest(JSON.stringify({ version: 1 }))).toThrow(
      /nodes/i,
    )
  })

  test('throws when a node lacks a key', () => {
    expect(() =>
      parseManifest(
        JSON.stringify({
          version: 1,
          nodes: [{ type: 'project', title: 'Demo' }],
        }),
      ),
    ).toThrow(/key/i)
  })

  test('throws when a node lacks a type', () => {
    expect(() =>
      parseManifest(
        JSON.stringify({
          version: 1,
          nodes: [{ key: 'x', title: 'Demo' }],
        }),
      ),
    ).toThrow(/type/i)
  })

  test('throws on a duplicate client-key', () => {
    expect(() =>
      parseManifest(
        JSON.stringify({
          version: 1,
          nodes: [
            { key: 'dup', type: 'project', title: 'A' },
            { key: 'dup', type: 'feature', title: 'B' },
          ],
        }),
      ),
    ).toThrow(/duplicate/i)
  })

  test('throws when an edge references an unknown key', () => {
    expect(() =>
      parseManifest(
        JSON.stringify({
          version: 1,
          nodes: [{ key: 'a', type: 'project', title: 'A' }],
          edges: [{ source: 'a', target: 'ghost', relation: 'blocks' }],
        }),
      ),
    ).toThrow(/ghost/i)
  })
})

describe('serializeManifest', () => {
  test('round-trips through parse', () => {
    const text = serializeManifest(VALID)
    expect(parseManifest(text)).toEqual(VALID)
  })

  test('emits pretty-printed JSON', () => {
    const text = serializeManifest(VALID)
    expect(text).toContain('\n')
    expect(text.endsWith('\n')).toBe(true)
  })
})
