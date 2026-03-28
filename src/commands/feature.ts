import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import {
  requireProject,
  resolveFeature,
  updateProjectConfig,
} from '../util/config.ts'
import { resolveDescription } from '../util/description.ts'
import { output, outputError } from '../util/format.ts'

export const featureCommand = new Command('feature').description(
  'Manage features in the active project',
)

featureCommand
  .command('create')
  .description('Create a feature in the active project')
  .requiredOption('--title <title>', 'Feature title')
  .requiredOption('--description <description>', 'Feature description')
  .action(async (opts) => {
    try {
      const project = requireProject()
      const description = await resolveDescription(opts.description)
      const nodeData = await graphql<{ createNode: { id: string } }>(
        `mutation CreateNode($type: String!, $title: String!, $description: String) {
          createNode(type: $type, title: $title, description: $description) {
            id type title description status createdAt updatedAt
          }
        }`,
        { type: 'feature', title: opts.title, description },
      )
      const featureId = nodeData.createNode.id
      await graphql(
        `mutation CreateEdge($sourceId: String!, $targetId: String!, $relation: String!) {
          createEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation) {
            sourceId targetId relation createdAt
          }
        }`,
        { sourceId: featureId, targetId: project.id, relation: 'part_of' },
      )
      output(nodeData.createNode)
    } catch (error) {
      outputError(error)
    }
  })

featureCommand
  .command('set')
  .description('Set the active feature')
  .argument('<name-or-id>', 'Feature name or ID')
  .action(async (nameOrId: string) => {
    try {
      const project = requireProject()
      const data = await graphql<{
        descendants: Array<{ id: string; type: string; title: string }>
      }>(
        `query Descendants($nodeId: String!, $relation: String, $maxDepth: Int) {
          descendants(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
            id type title status
          }
        }`,
        { nodeId: project.id, relation: 'part_of', maxDepth: 1 },
      )
      const features = data.descendants.filter((n) => n.type === 'feature')
      const match = features.find(
        (f) => f.id === nameOrId || f.title === nameOrId,
      )
      if (!match) {
        throw new Error(
          `Feature "${nameOrId}" not found in project "${project.name}".`,
        )
      }
      updateProjectConfig((p) => {
        p.activeFeature = match.id
      })
      output(match)
    } catch (error) {
      outputError(error)
    }
  })

featureCommand
  .command('unset')
  .description('Clear the active feature')
  .action(async () => {
    try {
      updateProjectConfig((p) => {
        delete p.activeFeature
      })
      output({ activeFeature: null })
    } catch (error) {
      outputError(error)
    }
  })

featureCommand
  .command('list')
  .description('List features in the active project')
  .action(async () => {
    try {
      const project = requireProject()
      const data = await graphql<{
        descendants: Array<{ id: string; type: string }>
      }>(
        `query Descendants($nodeId: String!, $relation: String, $maxDepth: Int) {
          descendants(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
            id type title description status createdAt updatedAt
          }
        }`,
        { nodeId: project.id, relation: 'part_of', maxDepth: 1 },
      )
      const features = data.descendants.filter((n) => n.type === 'feature')
      output(features)
    } catch (error) {
      outputError(error)
    }
  })

featureCommand
  .command('show')
  .description('Show feature details')
  .argument('[id]', 'Feature ID (defaults to active feature)')
  .action(async (id?: string) => {
    try {
      const featureId = id ?? resolveFeature()
      if (!featureId) {
        throw new Error(
          'No feature specified. Pass an ID or set an active feature.',
        )
      }
      const data = await graphql<{ node: unknown }>(
        `query GetNode($id: String!) {
          node(id: $id) {
            id type title description status metadata createdAt updatedAt
          }
        }`,
        { id: featureId },
      )
      output(data.node)
    } catch (error) {
      outputError(error)
    }
  })
