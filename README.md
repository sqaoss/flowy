# Flowy

CLI for Flowy — project management for AI coding agents.

[![npm](https://img.shields.io/npm/v/@sqaoss/flowy)](https://www.npmjs.com/package/@sqaoss/flowy)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/sqaoss/flowy/actions/workflows/ci.yml/badge.svg)](https://github.com/sqaoss/flowy/actions/workflows/ci.yml)

## What is Flowy

Flowy is a hosted backend project management service built for AI coding agents. It uses a graph data model (nodes and edges) to represent projects, features, epics, and tasks with typed relationships between them. This package provides the CLI that agents use to interact with the Flowy API.

## Quick Start

```bash
# Install
bun add -g @sqaoss/flowy    # or: npm i -g @sqaoss/flowy

# Register and get your API key
flowy register --email you@example.com
export FLOWY_API_KEY=flowy_xxx_yyy

# Create a project
flowy node create --type project --title "Auth System"

# Add tasks
flowy node create --type task --title "Implement OAuth"
flowy node create --type task --title "Write auth tests"

# Link tasks to project
flowy edge create --source <task-id> --target <project-id> --relation part_of

# Track status
flowy status <task-id> in_progress
flowy status <task-id> done

# Search and explore
flowy search "OAuth" --type task
flowy tree subtree <project-id> --depth 3
```

## Command Reference

| Command | Description |
|---------|-------------|
| `register --email <email>` | Register and get API key |
| `whoami` | Show current user |
| `node create --type <type> --title <title> [--description] [--status] [--metadata]` | Create node |
| `node get --id <id>` | Get node |
| `node list [--type] [--status] [--limit] [--offset]` | List nodes |
| `node update --id <id> [--title] [--description] [--status] [--metadata]` | Update node |
| `node delete --id <id>` | Delete node |
| `status <id> <status>` | Update status (shorthand) |
| `approve <id>` | Approve node (must be pending_review) |
| `edge create --source <id> --target <id> --relation <rel>` | Create edge |
| `edge list [--node <id>] [--relation <rel>]` | List edges |
| `edge remove --source <id> --target <id> --relation <rel>` | Remove edge |
| `search <query> [--type] [--status] [--limit]` | Search nodes |
| `tree subtree <id> [--depth N]` | Show subtree |
| `tree ancestors <id> [--depth N] [--relation <rel>]` | Show ancestors |
| `tree descendants <id> [--depth N] [--relation <rel>]` | Show descendants |

All commands output JSON.

## Data Model

### Node Types

`client`, `project`, `feature`, `epic`, `task`

### Edge Relations

- `part_of` -- child belongs to parent
- `depends_on` -- must complete before starting
- `blocks` -- prevents progress on target
- `informs` -- provides context to target

### Status Flow

```
draft -> pending_review -> approved -> in_progress -> done
```

Also: `blocked`, `cancelled`

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `FLOWY_API_URL` | GraphQL endpoint | `https://flowy-ai.fly.dev/graphql` |
| `FLOWY_API_KEY` | API key from register | -- |

## License

Copyright (C) 2026 SQA & Automation SRL

[AGPL-3.0](LICENSE)
