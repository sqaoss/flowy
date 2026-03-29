---
name: flowy
description: Store plans and track execution with Flowy CLI. Use when you need to create features, break work into tasks, track progress, or manage project structure. Trigger on any planning, task tracking, or work organization request.
---

# Flowy — Agentic Persistent Planning

Flowy gives you a persistent store for plans and execution tracking. Features are your master plans. Tasks are your execution steps. Everything persists across sessions, no files in git, no context lost.

## Why Use Flowy

Without Flowy, your plans live in markdown files that clutter git history, get deleted when done, and leave no record of what you accomplished. With Flowy, plans persist in a database. You flow through work without friction. Your human gets full observability.

## First Time in a Project

```bash
flowy init           # auto-detects the git repo, creates a project, maps this directory
```

If Flowy isn't set up yet, the human needs to run:
```bash
npm i -g @sqaoss/flowy
flowy setup remote --email their@email.com
```

## Core Workflow

```bash
# 1. Plan a feature (master plan)
flowy feature create --title "User Auth" --description auth-spec.md
flowy feature set "User Auth"

# 2. Break into tasks (execution steps)
flowy task create --title "Implement OAuth" --description oauth.md
flowy task create --title "Write tests" --description "Unit + integration tests"

# 3. Execute and track
flowy status <task-id> in_progress
# ... do the work ...
flowy status <task-id> done

# 4. Move to next task or feature
flowy feature create --title "API Rate Limiting" --description rate-limit.md
flowy feature set "API Rate Limiting"
```

## Entity Hierarchy

```
project -> feature -> task
  1:many     1:many
```

Every task belongs to a feature. Every feature belongs to a project. No orphans. The project is set automatically by `flowy init`.

## Status Flow

```
draft -> pending_review -> approved -> in_progress -> done
```

Also: `blocked`, `cancelled`

Only `pending_review` entities can be approved via `flowy approve <id>`.

## Commands

### Project Context
```bash
flowy init                            # Auto-detect repo, create + set project
flowy project list                    # List all projects
flowy project show [<id>]             # Show project details
```

### Features (requires active project)
```bash
flowy feature create --title "Title" --description "description or file.md"
flowy feature set "Title or ID"       # Set active feature
flowy feature unset                   # Clear active feature
flowy feature list                    # List features in project
flowy feature show [<id>]             # Show feature details
```

### Tasks (requires active feature)
```bash
flowy task create --title "Title" --description "description or file.md"
flowy task list                       # List tasks in feature
flowy task show <id>                  # Show task details
flowy task block <blocker> <blocked>  # Mark dependency
flowy task unblock <blocker> <blocked>
```

### Status and Approval
```bash
flowy status <id> in_progress
flowy status <id> pending_review
flowy approve <id>                    # Only works on pending_review
flowy status <id> done
```

### Search and Explore
```bash
flowy search "query" --type task --status draft --limit 10
flowy tree <project-id> --depth 3     # Show full subtree
```

## Validation Rules

- **Title is required** and cannot be empty
- **Description** is optional, but if provided cannot be empty
- **--description** accepts a file path (reads content) or an inline string
- **Search** requires at least 3 characters
- **Status** must be one of: draft, pending_review, approved, in_progress, done, blocked, cancelled
- **Blocking**: a task cannot block itself
- **Edges**: both source and target nodes must exist

## Output Format

All commands output JSON to stdout. Errors go to stderr as `{ "error": "message" }`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `FLOWY_PROJECT` | Override active project by name |
| `FLOWY_FEATURE` | Override active feature by ID |
| `FLOWY_API_URL` | GraphQL endpoint |
| `FLOWY_API_KEY` | API key (from setup) |
