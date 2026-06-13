import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { loadConfig, requireProject, saveConfig } from '../util/config.ts'
import { resolveDescription } from '../util/description.ts'
import { output, outputError } from '../util/format.ts'
import {
  CREATE_PROJECT,
  DELETE_NODE,
  GET_PROJECT,
  LIST_PROJECTS,
  LIST_PROJECTS_FOR_SET,
  UPDATE_NODE,
} from '../util/operations.ts'

export const projectCommand = new Command('project').description(
  'Manage projects',
)

projectCommand
  .command('create')
  .description('Create a new project')
  .argument('<name>', 'Project name')
  .action(async (name: string) => {
    try {
      const data = await graphql<{ createNode: unknown }>(CREATE_PROJECT, {
        type: 'project',
        title: name,
      })
      output(data.createNode)
    } catch (error) {
      outputError(error)
    }
  })

export async function setProject(id: string, name: string): Promise<void> {
  const config = loadConfig()
  const cwd = process.cwd()
  config.projects[cwd] = { id, name }
  saveConfig(config)
  output({ id, name, directory: cwd })
}

projectCommand
  .command('set')
  .description('Map current directory to a project')
  .argument('<name>', 'Project name')
  .action(async (name: string) => {
    try {
      const data = await graphql<{
        nodes: Array<{ id: string; title: string }>
      }>(LIST_PROJECTS_FOR_SET, { type: 'project' })
      const project = data.nodes.find((n) => n.title === name)
      if (!project) {
        throw new Error(`Project "${name}" not found.`)
      }
      await setProject(project.id, project.title)
    } catch (error) {
      outputError(error)
    }
  })

projectCommand
  .command('list')
  .description('List all projects')
  .action(async () => {
    try {
      const data = await graphql<{ nodes: unknown[] }>(LIST_PROJECTS, {
        type: 'project',
      })
      output(data.nodes)
    } catch (error) {
      outputError(error)
    }
  })

export async function showProject(id?: string): Promise<void> {
  try {
    const projectId = id ?? requireProject().id
    const data = await graphql<{ node: unknown }>(GET_PROJECT, {
      id: projectId,
    })
    output(data.node)
  } catch (error) {
    outputError(error)
  }
}

projectCommand
  .command('show')
  .description('Show project details')
  .argument('[id]', 'Project ID (defaults to active project)')
  .action(async (id?: string) => showProject(id))

projectCommand
  .command('update')
  .description('Update a project')
  .argument('[id]', 'Project ID (defaults to active project)')
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
      const projectId = id ?? requireProject().id
      const variables: Record<string, unknown> = { id: projectId }
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

projectCommand
  .command('delete')
  .description('Delete a project')
  .argument('[id]', 'Project ID (defaults to active project)')
  .action(async (id?: string) => {
    try {
      const projectId = id ?? requireProject().id
      const data = await graphql<{ deleteNode: boolean }>(DELETE_NODE, {
        id: projectId,
      })
      output({ deleted: data.deleteNode })
    } catch (error) {
      outputError(error)
    }
  })
