# Flowy

Agentic persistent planning

[![npm](https://img.shields.io/npm/v/@sqaoss/flowy)](https://www.npmjs.com/package/@sqaoss/flowy)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/sqaoss/flowy/actions/workflows/ci.yml/badge.svg)](https://github.com/sqaoss/flowy/actions/workflows/ci.yml)

Jira, Linear, Trello are built for humans clicking boards. AI agents don't click boards. When your agent needs to plan work, track progress, and close tickets, those tools add friction, load context, and get in the way.

Flowy is where agents store plans and flow through execution. Features are master plans. Tasks are execution steps. Everything persists in a database, not as files cluttering your git history. Your agent flows through work without friction.

You get full observability on what every agent planned, built, and shipped.

## Get Started

### Install (once)

```bash
npm i -g @sqaoss/flowy
flowy setup remote --email you@example.com
```

### Initialize a project

```bash
cd my-project
flowy init           # auto-detects repo, creates project
```

### Start planning

```bash
flowy feature create --title "User Auth" --description auth-spec.md
flowy feature set "User Auth"

flowy task create --title "Implement OAuth" --description oauth.md
flowy task create --title "Write tests" --description "Unit + integration"

flowy status <task-id> in_progress
flowy status <task-id> done
```

Every command outputs JSON. Your agent reads it, acts on it, moves to the next task.

## Agent Skill

Flowy installs an agent skill during setup. Your AI agent automatically knows every command. No manual configuration needed.

Or install the skill manually: `npx skills add sqaoss/flowy`

See [skills/using-flowy/SKILL.md](skills/using-flowy/SKILL.md) for the full skill reference.

## Data Model

```
project -> feature -> task
  1:many     1:many
```

Every task belongs to a feature. Every feature belongs to a project. No orphans.

### Status Flow

```
draft -> pending_review -> approved -> in_progress -> done
```

Also: `blocked`, `cancelled`. Only `pending_review` entities can be approved.

## Self-Hosted

Run Flowy on your own machine with SQLite and Docker. Same CLI, same commands.

```bash
flowy setup local    # starts a local server via Docker
flowy init           # auto-detects repo
```

## Command Reference

| Command | Description |
|---------|-------------|
| `setup remote --email <email>` | Register and connect to the hosted server |
| `setup local` | Start a local Docker server and configure the CLI |
| `init` | Auto-detect repo and create/map project |
| `whoami` | Show current user |
| `client set name <name>` | Set client display name |
| `project create <name>` | Create project |
| `project set <name>` | Map current directory to project |
| `project list` | List all projects |
| `project show [<id>]` | Show project details |
| `feature create --title <t> --description <d>` | Create feature (requires active project) |
| `feature set <name-or-id>` | Set active feature |
| `feature unset` | Clear active feature |
| `feature list` | List features in active project |
| `feature show [<id>]` | Show feature details |
| `task create --title <t> --description <d>` | Create task (requires active feature) |
| `task list` | List tasks in active feature |
| `task show <id>` | Show task details |
| `task block <id1> <id2>` | Mark task as blocking another |
| `task unblock <id1> <id2>` | Remove block |
| `status <id> <status>` | Update status (shorthand) |
| `approve <id>` | Approve (must be pending_review) |
| `search <query> [--type] [--status] [--limit]` | Full-text search |
| `tree <id> [--depth N]` | Show subtree |

All commands output JSON to stdout.

## Configuration

Config is stored at `~/.config/flowy/config.json`.

| Variable | Description | Default |
|----------|-------------|---------|
| `FLOWY_API_URL` | GraphQL endpoint | `https://flowy-ai.fly.dev/graphql` |
| `FLOWY_API_KEY` | API key (remote mode) | -- |
| `FLOWY_PROJECT` | Override active project by name | -- |
| `FLOWY_FEATURE` | Override active feature by ID | -- |

## Development

```bash
bun run test          # CLI tests
bun run check         # Lint + format
bun run typecheck     # TypeScript

cd server && bunx --bun vitest run   # Server tests
```

## License

Apache-2.0. Copyright 2026 SQA & Automation SRL.
