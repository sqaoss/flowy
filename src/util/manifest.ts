/**
 * Flowy import/export manifest format.
 *
 * The manifest is the migration unit for a backlog: projects, features and
 * tasks (`nodes`) plus their dependency `edges`, all addressed by a stable
 * **client-key** rather than a server id. Import upserts by client-key
 * (idempotent); export reconstructs the same shape from the server. Keeping
 * all format knowledge in this one module means the on-disk format (JSON
 * today — see roadmap §G, an open owner decision) can change without touching
 * the import/export command logic.
 *
 * Edges live in the real edge model (`createEdge` / `Query.edges`), not in
 * node metadata. The only thing import stamps into metadata is the node's
 * client-key (for idempotent node upsert); export reads edges back via
 * `Query.edges`, so it captures edges created by any path (e.g. `task block`).
 */

export interface ManifestNode {
  /** Stable client-key — the idempotency anchor. */
  key: string
  /** One of: project, feature, task. */
  type: string
  title: string
  description?: string
  status?: string
  /** Client-key of the parent node; drives the implicit `part_of` edge. */
  parent?: string
  /** Arbitrary user metadata (the reserved `__flowyKey` field is stripped). */
  metadata?: Record<string, unknown>
}

export interface ManifestEdge {
  /** Client-key of the source node. */
  source: string
  /** Client-key of the target node. */
  target: string
  relation: string
}

export interface Manifest {
  version: number
  nodes: ManifestNode[]
  edges: ManifestEdge[]
}

/** The current manifest schema version. */
export const MANIFEST_VERSION = 1

/**
 * Reserved metadata field holding a node's client-key — the only thing import
 * writes into metadata, purely so a re-import can find the node by its stable
 * key and update in place rather than duplicating. User metadata lives
 * alongside it at the top level and is preserved untouched; export strips this
 * one field back out. Edges are NOT stored here (see the module header).
 */
export const FLOWY_KEY_FIELD = '__flowyKey'

/** Read the reserved client-key field from a server node's metadata string. */
export function readClientKey(
  metadata: string | null | undefined,
): string | null {
  if (!metadata) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(metadata)
  } catch {
    return null
  }
  if (!isObject(parsed)) return null
  const key = parsed[FLOWY_KEY_FIELD]
  return typeof key === 'string' ? key : null
}

/** Strip the reserved client-key field, returning only user metadata (or undefined). */
export function stripClientKey(
  metadata: string | null | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(metadata)
  } catch {
    return undefined
  }
  if (!isObject(parsed)) return undefined
  const { [FLOWY_KEY_FIELD]: _key, ...rest } = parsed
  return Object.keys(rest).length > 0 ? rest : undefined
}

/** Build the metadata JSON string for a node: user metadata plus the client-key. */
export function buildNodeMetadata(
  key: string,
  userMetadata?: Record<string, unknown>,
): string {
  return JSON.stringify({ ...(userMetadata ?? {}), [FLOWY_KEY_FIELD]: key })
}

function fail(message: string): never {
  throw new Error(message)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Parse and validate a manifest from its serialized form. */
export function parseManifest(text: string): Manifest {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    fail('Invalid JSON: manifest is not valid JSON.')
  }

  if (!isObject(raw)) fail('Invalid manifest: expected a JSON object.')
  if (!Array.isArray(raw.nodes)) {
    fail('Invalid manifest: "nodes" must be an array.')
  }

  const seen = new Set<string>()
  const nodes: ManifestNode[] = raw.nodes.map((entry, i) => {
    if (!isObject(entry))
      fail(`Invalid manifest: nodes[${i}] is not an object.`)
    if (typeof entry.key !== 'string' || entry.key.length === 0) {
      fail(`Invalid manifest: nodes[${i}] is missing a string "key".`)
    }
    if (typeof entry.type !== 'string' || entry.type.length === 0) {
      fail(`Invalid manifest: node "${entry.key}" is missing a "type".`)
    }
    if (typeof entry.title !== 'string') {
      fail(`Invalid manifest: node "${entry.key}" is missing a "title".`)
    }
    if (seen.has(entry.key)) {
      fail(`Invalid manifest: duplicate client-key "${entry.key}".`)
    }
    seen.add(entry.key)
    if (entry.parent != null && typeof entry.parent !== 'string') {
      fail(`Invalid manifest: node "${entry.key}" has a non-string "parent".`)
    }
    if (entry.metadata != null && !isObject(entry.metadata)) {
      fail(`Invalid manifest: node "${entry.key}" has non-object "metadata".`)
    }
    const node: ManifestNode = {
      key: entry.key,
      type: entry.type,
      title: entry.title,
    }
    if (typeof entry.description === 'string')
      node.description = entry.description
    if (typeof entry.status === 'string') node.status = entry.status
    if (typeof entry.parent === 'string') node.parent = entry.parent
    if (isObject(entry.metadata)) node.metadata = entry.metadata
    return node
  })

  for (const node of nodes) {
    if (node.parent != null && !seen.has(node.parent)) {
      fail(
        `Invalid manifest: node "${node.key}" references unknown parent "${node.parent}".`,
      )
    }
  }

  const rawEdges = Array.isArray(raw.edges) ? raw.edges : []
  const edges: ManifestEdge[] = rawEdges.map((entry, i) => {
    if (!isObject(entry))
      fail(`Invalid manifest: edges[${i}] is not an object.`)
    const { source, target, relation } = entry
    if (typeof source !== 'string' || typeof target !== 'string') {
      fail(`Invalid manifest: edges[${i}] needs string "source" and "target".`)
    }
    if (typeof relation !== 'string' || relation.length === 0) {
      fail(`Invalid manifest: edges[${i}] is missing a "relation".`)
    }
    if (!seen.has(source)) {
      fail(`Invalid manifest: edge source "${source}" is not a known node key.`)
    }
    if (!seen.has(target)) {
      fail(`Invalid manifest: edge target "${target}" is not a known node key.`)
    }
    return { source, target, relation }
  })

  const version =
    typeof raw.version === 'number' ? raw.version : MANIFEST_VERSION
  return { version, nodes, edges }
}

/** Serialize a manifest to its on-disk form (pretty-printed JSON, trailing newline). */
export function serializeManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}
