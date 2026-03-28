# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

CLI for Flowy (`@sqaoss/flowy` on npm) — a project management backend for AI coding agents. The CLI wraps a GraphQL API using Commander.js. The server lives in a separate repo (`~/Documents/flowy-saas`).

## Commands

```bash
bun run cli -- <command>                      # Run CLI locally
bun run test                                  # Run tests (Vitest)
bunx vitest run src/util/config.test.ts       # Run a single test file
bun run check                                 # Biome lint + format (auto-fixes)
bun run typecheck                             # TypeScript type checking
```

## Architecture

The CLI is a thin GraphQL client with context resolution. Every command resolves project/feature context from `~/.config/flowy/config.json`, constructs a GraphQL query/mutation, sends it via `src/util/client.ts`, and prints JSON to stdout.

```
src/index.ts              # Entry point — Commander program, registers all commands
src/commands/setup.ts     # Onboarding: SaaS vs self-hosted configuration
src/commands/client.ts    # Client name management (local config)
src/commands/project.ts   # Project CRUD + directory mapping
src/commands/feature.ts   # Feature CRUD + active feature context
src/commands/task.ts      # Task CRUD + block/unblock relationships
src/commands/status.ts    # Status shorthand
src/commands/approve.ts   # Approval workflow
src/commands/search.ts    # Full-text search
src/commands/tree.ts      # Subtree traversal
src/commands/whoami.ts    # Current user info
src/util/client.ts        # graphql() — single fetch-based GraphQL client
src/util/config.ts        # Config loading, context resolution (project, feature)
src/util/description.ts   # Resolve --description from file path or inline string
src/util/format.ts        # output() and outputError() — JSON to stdout/stderr
skills/SKILL.md           # Skill file for AI agents to learn the CLI
```

### Entity hierarchy

Strict 1-to-many: **client → project → feature → task**. No orphans. Feature and task creation require active project/feature context.

### Context resolution

All config in `~/.config/flowy/config.json`. Project resolved by matching `process.cwd()` against directory mappings, or `FLOWY_PROJECT` env var. Feature resolved from config's `activeFeature` field, or `FLOWY_FEATURE` env var.

### Adding a new command

Copy an existing command file, update the GraphQL query/mutation, register it in `index.ts`. Use `requireProject()` or `requireFeature()` from config.ts to enforce context. Both `--title` and `--description` are required on create commands.

## Code Style

Biome enforces: single quotes, no semicolons, trailing commas, 2-space indent, auto-organized imports. Pre-commit hook runs `biome check --write` on staged files.

Conventional commits enforced by commitlint (`feat:`, `fix:`, `docs:`, etc.).

## Environment Variables

- `FLOWY_API_URL` — GraphQL endpoint (default: `https://flowy-ai.fly.dev/graphql`)
- `FLOWY_API_KEY` — API key from `flowy setup`
- `FLOWY_PROJECT` — Override active project by name
- `FLOWY_FEATURE` — Override active feature by ID
