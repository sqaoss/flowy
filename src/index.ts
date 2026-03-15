#!/usr/bin/env bun
import { Command } from 'commander'
import { approveCommand } from './commands/approve.ts'
import { edgeCommand } from './commands/edge.ts'
import { nodeCommand } from './commands/node.ts'
import { registerCommand } from './commands/register.ts'
import { searchCommand } from './commands/search.ts'
import { statusCommand } from './commands/status.ts'
import { treeCommand } from './commands/tree.ts'
import { whoamiCommand } from './commands/whoami.ts'

const program = new Command()
  .name('flowy')
  .description('Project management for AI coding agents')
  .version('0.1.0')

program.addCommand(approveCommand)
program.addCommand(registerCommand)
program.addCommand(nodeCommand)
program.addCommand(edgeCommand)
program.addCommand(searchCommand)
program.addCommand(statusCommand)
program.addCommand(treeCommand)
program.addCommand(whoamiCommand)

program.parse()
