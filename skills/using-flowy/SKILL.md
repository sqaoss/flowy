---
name: flowy
description: Store plans and track execution with Flowy CLI. Use when you need to create features, break work into tasks, track progress, or manage project structure. Trigger on any planning, task tracking, or work organization request.
---

# Flowy — Agentic Persistent Planning

Flowy gives you a persistent store for plans and execution tracking. Features are your master plans. Tasks are your execution steps. Everything persists across sessions, no files in git, no context lost.

## Why Use Flowy

Without Flowy, your plans live in markdown files that clutter git history, get deleted when done, and leave no record of what you accomplished. With Flowy, plans persist in a database. You flow through work without friction. Your human gets full observability.

## Two Modes

Flowy runs against one of two backends. Which one you're in determines which commands work — check `~/.config/flowy/config.json` (`mode` is `local` or `remote`).

| | Local (self-hosted) | Remote (hosted SaaS) |
|---|---|---|
| Setup | `flowy setup local` then `flowy serve` | `flowy setup remote --email <email>` |
| Server | A bundled server you run (`flowy serve`, SQLite, `127.0.0.1:4000`) | `flowy-ai.fly.dev` |
| Account / API key | None | Email registration; API key stored in config |
| Subscription | None — fully free | Data operations require an active subscription |
| Planning workflow | Full (`init`, project/feature/task CRUD, status, approve, search, tree, `task deps`, `task list --ready/--all`, `import`/`export`) | Full, same commands |
| `whoami` / `billing` / `key` | **Not available** — these hard-fail locally | Available |

The planning workflow is **identical** in both modes. Only the account/billing commands differ.

## First Time in a Project

```bash
flowy init           # auto-detects the git repo, creates a project, maps this directory
```

If Flowy isn't set up yet, the human needs to choose a mode:

```bash
npm i -g @sqaoss/flowy

# Self-hosted (free, no account):
flowy setup local    # installs the bundled server, points the CLI at localhost
flowy serve          # starts the local server on 127.0.0.1:4000 (run in its own terminal)

# OR hosted (managed service):
flowy setup remote --email their@email.com   # registers; prints apiKey + checkoutUrl
```

`setup remote` prints a `checkoutUrl`. On the hosted server, data operations are rejected until a subscription is active — the human opens that URL to subscribe. `--tier` is optional at registration; a tier is chosen at checkout.

`flowy setup` also installs this agent skill via `npx skills add sqaoss/flowy`. If that step fails, setup prints a warning with the manual install command — the skill is not installed until you run it.

## Core Workflow

```bash
# 1. Plan a feature (master plan)
flowy feature create --title "User Auth" --description "Email + OAuth login"
flowy feature set "User Auth"

# 2. Break into tasks (execution steps)
flowy task create --title "Implement OAuth" --description "Wire up the OAuth provider"
flowy task create --title "Write tests"     --description-file tests-plan.md

# 3. Execute and track
flowy status <task-id> in_progress
# ... do the work ...
flowy status <task-id> done

# 4. Move to next task or feature
flowy feature create --title "API Rate Limiting" --description-file rate-limit.md
flowy feature set "API Rate Limiting"
```

## Entity Hierarchy

```
client -> project -> feature -> task
            1:many     1:many
```

Every task belongs to a feature. Every feature belongs to a project. No orphans. The project is set automatically by `flowy init`.

## Status Flow

```
draft -> pending_review -> approved -> in_progress -> done
```

Also: `blocked`, `cancelled`

Use `flowy status <id> <status>` to move a node. Only `pending_review` nodes can be approved via `flowy approve <id>`.

## Commands

### Setup and Server
```bash
flowy setup local                          # install bundled local server, configure CLI
flowy serve                                 # run the local server (127.0.0.1:4000, ./flowy.sqlite)
flowy serve --port 5000 --host 0.0.0.0 --db ~/flowy.sqlite
flowy setup remote --email <email>          # register with the hosted server (--tier optional)
flowy setup remote --email <email> --tier explorer
```

### Project Context
```bash
flowy init                                  # auto-detect repo, create + map project
flowy project create <name>                 # create a project by name
flowy project set <name>                    # map current directory to an existing project
flowy project list                          # list all projects
flowy project show [<id>]                   # show project details (defaults to active)
flowy project update [<id>] --title <t>     # update title/description/metadata
flowy project delete [<id>]                 # delete project (defaults to active)
```

### Features (requires active project)
```bash
flowy feature create --title "Title" --description "text"
flowy feature create --title "Title" --description-file spec.md
flowy feature set "Title or ID"             # set active feature
flowy feature unset                         # clear active feature
flowy feature list                          # list features in active project
flowy feature show [<id>]                   # show feature (defaults to active)
flowy feature update [<id>] --title <t>     # update title/description/metadata
flowy feature delete [<id>]                 # delete feature (defaults to active)
```

### Tasks (requires active feature)
```bash
flowy task create --title "Title" --description "text"
flowy task create --title "Title" --description-file spec.md
flowy task list                             # tasks in active feature
flowy task list --ready                     # only actionable tasks (active project)
flowy task list --ready --project <id>      # ...scoped to a specific project
flowy task list --all                       # every task across the whole backlog
flowy task show <id>                        # task details, incl. blockedBy/blocks
flowy task update <id> --title <t>          # update title/description/metadata
flowy task delete <id>                      # delete task
flowy task block <id1> <id2>                # mark id1 as blocking id2
flowy task unblock <id1> <id2>              # remove a blocking relationship
flowy task deps <id>                        # what blocks this task, and what it blocks
```

`task list --ready` returns only tasks that are not `done`/`cancelled` and have zero unfinished blockers — the next work an agent can pick up. Without `--project` it scopes to the active project; with `--all` it spans the whole backlog. `task deps <id>` (and the `blockedBy`/`blocks` fields on `task show`) report the dependency graph built from `task block`.

### Status and Approval
```bash
flowy status <id> in_progress
flowy status <id> pending_review
flowy approve <id>                          # only works on pending_review
flowy status <id> done
```

### Search and Explore
```bash
flowy search "query" --type task --status draft --limit 10
flowy tree <id> --depth 3                    # show subtree from any entity
```

### Import and Export
```bash
flowy export                                 # print active project's manifest to stdout
flowy export backlog.json                    # ...or write it to a file
flowy import backlog.json                    # ingest a manifest (idempotent by client-key)
```

A manifest is a single JSON document describing a backlog: `nodes` (projects, features, tasks) plus dependency `edges`. Each node is addressed by a stable **client-key** (`key`), not a server id:

```json
{
  "version": 1,
  "nodes": [
    { "key": "proj", "type": "project", "title": "My Project" },
    { "key": "auth", "type": "feature", "title": "User Auth", "parent": "proj" },
    { "key": "oauth", "type": "task", "title": "Implement OAuth", "parent": "auth", "status": "draft" }
  ],
  "edges": [
    { "source": "oauth", "target": "auth", "relation": "part_of" }
  ]
}
```

**Idempotency:** import upserts by client-key — re-importing the same manifest updates the matching nodes in place instead of creating duplicates. The key is stored in node metadata under the reserved `__flowyKey` field (your own `metadata` is preserved alongside it and stripped back out on export). A node's `parent` implies a `part_of` edge, so simple manifests need no explicit `edges`; `blocks` dependencies are listed in `edges`. Edges live in the real edge model (`createEdge` / `Query.edges`), so a `blocks` edge created by hand with `task block` is captured on export and never re-created on the next import. Works in both local and remote modes.

### Remote-only (hosted mode)
These hit account/billing resolvers that do **not** exist on the local server; they fail in local mode.
```bash
flowy whoami                                # show current user (id, email, tier, graceEndsAt)
flowy billing checkout --tier <tier>        # get a checkout URL (tier: explorer, pro, team)
flowy key rotate                            # revoke all API keys and issue a new one
```

### Client Settings (local config)
```bash
flowy client set name "Your Name"           # set client display name in local config
```

## Descriptions: literal vs. file

`create` and `update` commands take a description two ways. They are mutually exclusive.

- `--description <text>` — **always literal**. The text is used verbatim and is *never* interpreted as a file path. `--description plan.md` stores the string `plan.md`, not the file's contents.
- `--description-file <path>` — reads the file's contents as the description. Use `-` to read from stdin.

```bash
flowy task create --title "T" --description "Do the thing"
flowy task create --title "T" --description-file plan.md
flowy task create --title "T" --description-file -          # from stdin
```

## Validation Rules

- **Title is required** on every `create` (cannot be empty).
- **Description is required** on `create`: pass exactly one of `--description` or `--description-file`. Passing both is an error; passing neither is an error.
- **Search** requires a non-empty query and returns up to `--limit` results (default 50).
- **Status** must be one of: `draft`, `pending_review`, `approved`, `in_progress`, `done`, `blocked`, `cancelled`.
- **Blocking** creates a `blocks` edge between two existing tasks; both nodes must exist.
- **Approve** only succeeds on a node currently in `pending_review`.

## Output Format

All commands output JSON to stdout. Errors go to stderr as `{ "error": "message" }` (with an optional `code`), and the process exits non-zero.

On the hosted server, an expired or missing subscription surfaces as an error like `An active subscription is required. Run \`flowy billing checkout\` to subscribe.` This never happens in local mode.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `FLOWY_API_URL` | GraphQL endpoint (defaults: hosted in remote mode, `http://localhost:4000/graphql` in local mode) |
| `FLOWY_API_KEY` | API key (remote mode; set by `flowy setup remote`) |
| `FLOWY_PROJECT` | Override active project by name |
| `FLOWY_FEATURE` | Override active feature by ID |
