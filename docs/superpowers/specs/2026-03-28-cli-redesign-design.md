# Flowy CLI Redesign — Domain-Driven Commands

## Problem

The current CLI exposes graph primitives (`node`, `edge`, `tree`) that force agents to think in database terms. Nobody thinks "create a node of type task" — they think "create a task." The abstraction is wrong for the target users (AI coding agents).

Additionally, the CLI only works with the hosted SaaS. A self-hosted option is needed so the open-source CLI is useful without a paid subscription.

## Design Decisions

### Entity Hierarchy

Strict top-down, 1-to-many at every level. No orphans.

```
client → project → feature → task
```

- **client**: the person or company. One client can have multiple projects.
- **project**: a codebase/product. One project can have multiple features.
- **feature**: a unit of work (absorbs the role of "epic"). One feature can have multiple tasks.
- **task**: an individual work item, the leaf node.

No `epic` type. Feature covers that role — even non-functional work (e.g., "stability") is a feature.

### Two Modes, One Codepath

The CLI always talks GraphQL. Never direct DB access.

- **SaaS mode**: CLI → `https://flowy-ai.fly.dev/graphql` (hosted)
- **Self-hosted mode**: CLI → `http://localhost:4000/graphql` (local server)

For self-hosted: a `docker-compose.yml` ships with the server repo, bundling the Flowy server + PostgreSQL. One `docker compose up` to run.

The server repo (`SQA-and-automation/flowy-saas`) will be relicensed from private to **FSL 1.1 (Functional Source License)** — source-available, self-hosting permitted, competing services prohibited. Converts to Apache 2.0 after 2 years per release.

### Context Resolution

All config stored in `~/.config/flowy/` — nothing in the project directory.

| Context | Resolution order | How it's set |
|---------|-----------------|--------------|
| Client | Config file (from `flowy setup`) | `flowy setup` |
| Project | `FLOWY_PROJECT` env var > directory-path mapping in config | `flowy project set <name>` maps current dir |
| Feature | `FLOWY_FEATURE` env var > config (scoped to project) | `flowy feature set <name-or-id>` |

- **Client**: configured during `flowy setup`, tied to API credentials.
- **Project**: mapped to a filesystem directory. When running `flowy` from that dir, the project is resolved automatically.
- **Feature**: ephemeral working context. The agent sets it when starting work on a feature, replaces or unsets it when moving to the next one.

### Description Field

`--title` and `--description` are both **required** on `create` for features and tasks.

`--description` accepts:
- **Inline string** (quoted): `--description "Do the thing"` — sent as-is
- **File path** (unquoted): `--description spec.md` — CLI reads file, sends raw content to API

No parsing, no title extraction, no sanitization. The server handles validation.

## Commands

### Onboarding & Identity

```bash
flowy setup                           # Guided: SaaS vs self-hosted, credentials, project mapping
flowy whoami                          # Show current user/client info
```

`flowy setup` replaces `flowy register`. For SaaS mode it handles registration + API key. For self-hosted it configures `FLOWY_API_URL` pointing to the local server.

### Client

```bash
flowy client set name <name>          # Set/change client display name
```

Client is resolved from credentials configured during setup. Cannot be switched — one client per API key.

### Project

```bash
flowy project create <name>           # Create a new project under the client
flowy project set <name>              # Map current directory to this project
flowy project list                    # List all projects
flowy project show [<id>]             # Show project details (no id = active project)
```

### Feature (requires active project)

```bash
flowy feature create --title <t> --description <d>   # Create feature in active project
flowy feature set <name-or-id>                        # Set active feature (working context)
flowy feature unset                                   # Clear active feature
flowy feature list                                    # List features in active project
flowy feature show [<id>]                             # Show feature details (no id = active feature)
```

### Task (requires active feature)

```bash
flowy task create --title <t> --description <d>       # Create task in active feature
flowy task list                                       # List tasks in active feature
flowy task show [<id>]                                # Show task details
flowy task block <id1> <id2>                          # Mark id1 blocks id2
flowy task unblock <id1> <id2>                        # Remove block relationship
```

### Cross-Cutting

```bash
flowy status <id> <status>            # Update status (draft, pending_review, approved, in_progress, done, blocked, cancelled)
flowy approve <id>                    # Approve (must be pending_review)
flowy search <query> [--type] [--status] [--limit]    # Full-text search
flowy tree <id> [--depth N]           # Show subtree from any entity
```

### Config File Structure

`~/.config/flowy/config.json`:
```json
{
  "mode": "saas",
  "apiUrl": "https://flowy-ai.fly.dev/graphql",
  "apiKey": "flowy_xxx_yyy",
  "client": {
    "name": "Acme Corp"
  },
  "projects": {
    "/Users/me/projects/auth-system": {
      "id": "proj_abc123",
      "name": "Auth System",
      "activeFeature": "feat_def456"
    }
  }
}
```

Project is resolved by matching `process.cwd()` against the `projects` keys. `activeFeature` is the ephemeral working context per project.

## What Stays the Same

- Commander.js for argument parsing
- Single `graphql()` function wraps all API calls
- All output is JSON to stdout, errors to stderr
- `src/util/client.ts`, `src/util/format.ts` unchanged
- `src/util/config.ts` expanded to handle `~/.config/flowy/` resolution

## What Changes

### CLI (this repo)

| Current | New |
|---------|-----|
| `src/commands/node.ts` (generic CRUD) | `src/commands/project.ts`, `feature.ts`, `task.ts`, `client.ts` (domain-specific) |
| `src/commands/edge.ts` (generic edges) | Removed. `task block/unblock` handles the one exposed relationship |
| `src/commands/register.ts` | Replaced by `src/commands/setup.ts` (guided onboarding) |
| `src/util/config.ts` (env vars only) | Expanded: reads `~/.config/flowy/config.json`, resolves context from directory path |
| `skills/flowy.md` | Renamed to `skills/SKILL.md`, updated with new command examples |

### Server (flowy-saas, separate repo)

- Relicense to FSL 1.1
- Add `docker-compose.yml` (server + PostgreSQL)
- GraphQL API may need minor additions (e.g., mutations that accept parent context directly instead of requiring separate edge creation)
- No fundamental architecture changes — nodes and edges remain the storage model

### Skill File

`skills/flowy.md` → `skills/SKILL.md`. Updated with the new domain-driven command examples. Use `/skill-creator` to review and refine.

## Verification

1. `bun run cli -- setup` — complete onboarding flow
2. `bun run cli -- project create "Test Project"` — creates project
3. `bun run cli -- project set "Test Project"` — maps current dir
4. `bun run cli -- feature create --title "Auth" --description auth.md` — creates feature
5. `bun run cli -- feature set "Auth"` — sets working context
6. `bun run cli -- task create --title "OAuth" --description "Implement Google OAuth"` — creates task under feature
7. `bun run cli -- task list` — shows tasks in active feature
8. `bun run check && bun run typecheck` — lint and type check pass
