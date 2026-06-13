import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { output, outputError } from '../util/format.ts'
import {
  buildNodeMetadata,
  type Manifest,
  type ManifestNode,
  parseManifest,
  readClientKey,
} from '../util/manifest.ts'

const NODE_TYPES = ['project', 'feature', 'task'] as const

/** Relations import materializes; existing-edge dedup queries each of these. */
const RELATIONS = ['part_of', 'blocks'] as const

interface ServerNode {
  id: string
  type: string
  title: string
  metadata: string | null
}

interface DesiredEdge {
  sourceKey: string
  targetKey: string
  relation: string
}

function edgeKey(source: string, target: string, relation: string): string {
  return `${source}|${target}|${relation}`
}

/** All edges the manifest implies: implicit `part_of` from `parent` + explicit edges. */
function desiredEdges(manifest: Manifest): DesiredEdge[] {
  const edges: DesiredEdge[] = []
  const seen = new Set<string>()
  const add = (sourceKey: string, targetKey: string, relation: string) => {
    const k = edgeKey(sourceKey, targetKey, relation)
    if (seen.has(k)) return
    seen.add(k)
    edges.push({ sourceKey, targetKey, relation })
  }
  for (const node of manifest.nodes) {
    if (node.parent) add(node.key, node.parent, 'part_of')
  }
  for (const e of manifest.edges) add(e.source, e.target, e.relation)
  return edges
}

/** Read every existing node, mapping its stored client-key to its server id. */
async function loadExisting(): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>()
  for (const type of NODE_TYPES) {
    const data = await graphql<{ nodes: ServerNode[] }>(
      `query ImportExisting($type: String) {
        nodes(type: $type) { id type title metadata }
      }`,
      { type },
    )
    for (const node of data.nodes) {
      const key = readClientKey(node.metadata)
      if (key) idByKey.set(key, node.id)
    }
  }
  return idByKey
}

/**
 * Collect the edges that already exist for the given nodes, as a set of
 * `<sourceId>|<targetId>|<relation>` triples. Read back through the real edge
 * model (`Query.edges`), so externally-created edges (e.g. `task block`) are
 * recognized and never duplicated.
 */
async function loadExistingEdges(nodeIds: string[]): Promise<Set<string>> {
  const existing = new Set<string>()
  for (const nodeId of nodeIds) {
    for (const relation of RELATIONS) {
      const data = await graphql<{ edges: Array<{ id: string }> }>(
        `query ImportEdges($nodeId: String!, $relation: String!) {
          edges(nodeId: $nodeId, relation: $relation, direction: "outgoing") { id }
        }`,
        { nodeId, relation },
      )
      for (const target of data.edges) {
        existing.add(edgeKey(nodeId, target.id, relation))
      }
    }
  }
  return existing
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

async function upsertNode(
  node: ManifestNode,
  existingId: string | undefined,
): Promise<string> {
  const metadata = buildNodeMetadata(node.key, node.metadata)
  if (existingId) {
    await graphql<{ updateNode: { id: string } }>(UPDATE_NODE, {
      id: existingId,
      title: node.title,
      description: node.description ?? null,
      status: node.status ?? null,
      metadata,
    })
    return existingId
  }
  const data = await graphql<{ createNode: { id: string } }>(CREATE_NODE, {
    type: node.type,
    title: node.title,
    description: node.description ?? null,
    status: node.status ?? null,
    metadata,
  })
  return data.createNode.id
}

export const importCommand = new Command('import')
  .description(
    'Ingest a manifest of projects/features/tasks + edges (idempotent by client-key)',
  )
  .argument('<manifest>', 'Path to a JSON manifest file')
  .action(async (manifestPath: string) => {
    try {
      const manifest = parseManifest(readFileSync(manifestPath, 'utf-8'))
      const existing = await loadExisting()

      // Pass 1 — upsert every node, stamping its client-key into metadata.
      // Known keys update, new keys create, so a re-import never duplicates.
      const idByKey = new Map<string, string>()
      for (const node of manifest.nodes) {
        idByKey.set(node.key, await upsertNode(node, existing.get(node.key)))
      }

      // Dedup against edges that already exist server-side. Only nodes that
      // pre-existed this import can already have edges, so query just those.
      const preExistingIds = manifest.nodes
        .filter((n) => existing.has(n.key))
        .map((n) => idByKey.get(n.key))
        .filter((id): id is string => id != null)
      const present = await loadExistingEdges(preExistingIds)

      // Pass 2 — materialize edges, deduped by (source,target,relation). Skip
      // any edge that already exists so the non-idempotent createEdge is never
      // asked to re-link.
      let edgeCount = 0
      for (const edge of desiredEdges(manifest)) {
        const sourceId = idByKey.get(edge.sourceKey)
        const targetId = idByKey.get(edge.targetKey)
        if (!sourceId || !targetId) continue
        if (present.has(edgeKey(sourceId, targetId, edge.relation))) continue
        await graphql(CREATE_EDGE, {
          sourceId,
          targetId,
          relation: edge.relation,
        })
        edgeCount++
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
