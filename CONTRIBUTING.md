# Contributing to Flowy CLI

## Development Setup

```bash
git clone https://github.com/sqaoss/flowy.git
cd flowy
bun install
```

## Running the CLI Locally

```bash
bun run cli -- --help              # Show all commands
bun run cli -- whoami              # Run a specific command
```

## Code Style

Enforced by [Biome](https://biomejs.dev/) (`biome.json`):

- Single quotes, no semicolons, trailing commas
- 2-space indentation
- Imports auto-organized

Run the formatter:

```bash
bun run check
```

A pre-commit hook runs `biome check --write` on staged files automatically.

## Commit Messages

We use [conventional commits](https://www.conventionalcommits.org/):

```
type(scope): description
```

**Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`

Examples:

```
feat: add search command
fix: handle empty response from API
docs: update README with new commands
```

A commit-msg hook enforces this format via commitlint.

## Branch Naming

```
type/description
```

Examples: `feat/add-search`, `fix/auth-bug`, `chore/update-deps`

## PR Process

1. Create a branch from `main`
2. Make your changes
3. Ensure CI passes (`bun run check` and `bun run typecheck`)
4. Open a PR and request review
