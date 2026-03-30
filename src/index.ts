#!/usr/bin/env bun
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'

const pkgPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'package.json',
)
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

import { approveCommand } from './commands/approve.ts'
import { billingCommand } from './commands/billing.ts'
import { clientCommand } from './commands/client.ts'
import { featureCommand } from './commands/feature.ts'
import { initCommand } from './commands/init.ts'
import { keyCommand } from './commands/key.ts'
import { projectCommand } from './commands/project.ts'
import { searchCommand } from './commands/search.ts'
import { setupCommand } from './commands/setup.ts'
import { statusCommand } from './commands/status.ts'
import { taskCommand } from './commands/task.ts'
import { treeCommand } from './commands/tree.ts'
import { whoamiCommand } from './commands/whoami.ts'

const program = new Command()
  .name('flowy')
  .description(pkg.description)
  .version(pkg.version)

program.addCommand(initCommand)
program.addCommand(setupCommand)
program.addCommand(clientCommand)
program.addCommand(projectCommand)
program.addCommand(featureCommand)
program.addCommand(taskCommand)
program.addCommand(statusCommand)
program.addCommand(approveCommand)
program.addCommand(billingCommand)
program.addCommand(keyCommand)
program.addCommand(searchCommand)
program.addCommand(treeCommand)
program.addCommand(whoamiCommand)

program.parse()
