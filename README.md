# Flowy

CLI for Flowy — project management for AI coding agents.

[![npm](https://img.shields.io/npm/v/@sqaoss/flowy)](https://www.npmjs.com/package/@sqaoss/flowy)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/sqaoss/flowy/actions/workflows/ci.yml/badge.svg)](https://github.com/sqaoss/flowy/actions/workflows/ci.yml)

> **Note:** Registration is temporarily closed while the project is in rapid development. Existing users are unaffected.

## What is Flowy

Flowy is a hosted backend project management service built for AI coding agents. It uses a strict hierarchy — **client → project → feature → task** — to organize work. This package provides the CLI that agents use to interact with the Flowy API.

## Quick Start

```bash
# Install
bun add -g @sqaoss/flowy    # or: npm i -g @sqaoss/flowy

# Set up (SaaS mode)
flowy setup --mode saas --email you@example.com
export FLOWY_API_KEY=flowy_xxx_yyy

# Set client name
flowy client set name "Acme Corp"

# Create and activate a project
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

## Command Reference

| Command | Description |
|---------|-------------|
| `setup --mode <saas\|local> [--email] [--api-url] [--api-key]` | Configure CLI |
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
| `search <query> [--type] [--status] [--limit]` | Search |
| `tree <id> [--depth N]` | Show subtree |

All commands output JSON.

## Data Model

### Entity Types

`client`, `project`, `feature`, `task`

### Hierarchy

```
client → project → feature → task
         1:many    1:many    1:many
```

No orphans — every entity must belong to its parent.

### Status Flow

```
draft → pending_review → approved → in_progress → done
```

Also: `blocked`, `cancelled`

### Description Field

`--description` accepts a file path or inline string:
- `--description spec.md` — reads file content
- `--description "Do the thing"` — sends string as-is

## Configuration

Config is stored at `~/.config/flowy/config.json`.

| Variable | Description | Default |
|----------|-------------|---------|
| `FLOWY_API_URL` | GraphQL endpoint | `https://flowy-ai.fly.dev/graphql` |
| `FLOWY_API_KEY` | API key from setup | -- |
| `FLOWY_PROJECT` | Override active project by name | -- |
| `FLOWY_FEATURE` | Override active feature by ID | -- |

## Self-Hosted

Flowy can run self-hosted via Docker Compose (server repo ships `docker-compose.yml`):

```bash
flowy setup --mode local --api-url http://localhost:4000/graphql
```

## License

Copyright (C) 2026 SQA & Automation SRL

[AGPL-3.0](LICENSE)
