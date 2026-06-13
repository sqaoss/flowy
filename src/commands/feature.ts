import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import {
  requireProject,
  resolveFeature,
  updateProjectConfig,
} from '../util/config.ts'
import { resolveDescription } from '../util/description.ts'
import { output, outputError } from '../util/format.ts'
import {
  CREATE_EDGE,
  CREATE_NODE,
  DELETE_NODE,
  DESCENDANTS,
  DESCENDANTS_BRIEF,
  GET_NODE,
  UPDATE_NODE,
} from '../util/operations.ts'

export const featureCommand = new Command('feature').description(
  'Manage features in the active project',
)

featureCommand
  .command('create')
  .description('Create a feature in the active project')
  .requiredOption('--title <title>', 'Feature title')
  .option(
    '--description <text>',
    'Feature description, used verbatim (never read as a file path)',
  )
  .option(
    '--description-file <path>',
    'Read the feature description from a file, or "-" for stdin',
  )
  .action(async (opts) => {
    try {
      const project = requireProject()
      const description = await resolveDescription({
        description: opts.description,
        descriptionFile: opts.descriptionFile,
      })
      const nodeData = await graphql<{ createNode: { id: string } }>(
        CREATE_NODE,
        { type: 'feature', title: opts.title, description },
      )
      const featureId = nodeData.createNode.id
      await graphql(CREATE_EDGE, {
        sourceId: featureId,
        targetId: project.id,
        relation: 'part_of',
      })
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
      }>(DESCENDANTS_BRIEF, {
        nodeId: project.id,
        relation: 'part_of',
        maxDepth: 1,
      })
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
      }>(DESCENDANTS, { nodeId: project.id, relation: 'part_of', maxDepth: 1 })
      const features = data.descendants.filter((n) => n.type === 'feature')
      output(features)
    } catch (error) {
      outputError(error)
    }
  })

featureCommand
  .command('update')
  .description('Update a feature')
  .argument('[id]', 'Feature ID (defaults to active feature)')
  .option('--title <title>', 'New title')
  .option(
    '--description <text>',
    'New description, used verbatim (never read as a file path)',
  )
  .option(
    '--description-file <path>',
    'Read the new description from a file, or "-" for stdin',
  )
  .option('--metadata <json>', 'New metadata as a JSON string')
  .action(async (id: string | undefined, opts) => {
    try {
      const featureId = id ?? resolveFeature()
      if (!featureId) {
        throw new Error(
          'No feature specified. Pass an ID or set an active feature.',
        )
      }
      const variables: Record<string, unknown> = { id: featureId }
      if (opts.title != null) variables.title = opts.title
      if (opts.description != null || opts.descriptionFile != null) {
        variables.description = await resolveDescription({
          description: opts.description,
          descriptionFile: opts.descriptionFile,
        })
      }
      if (opts.metadata != null) variables.metadata = opts.metadata
      const data = await graphql<{ updateNode: unknown }>(
        UPDATE_NODE,
        variables,
      )
      output(data.updateNode)
    } catch (error) {
      outputError(error)
    }
  })

featureCommand
  .command('delete')
  .description('Delete a feature')
  .argument('[id]', 'Feature ID (defaults to active feature)')
  .action(async (id?: string) => {
    try {
      const featureId = id ?? resolveFeature()
      if (!featureId) {
        throw new Error(
          'No feature specified. Pass an ID or set an active feature.',
        )
      }
      const data = await graphql<{ deleteNode: boolean }>(DELETE_NODE, {
        id: featureId,
      })
      output({ deleted: data.deleteNode })
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
      const data = await graphql<{ node: unknown }>(GET_NODE, {
        id: featureId,
      })
      output(data.node)
    } catch (error) {
      outputError(error)
    }
  })
