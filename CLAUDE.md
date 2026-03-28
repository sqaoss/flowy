# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

CLI for Flowy (`@sqaoss/flowy` on npm) — a project management backend for AI coding agents. The CLI wraps a GraphQL API (hosted at `flowy-ai.fly.dev`) using Commander.js. The server lives in a separate repo (`~/Documents/flowy-saas`).

Registration is currently closed. Existing API keys work.

## Commands

```bash
bun run cli -- <command>     # Run CLI locally (e.g. bun run cli -- whoami)
bun run check                # Biome lint + format (auto-fixes)
bun run typecheck            # TypeScript type checking
```

There is no test suite. CI runs `biome check` and `typecheck` only.

## Architecture

The CLI is a thin GraphQL client. Every command constructs a query/mutation, sends it via `src/util/client.ts`, and prints JSON to stdout.

```
src/index.ts              # Entry point — Commander program, registers all commands
src/commands/*.ts         # One file per command group (node, edge, tree, search, etc.)
src/util/client.ts        # graphql() — single fetch-based GraphQL client
src/util/config.ts        # Reads FLOWY_API_URL and FLOWY_API_KEY from env
src/util/format.ts        # output() and outputError() — JSON to stdout/stderr
skills/flowy.md           # Skill file for AI agents to learn the CLI
```

All commands follow the same pattern: parse opts with Commander, call `graphql()`, pipe result through `output()`, catch errors with `outputError()`. When adding a new command, copy an existing one and register it in `index.ts`.

The binary runs directly as `bun src/index.ts` (no build step) — the `bin` field in package.json points to `./src/index.ts`.

## Code Style

Biome enforces: single quotes, no semicolons, trailing commas, 2-space indent, auto-organized imports. A pre-commit hook runs `biome check --write` on staged files.

Conventional commits enforced by commitlint (`feat:`, `fix:`, `docs:`, etc.).

## Environment Variables

- `FLOWY_API_URL` — GraphQL endpoint (default: `https://flowy-ai.fly.dev/graphql`)
- `FLOWY_API_KEY` — API key from `flowy register`
