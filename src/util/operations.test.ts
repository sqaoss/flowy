import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  LOCAL_CONTRACT_OPERATIONS,
  SAAS_ONLY_OPERATIONS,
} from './operations.ts'

/**
 * Root-suite half of the CLI/local-server contract guard (P1-1).
 *
 * The executable half lives in `server/src/contract.test.ts` (runs the ops
 * against a live local server). This half runs under the root `bun run test`
 * and guards the *single source of truth*: every command must send a canonical
 * operation from `operations.ts`, and the two op-sets must stay disjoint and
 * well-formed. If a command re-inlines a query string (bypassing the contract),
 * this fails.
 */

const allOps = {
  ...LOCAL_CONTRACT_OPERATIONS,
  ...SAAS_ONLY_OPERATIONS,
} as Record<string, string>

describe('operations module', () => {
  it('every operation is a non-empty named query or mutation', () => {
    for (const [name, op] of Object.entries(allOps)) {
      expect(op.trim().length, name).toBeGreaterThan(0)
      expect(op, name).toMatch(/^\s*(query|mutation)\s/)
    }
  })

  it('local and SaaS-only operation sets are disjoint', () => {
    const local = new Set(Object.keys(LOCAL_CONTRACT_OPERATIONS))
    const saas = Object.keys(SAAS_ONLY_OPERATIONS)
    for (const name of saas) expect(local.has(name), name).toBe(false)
  })

  it('SaaS-only set is exactly the documented divergences', () => {
    // These are deliberately NOT served by the bundled local server.
    expect(new Set(Object.keys(SAAS_ONLY_OPERATIONS))).toEqual(
      new Set(['REGISTER', 'WHOAMI', 'ROTATE_API_KEY', 'CREATE_CHECKOUT']),
    )
  })
})

describe('commands send canonical operations (no re-inlined queries)', () => {
  // command file -> the operation constants it must import from operations.ts
  const expectations: Record<string, string[]> = {
    'project.ts': [
      'CREATE_PROJECT',
      'LIST_PROJECTS_FOR_SET',
      'LIST_PROJECTS',
      'GET_PROJECT',
      'UPDATE_NODE',
      'DELETE_NODE',
    ],
    'feature.ts': [
      'CREATE_NODE',
      'CREATE_EDGE',
      'DESCENDANTS',
      'DESCENDANTS_BRIEF',
      'UPDATE_NODE',
      'DELETE_NODE',
      'GET_NODE',
    ],
    'task.ts': [
      'CREATE_TASK',
      'LINK_TASK',
      'READY_TASKS',
      'ALL_TASKS',
      'LIST_TASKS',
      'SHOW_TASK',
      'UPDATE_NODE',
      'DELETE_NODE',
      'BLOCK_TASK',
      'UNBLOCK_TASK',
      'TASK_DEPS',
    ],
    'status.ts': ['UPDATE_STATUS'],
    'approve.ts': ['APPROVE_NODE'],
    'search.ts': ['SEARCH'],
    'tree.ts': ['SUBTREE'],
    'whoami.ts': ['WHOAMI'],
    'billing.ts': ['CREATE_CHECKOUT'],
    'key.ts': ['ROTATE_API_KEY'],
    'init.ts': ['CREATE_PROJECT'],
    'setup.ts': ['REGISTER'],
    'import.ts': [
      'IMPORT_EXISTING',
      'IMPORT_EDGES',
      'IMPORT_CREATE',
      'IMPORT_UPDATE',
      'IMPORT_EDGE',
    ],
    'export.ts': ['EXPORT_PROJECT', 'EXPORT_DESCENDANTS', 'EXPORT_EDGES'],
  }

  for (const [file, ops] of Object.entries(expectations)) {
    it(`${file} imports its operations from operations.ts`, () => {
      const path = fileURLToPath(
        new URL(`../commands/${file}`, import.meta.url),
      )
      const source = readFileSync(path, 'utf-8')
      expect(source).toContain("from '../util/operations.ts'")
      for (const op of ops) expect(source, `${file} -> ${op}`).toContain(op)
      // A command file must not inline GraphQL operation text anymore: the
      // backtick-wrapped query/mutation lives only in operations.ts.
      expect(source, `${file} re-inlines a GraphQL operation`).not.toMatch(
        /`\s*(query|mutation)\s/,
      )
    })
  }
})
