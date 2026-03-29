# Flowy

Project management for AI coding agents.

[![npm](https://img.shields.io/npm/v/@sqaoss/flowy)](https://www.npmjs.com/package/@sqaoss/flowy)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/sqaoss/flowy/actions/workflows/ci.yml/badge.svg)](https://github.com/sqaoss/flowy/actions/workflows/ci.yml)

## What is Flowy

Flowy is a backend + CLI that gives AI coding agents structured project management. It enforces a strict hierarchy -- **client -> project -> feature -> task** -- so agents always have clear context about what they're working on.

Run it locally with SQLite and Docker, or connect to the hosted SaaS for multi-agent team collaboration.

## Quick Start (Local Mode)

Local mode runs a Flowy server on your machine using Docker. No account needed.

```bash
# Install
bun add -g @sqaoss/flowy    # or: npm i -g @sqaoss/flowy

# Start the local server (requires Docker)
flowy setup local

# Set your client name
flowy client set name "Acme Corp"

# Create a project and map it to the current directory
flowy project create "Auth System"
flowy project set "Auth System"

# Plan a feature
flowy feature create --title "SSO Support" --description sso-spec.md
flowy feature set "SSO Support"

# Create tasks
flowy task create --title "Implement OAuth" --description oauth.md
flowy task create --title "Write auth tests" --description "Unit + integration tests"

# Track progress
flowy status <task-id> in_progress
flowy status <task-id> done

# Search and explore
flowy search "OAuth" --type task
flowy tree <project-id> --depth 3
```

## Remote Mode (Coming Soon)

Remote mode connects to the hosted Flowy SaaS for multi-agent collaboration, shared project state across teams, and persistent history. Registration and API key setup will happen directly through the CLI -- no website needed. This is currently a work in progress.

## Command Reference

| Command | Description |
|---------|-------------|
| `setup local` | Start a local Docker server and configure the CLI |
| `setup remote` | Connect to the hosted SaaS (coming soon) |
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

## Data Model

### Entity Hierarchy

```
client -> project -> feature -> task
           1:many    1:many    1:many
```

Every entity belongs to its parent. No orphans.

### Status Flow

```
draft -> pending_review -> approved -> in_progress -> done
```

Also: `blocked`, `cancelled`

### Description Field

`--description` accepts a file path or an inline string:
- `--description spec.md` -- reads file content
- `--description "Do the thing"` -- sends string as-is

## Configuration

Config is stored at `~/.config/flowy/config.json`.

| Variable | Description | Default |
|----------|-------------|---------|
| `FLOWY_API_URL` | GraphQL endpoint | `http://localhost:4000/graphql` |
| `FLOWY_API_KEY` | API key (remote mode only) | -- |
| `FLOWY_PROJECT` | Override active project by name | -- |
| `FLOWY_FEATURE` | Override active feature by ID | -- |

## For AI Agents

Flowy integrates with [TanStack Intent](https://github.com/TanStack/intent) for automatic tool discovery. Run:

```bash
npx @tanstack/intent install
```

This auto-discovers the Flowy skill and makes it available to your agent. See [`skills/using-flowy/SKILL.md`](skills/using-flowy/SKILL.md) for the full skill reference.

## Development

```bash
bun run test          # Run CLI tests (Vitest)
bun run check         # Biome lint + format
bun run typecheck     # TypeScript type checking

# Server tests
cd server && bunx --bun vitest run
```

## License

Apache-2.0 -- Copyright 2026 SQA & Automation SRL
