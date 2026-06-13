# Flowy

Agentic persistent planning

[![npm](https://img.shields.io/npm/v/@sqaoss/flowy)](https://www.npmjs.com/package/@sqaoss/flowy)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/sqaoss/flowy/actions/workflows/ci.yml/badge.svg)](https://github.com/sqaoss/flowy/actions/workflows/ci.yml)

Jira, Linear, Trello are built for humans clicking boards. AI agents don't click boards. When your agent needs to plan work, track progress, and close tickets, those tools add friction, load context, and get in the way.

Flowy is where agents store plans and flow through execution. Features are master plans. Tasks are execution steps. Everything persists in a database, not as files cluttering your git history. Your agent flows through work without friction.

You get full observability on what every agent planned, built, and shipped.

## Get Started

Flowy runs in one of two modes. Pick the one that fits:

- **Self-hosted** — a local server you run yourself (`flowy serve`). No account, no subscription, your data stays on your machine. Start here if you just want to try Flowy.
- **Remote (hosted)** — the managed service at `flowy-ai.fly.dev`. Register with an email, then subscribe at checkout. The hosted server gates data operations behind an active subscription.

### Quickstart (self-hosted, no account)

```bash
npm i -g @sqaoss/flowy
flowy setup local          # installs the bundled server, points the CLI at localhost
flowy serve &              # starts the local server on 127.0.0.1:4000

cd my-project
flowy init                 # auto-detects the git repo, creates + maps a project

flowy feature create --title "User Auth" --description "Email + OAuth login"
flowy feature set "User Auth"

flowy task create --title "Implement OAuth" --description "Wire up the OAuth provider"
flowy status <task-id> in_progress
flowy status <task-id> done
```

`flowy serve` runs in the foreground; the `&` backgrounds it. Stop it with `kill %1` or run it in a separate terminal. Data lives in `./flowy.sqlite`.

### Quickstart (remote/hosted)

```bash
npm i -g @sqaoss/flowy
flowy setup remote --email you@example.com   # registers; prints an apiKey + checkoutUrl

cd my-project
flowy init                                   # auto-detects the git repo, creates + maps a project
flowy task create --title "First task" --description "Try it out"
```

`setup remote` registers your email and stores the returned API key. It prints a `checkoutUrl` — **open it to start a subscription**. Until you do, the hosted server may reject data operations with `An active subscription is required`. You no longer need to choose a tier up front (`--tier` is optional); pick one at checkout.

Every command outputs JSON. Your agent reads it, acts on it, moves to the next task.

### Descriptions: literal vs. file

`--description` is **always literal text** — it is never read as a file path. To load a description from a file (or stdin), use `--description-file`:

```bash
flowy task create --title "Write tests"   --description "Unit + integration tests"
flowy feature create --title "User Auth"  --description-file auth-spec.md
flowy task create --title "From stdin"    --description-file -      # reads stdin
```

### Dependencies and ready work

Tasks can block one another. Mark a dependency, inspect it, and ask for only the tasks that are actually actionable right now:

```bash
flowy task block <blocker-id> <blocked-id>   # blocker must finish before blocked
flowy task deps <id>                          # what blocks this task, and what it blocks
flowy task show <id>                          # task details, now including blockedBy/blocks

flowy task list --ready                        # only unblocked, not-done tasks (active project)
flowy task list --ready --project <project-id> # ...scoped to a specific project
flowy task list --all                          # every task across the whole backlog
```

`--ready` returns tasks that are not `done`/`cancelled` and have zero unfinished blockers — the work an agent can pick up next.

### Import and export

Move a whole backlog in or out as a single JSON manifest. Import is **idempotent**: each node carries a stable `key` (a client-key), so re-importing updates the matching nodes in place instead of duplicating them. Edges (`part_of`, `blocks`) round-trip through the real edge model, so a `block` you created by hand is captured on export and not re-created on the next import.

```bash
flowy export                 # print the active project's manifest to stdout
flowy export backlog.json    # ...or write it to a file
flowy import backlog.json    # ingest a manifest (create new, update existing by key)
```

A manifest looks like:

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

Each node's `parent` implies a `part_of` edge, so the simplest manifests need no explicit `edges`. `blocks` dependencies go in `edges`. The reserved `__flowyKey` metadata field stores the client-key; your own `metadata` is preserved alongside it and stripped back out on export.

### Backup and restore (local SQLite)

In self-hosted mode your backlog lives in a single SQLite file (see [Where your data lives](#where-your-data-lives)). `flowy backup` takes a consistent, file-level snapshot of that database, and `flowy restore` reinstates one.

```bash
flowy backup flowy-backup.sqlite             # snapshot the local DB (./flowy.sqlite by default)
flowy backup ~/snapshots/flowy.sqlite --db ~/flowy.sqlite   # back up a DB at a custom path
flowy restore flowy-backup.sqlite            # restore into a fresh DB (refuses to clobber)
flowy restore flowy-backup.sqlite --force    # overwrite an existing DB
```

The snapshot is taken with SQLite's `VACUUM INTO`, so it is transactionally consistent **even while the server is running** and writes a single self-contained file (no `-wal`/`-shm` sidecars). `restore` validates the source is a real SQLite database before touching the target, and **refuses to overwrite an existing database** unless you pass `--force`.

Both commands resolve the database path the same way the server does: `--db <path>`, then `$FLOWY_DB_PATH`, then `./flowy.sqlite`.

**`backup` vs. `export` — they're complementary, not redundant:**

| | `flowy export` (logical) | `flowy backup` (raw) |
|---|---|---|
| Format | Portable JSON manifest | Exact SQLite file |
| Scope | The active project's subtree | The entire database (all projects) |
| Re-importable | Yes — `flowy import` (idempotent, cross-backend) | No — restore only, local server |
| Use it for | Migrating between machines/backends, re-importing, diffing in git | Point-in-time disaster recovery, an exact byte-faithful snapshot |

Use `export`/`import` to move a backlog around or seed another backend; use `backup`/`restore` for a true snapshot of your local server's data.

### Where your data lives

The self-hosted server persists everything in one SQLite file. Its location depends on how you run the server:

- **`flowy serve`** (native): `./flowy.sqlite` in the current directory by default, or wherever `--db`/`$FLOWY_DB_PATH` points.
- **Docker (`docker compose up`)**: inside the named volume `flowy-data`, mounted at `/data`, with `FLOWY_DB_PATH=/data/flowy.sqlite`. The data outlives the container — but `docker compose down -v` deletes the volume **and your backlog with it**. Take a `flowy backup` first.

To back up the Docker volume's database, point `--db` at the in-container path while running `flowy backup` from inside the container, or restore into a fresh `flowy serve` directory and snapshot there.

## Agent Skill

`flowy setup` installs an agent skill so your AI agent automatically knows every command. If that install step fails (offline, no `npx`, registry hiccup), setup prints a warning telling you to install it manually:

```bash
npx skills add sqaoss/flowy
```

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

Run Flowy on your own machine — no Docker, no account, no subscription. `flowy setup local` installs a bundled server pinned to your CLI version and points the CLI at `localhost`; `flowy serve` runs it natively over SQLite.

```bash
flowy setup local            # install the bundled server, configure the CLI
flowy serve                  # bind 127.0.0.1:4000, store data in ./flowy.sqlite
flowy serve --port 5000 --host 0.0.0.0 --db ~/flowy.sqlite   # override defaults
```

The self-hosted server supports the full planning workflow — `init`, `project`/`feature`/`task` CRUD, `status`, `approve`, `search`, `tree`, `task deps`, `task list --ready/--all`, `import`/`export`, and `backup`/`restore` (raw SQLite snapshots). Account-only commands (`whoami`, `billing`, `key`) are remote-mode features and don't apply locally.

The canonical status flow is `draft → pending_review → approved → in_progress → done`, plus `blocked` and `cancelled`. By default any status change is allowed (and the `status` command validates the value client-side). To make the local server *enforce* legal transitions — rejecting illegal jumps like `draft → done` with a `VALIDATION_ERROR` — start it with `FLOWY_ENFORCE_STATUS_LIFECYCLE=1`. Enforcement is opt-in and off by default.

## Command Reference

| Command | Description |
|---------|-------------|
| `setup local` | Install the bundled local server and point the CLI at it |
| `setup remote --email <email> [--tier <tier>]` | Register with the hosted server (`--tier` optional) |
| `serve [--port] [--host] [--db]` | Run the bundled local server (self-hosted mode) |
| `init` | Auto-detect repo and create/map project |
| `client set name <name>` | Set client display name |
| `project create <name>` | Create project |
| `project set <name>` | Map current directory to a project |
| `project list` | List all projects |
| `project show [<id>]` | Show project details (defaults to active) |
| `project update [<id>] [--title] [--description\|--description-file] [--metadata]` | Update a project |
| `project delete [<id>]` | Delete a project (defaults to active) |
| `feature create --title <t> [--description <text>\|--description-file <path>]` | Create feature (requires active project) |
| `feature set <name-or-id>` | Set active feature |
| `feature unset` | Clear active feature |
| `feature list` | List features in active project |
| `feature show [<id>]` | Show feature details (defaults to active) |
| `feature update [<id>] [--title] [--description\|--description-file] [--metadata]` | Update a feature |
| `feature delete [<id>]` | Delete a feature (defaults to active) |
| `task create --title <t> [--description <text>\|--description-file <path>]` | Create task (requires active feature) |
| `task list [--ready] [--all] [--project <id>]` | List tasks: active feature, or `--ready`/`--all` (optionally scoped to a project) |
| `task show <id>` | Show task details, including `blockedBy`/`blocks` |
| `task update <id> [--title] [--description\|--description-file] [--metadata]` | Update a task |
| `task delete <id>` | Delete a task |
| `task block <id1> <id2>` | Mark `id1` as blocking `id2` |
| `task unblock <id1> <id2>` | Remove a blocking relationship |
| `task deps <id>` | Show what blocks a task and what it blocks |
| `status <id> <status>` | Update status (shorthand) |
| `approve <id>` | Approve (must be pending_review) |
| `search <query> [--type] [--status] [--limit]` | Full-text search; prints `{ nodes, truncated, total }` and warns on stderr when results are capped at `--limit` |
| `tree <id> [--depth N]` | Show subtree from any entity |
| `import <manifest>` | Ingest a JSON manifest of nodes + edges (idempotent by client-key) |
| `export [output]` | Dump the active project as a manifest (stdout or file) |
| `backup <dest> [--db <path>]` | Consistent file-level snapshot of the local SQLite database |
| `restore <src> [--db <path>] [--force]` | Restore the local SQLite database from a backup (refuses to clobber without `--force`) |
| `whoami` | Show current user (remote mode) |
| `billing checkout --tier <tier>` | Get a checkout URL for a subscription (remote mode) |
| `key rotate` | Revoke all API keys and issue a new one (remote mode) |

All commands output JSON to stdout; errors go to stderr as `{ "error": "message" }`.

## GraphQL API

The CLI is a thin client over a GraphQL API. To integrate directly — or to
understand what the CLI sends — see the API reference for the bundled local
server:

- **[docs/API.md](docs/API.md)** — schema, example queries/mutations,
  error-code catalogue (with CLI exit codes), and limits.
- **[docs/api/schema.graphql](docs/api/schema.graphql)** — the full SDL,
  regenerable with `bun run sdl`.

The hosted service at `flowy-ai.fly.dev` exposes a superset of this schema plus
account/billing operations; its API is documented separately.

## Configuration

Config is stored at `~/.config/flowy/config.json`. These environment variables override config:

| Variable | Description | Default |
|----------|-------------|---------|
| `FLOWY_API_URL` | GraphQL endpoint | `https://flowy-ai.fly.dev/graphql` (remote) / `http://localhost:4000/graphql` (local) |
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
