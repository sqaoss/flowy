import { spawnSync } from 'node:child_process'
import { basename } from 'node:path'
import { Command } from 'commander'
import { graphql } from '../util/client.ts'
import { loadConfig, saveConfig } from '../util/config.ts'
import { output, outputError } from '../util/format.ts'

export const initCommand = new Command('init')
  .description('Initialize Flowy for the current git repository')
  .action(async () => {
    try {
      const toplevel = spawnSync('git', ['rev-parse', '--show-toplevel'])
      if (toplevel.status !== 0) {
        throw new Error(
          'Not a git repository. Run flowy init from inside a git project.',
        )
      }

      let repoName: string
      const remote = spawnSync('git', ['remote', 'get-url', 'origin'])
      if (remote.status === 0) {
        const url = String(remote.stdout).trim()
        repoName =
          url
            .split('/')
            .pop()
            ?.replace(/\.git$/, '') ?? ''
      } else {
        repoName = basename(String(toplevel.stdout).trim())
      }

      const data = await graphql<{ createNode: { id: string; title: string } }>(
        `mutation CreateProject($type: String!, $title: String!) {
          createNode(type: $type, title: $title) {
            id type title description status metadata createdAt updatedAt
          }
        }`,
        { type: 'project', title: repoName },
      )

      const { id, title } = data.createNode
      const config = loadConfig()
      const cwd = process.cwd()
      config.projects[cwd] = { id, name: title }
      saveConfig(config)
      output({ id, name: title, directory: cwd })
    } catch (error) {
      outputError(error)
    }
  })
