import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { loadConfig, requireProject, saveConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'

export const projectCommand = new Command('project').description(
  'Manage projects',
)

projectCommand
  .command('create')
  .description('Create a new project')
  .argument('<name>', 'Project name')
  .action(async (name: string) => {
    try {
      const data = await graphql<{ createNode: unknown }>(
        `mutation CreateProject($type: String!, $title: String!) {
          createNode(type: $type, title: $title) {
            id type title description status metadata createdAt updatedAt
          }
        }`,
        { type: 'project', title: name },
      )
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
      }>(
        `query ListProjects($type: String) {
          nodes(type: $type) {
            id title
          }
        }`,
        { type: 'project' },
      )
      const project = data.nodes.find((n) => n.title === name)
      if (!project) {
        throw new Error(`Project "${name}" not found`)
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
      const data = await graphql<{ nodes: unknown[] }>(
        `query ListProjects($type: String) {
          nodes(type: $type) {
            id type title description status createdAt updatedAt
          }
        }`,
        { type: 'project' },
      )
      output(data.nodes)
    } catch (error) {
      outputError(error)
    }
  })

export async function showProject(id?: string): Promise<void> {
  try {
    const projectId = id ?? requireProject().id
    const data = await graphql<{ node: unknown }>(
      `query GetProject($id: String!) {
        node(id: $id) {
          id type title description status metadata createdAt updatedAt
        }
      }`,
      { id: projectId },
    )
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
