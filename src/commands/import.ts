import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'
import {
  FLOWY_META_KEY,
  type FlowyMeta,
  type Manifest,
  type ManifestNode,
  parseManifest,
  readFlowyMeta,
} from '../util/manifest.ts'

const NODE_TYPES = ['project', 'feature', 'task'] as const

interface ServerNode {
  id: string
  type: string
  title: string
  metadata: string | null
}

interface ExistingNode {
  id: string
  /** Set of "<targetClientKey>|<relation>" edges already recorded on the node. */
  edgeKeys: Set<string>
}

function edgeKey(target: string, relation: string): string {
  return `${target}|${relation}`
}

/** Outgoing edges (by target client-key) for a node, from parent + explicit edges. */
function outgoingEdges(
  manifest: Manifest,
  node: ManifestNode,
): FlowyMeta['edges'] {
  const edges: FlowyMeta['edges'] = []
  if (node.parent) edges.push({ target: node.parent, relation: 'part_of' })
  for (const e of manifest.edges) {
    if (e.source === node.key) {
      edges.push({ target: e.target, relation: e.relation })
    }
  }
  return edges
}

/** Build the metadata JSON string written to the server for a node. */
function buildMetadata(node: ManifestNode, edges: FlowyMeta['edges']): string {
  const meta: Record<string, unknown> = { ...(node.metadata ?? {}) }
  meta[FLOWY_META_KEY] = { key: node.key, edges } satisfies FlowyMeta
  return JSON.stringify(meta)
}

/** Read every existing node, keyed by its stored client-key. */
async function loadExisting(): Promise<Map<string, ExistingNode>> {
  const byKey = new Map<string, ExistingNode>()
  for (const type of NODE_TYPES) {
    const data = await graphql<{ nodes: ServerNode[] }>(
      `query ImportExisting($type: String) {
        nodes(type: $type) { id type title metadata }
      }`,
      { type },
    )
    for (const node of data.nodes) {
      const flowy = readFlowyMeta(node.metadata)
      if (!flowy) continue
      byKey.set(flowy.key, {
        id: node.id,
        edgeKeys: new Set(
          flowy.edges.map((e) => edgeKey(e.target, e.relation)),
        ),
      })
    }
  }
  return byKey
}

const CREATE_NODE = `mutation ImportCreate($type: String!, $title: String!, $description: String, $status: String, $metadata: String) {
  createNode(type: $type, title: $title, description: $description, status: $status, metadata: $metadata) { id }
}`

const UPDATE_NODE = `mutation ImportUpdate($id: String!, $title: String, $description: String, $status: String, $metadata: String) {
  updateNode(id: $id, title: $title, description: $description, status: $status, metadata: $metadata) { id }
}`

const CREATE_EDGE = `mutation ImportEdge($sourceId: String!, $targetId: String!, $relation: String!) {
  createEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation) { sourceId targetId relation }
}`

export const importCommand = new Command('import')
  .description(
    'Ingest a manifest of projects/features/tasks + edges (idempotent by client-key)',
  )
  .argument('<manifest>', 'Path to a JSON manifest file')
  .action(async (manifestPath: string) => {
    try {
      const manifest = parseManifest(readFileSync(manifestPath, 'utf-8'))
      const existing = await loadExisting()

      // Pass 1 — upsert every node, writing its client-key and outgoing edges
      // into metadata in a single call. New keys create, known keys update,
      // so a re-import never duplicates.
      const idByKey = new Map<string, string>()
      const edgesByKey = new Map<string, FlowyMeta['edges']>()
      for (const node of manifest.nodes) {
        const edges = outgoingEdges(manifest, node)
        edgesByKey.set(node.key, edges)
        const metadata = buildMetadata(node, edges)
        const found = existing.get(node.key)
        if (found) {
          await graphql<{ updateNode: { id: string } }>(UPDATE_NODE, {
            id: found.id,
            title: node.title,
            description: node.description ?? null,
            status: node.status ?? null,
            metadata,
          })
          idByKey.set(node.key, found.id)
        } else {
          const data = await graphql<{ createNode: { id: string } }>(
            CREATE_NODE,
            {
              type: node.type,
              title: node.title,
              description: node.description ?? null,
              status: node.status ?? null,
              metadata,
            },
          )
          idByKey.set(node.key, data.createNode.id)
        }
      }

      // Pass 2 — materialize edges. Dedupe client-side by (source,target,relation):
      // skip any edge already recorded on an existing node so createEdge (which
      // is not idempotent server-side) is never asked to re-link.
      const created = new Set<string>()
      let edgeCount = 0
      for (const [sourceKey, edges] of edgesByKey) {
        const sourceId = idByKey.get(sourceKey)
        if (!sourceId) continue
        const already = existing.get(sourceKey)?.edgeKeys
        for (const edge of edges) {
          const k = `${sourceKey}|${edge.target}|${edge.relation}`
          if (created.has(k)) continue
          created.add(k)
          if (already?.has(edgeKey(edge.target, edge.relation))) continue
          const targetId = idByKey.get(edge.target)
          if (!targetId) continue
          await graphql(CREATE_EDGE, {
            sourceId,
            targetId,
            relation: edge.relation,
          })
          edgeCount++
        }
      }

      output({
        imported: idByKey.size,
        edges: edgeCount,
        map: Object.fromEntries(idByKey),
      })
    } catch (error) {
      outputError(error)
    }
  })
