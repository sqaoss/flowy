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
  readFlowyMeta,
  serializeManifest,
  stripFlowyMeta,
} from '../util/manifest.ts'

interface ServerNode {
  id: string
  type: string
  title: string
  description: string | null
  status: string
  metadata: string | null
}

const PROJECT_QUERY = `query ExportProject($id: String!) {
  node(id: $id) { id type title description status metadata }
}`

const DESCENDANTS_QUERY = `query ExportDescendants($nodeId: String!, $relation: String, $maxDepth: Int) {
  descendants(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
    id type title description status metadata
  }
}`

export const exportCommand = new Command('export')
  .description(
    'Dump the active project (nodes + edges, with client-keys) as a manifest',
  )
  .argument('[output]', 'Write to this file instead of stdout')
  .action(async (outputPath: string | undefined) => {
    try {
      const project = requireProject()
      const root = await graphql<{ node: ServerNode | null }>(PROJECT_QUERY, {
        id: project.id,
      })
      if (!root.node) {
        throw new Error(`Active project ${project.id} not found.`)
      }
      const descendants = await graphql<{ descendants: ServerNode[] }>(
        DESCENDANTS_QUERY,
        { nodeId: project.id, relation: 'part_of', maxDepth: 100 },
      )

      const serverNodes = [root.node, ...descendants.descendants]

      const nodes: ManifestNode[] = []
      const edges: ManifestEdge[] = []
      for (const sn of serverNodes) {
        const flowy = readFlowyMeta(sn.metadata)
        // Without a recorded client-key a node cannot round-trip; fall back to
        // its server id so an un-stamped node is still exported deterministically.
        const key = flowy?.key ?? sn.id

        const node: ManifestNode = { key, type: sn.type, title: sn.title }
        if (sn.description != null) node.description = sn.description
        if (sn.status != null) node.status = sn.status
        const userMeta = stripFlowyMeta(sn.metadata)
        if (userMeta) node.metadata = userMeta

        for (const edge of flowy?.edges ?? []) {
          // part_of is surfaced as the node's `parent` (so import re-derives it)
          // and is also emitted in the edge list for a complete dependency graph.
          if (edge.relation === 'part_of') node.parent = edge.target
          edges.push({
            source: key,
            target: edge.target,
            relation: edge.relation,
          })
        }
        nodes.push(node)
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
