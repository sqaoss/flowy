import { writeFileSync } from 'node:fs'
import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { requireProject } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'
import {
  MANIFEST_VERSION,
  type Manifest,
  type ManifestEdge,
  type ManifestNode,
  readClientKey,
  serializeManifest,
  stripClientKey,
} from '../util/manifest.ts'
import {
  EXPORT_DESCENDANTS,
  EXPORT_EDGES,
  EXPORT_PROJECT,
} from '../util/operations.ts'

/** Relations export captures from the real edge model. */
const RELATIONS = ['part_of', 'blocks'] as const

interface ServerNode {
  id: string
  type: string
  title: string
  description: string | null
  status: string
  metadata: string | null
}

export const exportCommand = new Command('export')
  .description(
    'Dump the active project (nodes + edges, with client-keys) as a manifest',
  )
  .argument('[output]', 'Write to this file instead of stdout')
  .action(async (outputPath: string | undefined) => {
    try {
      const project = requireProject()
      const root = await graphql<{ node: ServerNode | null }>(EXPORT_PROJECT, {
        id: project.id,
      })
      if (!root.node) {
        throw new Error(`Active project ${project.id} not found.`)
      }
      const descendants = await graphql<{ descendants: ServerNode[] }>(
        EXPORT_DESCENDANTS,
        { nodeId: project.id, relation: 'part_of', maxDepth: 100 },
      )

      const serverNodes = [root.node, ...descendants.descendants]

      // Map server id -> client-key so edges (which the server returns by id)
      // can be expressed in the manifest's client-key space. A node without a
      // recorded key falls back to its server id so it still round-trips.
      const keyOf = (id: string, metadata: string | null) =>
        readClientKey(metadata) ?? id
      const keyById = new Map<string, string>()
      for (const sn of serverNodes)
        keyById.set(sn.id, keyOf(sn.id, sn.metadata))

      const nodes: ManifestNode[] = serverNodes.map((sn) => {
        const node: ManifestNode = {
          key: keyById.get(sn.id) ?? sn.id,
          type: sn.type,
          title: sn.title,
        }
        if (sn.description != null) node.description = sn.description
        if (sn.status != null) node.status = sn.status
        const userMeta = stripClientKey(sn.metadata)
        if (userMeta) node.metadata = userMeta
        return node
      })

      // Read edges back through the real edge model, so we capture ALL edges,
      // including ones created outside import (e.g. `task block`), not just
      // those import created.
      const edges: ManifestEdge[] = []
      const seen = new Set<string>()
      for (const sn of serverNodes) {
        const sourceKey = keyById.get(sn.id) ?? sn.id
        for (const relation of RELATIONS) {
          const data = await graphql<{
            edges: Array<{ id: string; metadata: string | null }>
          }>(EXPORT_EDGES, { nodeId: sn.id, relation })
          for (const target of data.edges) {
            const targetKey =
              keyById.get(target.id) ?? keyOf(target.id, target.metadata)
            const k = `${sourceKey}|${targetKey}|${relation}`
            if (seen.has(k)) continue
            seen.add(k)
            // part_of is surfaced as the node's `parent` so import re-derives it,
            // and is also kept in the edge list for a complete dependency graph.
            if (relation === 'part_of') {
              const node = nodes.find((n) => n.key === sourceKey)
              if (node) node.parent = targetKey
            }
            edges.push({ source: sourceKey, target: targetKey, relation })
          }
        }
      }

      const manifest: Manifest = { version: MANIFEST_VERSION, nodes, edges }

      if (outputPath) {
        writeFileSync(outputPath, serializeManifest(manifest))
        output({
          exported: nodes.length,
          edges: edges.length,
          file: outputPath,
        })
      } else {
        output(manifest)
      }
    } catch (error) {
      outputError(error)
    }
  })
