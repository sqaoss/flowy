# Flowy — Project Management for AI Agents

Flowy is a hosted project management backend. You interact with it via the `flowy` CLI.

## Setup

```bash
# Install globally
bun add -g @sqaoss/flowy    # or: npm i -g @sqaoss/flowy

# SaaS mode (hosted)
flowy setup --mode saas --email you@example.com
export FLOWY_API_KEY=flowy_xxx_yyy

# Self-hosted mode
flowy setup --mode local --api-url http://localhost:4000/graphql
```

## Hierarchy

Strict top-down: **client → project → feature → task**. No orphans at any level.

- A client has many projects
- A project has many features
- A feature has many tasks

## Context

Flowy uses context to know which project and feature you're working in:

- **Project**: mapped to a directory via `flowy project set <name>`, or `FLOWY_PROJECT` env var
- **Feature**: set via `flowy feature set <name-or-id>`, or `FLOWY_FEATURE` env var

Features and tasks cannot be created without active project/feature context.

## Commands

### Identity
```bash
flowy whoami                          # Show current user
```

### Client
```bash
flowy client set name "Acme Corp"     # Set client display name
```

### Projects
```bash
flowy project create "Auth System"    # Create a project
flowy project set "Auth System"       # Map current dir to project
flowy project list                    # List all projects
flowy project show                    # Show active project details
flowy project show <id>               # Show specific project
```

### Features (requires active project)
```bash
flowy feature create --title "SSO Support" --description sso-spec.md
flowy feature create --title "Stability" --description "Improve error handling"
flowy feature set "SSO Support"       # Set active feature
flowy feature unset                   # Clear active feature
flowy feature list                    # List features in project
flowy feature show                    # Show active feature
```

### Tasks (requires active feature)
```bash
flowy task create --title "Implement OAuth" --description oauth.md
flowy task create --title "Write tests" --description "Unit tests for auth"
flowy task list                       # List tasks in feature
flowy task show <id>                  # Show task details
flowy task block <id1> <id2>          # Mark id1 blocks id2
flowy task unblock <id1> <id2>        # Remove block
```

### Status & Approval
```bash
flowy status <id> in_progress
flowy status <id> done
flowy status <id> pending_review
flowy approve <id>                    # Must be pending_review
```

### Search & Explore
```bash
flowy search "OAuth" --type task
flowy search "auth" --status draft --limit 5
flowy tree <id> --depth 3             # Show subtree
```

## Entity Types
- `client` — a client or company
- `project` — a codebase or product
- `feature` — a unit of work (replaces epic)
- `task` — an individual work item

## Status Flow
`draft` → `pending_review` → `approved` → `in_progress` → `done`

Also: `blocked`, `cancelled`

## Description Field
`--description` accepts a file path or an inline string:
- `--description spec.md` — reads file, sends raw content
- `--description "Do the thing"` — sends string as-is

## Workflow Example

```bash
# One-time setup
flowy setup --mode saas --email you@example.com
flowy client set name "Acme Corp"

# Create and activate project
flowy project create "Auth System"
flowy project set "Auth System"

# Plan a feature
flowy feature create --title "SSO Support" --description sso-spec.md
flowy feature set "SSO Support"

# Break into tasks
flowy task create --title "Implement OAuth" --description oauth.md
flowy task create --title "Write auth tests" --description tests.md

# Track progress
flowy status <task-id> in_progress
flowy status <task-id> done

# Move to next feature
flowy feature create --title "API Rate Limiting" --description rate-limit.md
flowy feature set "API Rate Limiting"
```

## Output Format
All commands output JSON. Parse with `jq` or directly in your agent code.
