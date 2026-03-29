#!/usr/bin/env bun
import { Command } from 'commander'
import { approveCommand } from './commands/approve.ts'
import { clientCommand } from './commands/client.ts'
import { featureCommand } from './commands/feature.ts'
import { initCommand } from './commands/init.ts'
import { projectCommand } from './commands/project.ts'
import { searchCommand } from './commands/search.ts'
import { setupCommand } from './commands/setup.ts'
import { statusCommand } from './commands/status.ts'
import { taskCommand } from './commands/task.ts'
import { treeCommand } from './commands/tree.ts'
import { whoamiCommand } from './commands/whoami.ts'

const program = new Command()
  .name('flowy')
  .description('Project management for AI coding agents')
  .version('0.2.0')

program.addCommand(initCommand)
program.addCommand(setupCommand)
program.addCommand(clientCommand)
program.addCommand(projectCommand)
program.addCommand(featureCommand)
program.addCommand(taskCommand)
program.addCommand(statusCommand)
program.addCommand(approveCommand)
program.addCommand(searchCommand)
program.addCommand(treeCommand)
program.addCommand(whoamiCommand)

program.parse()
