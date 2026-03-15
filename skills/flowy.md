# Flowy — Project Management for AI Agents

Flowy is a backend project management service. You interact with it via the `flowy` CLI.

## Setup

```bash
# Install globally
bun add -g @sqaoss/flowy    # or: npm i -g @sqaoss/flowy

# Register (no API key needed)
flowy register --email your@email.com
# Save the returned API key

# Configure
export FLOWY_API_URL=https://flowy-ai.fly.dev/graphql  # default
export FLOWY_API_KEY=flowy_xxx_yyy
```

## Commands

### Identity
```bash
flowy whoami                          # Show current user
```

### Nodes (projects, tasks, features, epics)
```bash
flowy node create --type task --title "Implement login" --description "Add OAuth"
flowy node get --id <node-id>
flowy node list                       # List all nodes
flowy node list --type task           # Filter by type
flowy node list --status in_progress  # Filter by status
flowy node update --id <id> --title "New title" --status done
flowy node delete --id <id>
```

### Status (shorthand)
```bash
flowy status <node-id> in_progress
flowy status <node-id> done
```

### Audit & Approval
```bash
flowy status <node-id> pending_review    # Mark as ready for review
flowy approve <node-id>                  # Approve (must be pending_review)
```

### Edges (relationships between nodes)
```bash
flowy edge create --source <id> --target <id> --relation part_of
flowy edge list --node <id>
flowy edge remove --source <id> --target <id> --relation part_of
```

### Search
```bash
flowy search "authentication"            # Full-text search
flowy search "OAuth" --type task         # Filter by type
flowy search "login" --status draft      # Filter by status
flowy search "auth" --limit 5            # Limit results
```

### Graph Traversal
```bash
flowy tree subtree <node-id>                         # Show full subtree
flowy tree subtree <node-id> --depth 2               # Limit depth
flowy tree ancestors <node-id>                       # Walk up the graph
flowy tree ancestors <node-id> --relation part_of    # Filter by relation
flowy tree descendants <node-id> --depth 3           # Walk down the graph
```

## Node Types
- `client` — a client or customer
- `project` — a project
- `feature` — a feature within a project
- `epic` — a large body of work
- `task` — an individual work item

## Status Flow
`draft` -> `pending_review` -> `approved` -> `in_progress` -> `done`

Also: `blocked`, `cancelled`

## Relations
- `part_of` — child belongs to parent
- `depends_on` — must complete before starting
- `blocks` — prevents progress on target
- `informs` — provides context to target

## Workflow Example

```bash
# Create project structure
flowy node create --type project --title "Auth System"
flowy node create --type task --title "Implement OAuth" --description "Google + GitHub"
flowy node create --type task --title "Write auth tests"

# Link tasks to project
flowy edge create --source <task-id> --target <project-id> --relation part_of

# Submit for review and approve
flowy status <task-id> pending_review
flowy approve <task-id>

# Track progress
flowy status <task-id> in_progress
# ... do the work ...
flowy status <task-id> done

# Explore the project graph
flowy tree subtree <project-id> --depth 3
flowy tree descendants <project-id> --relation part_of

# Check remaining work
flowy search "auth" --status draft
flowy node list --type task --status draft
```

## Output Format
All commands output JSON. Parse with `jq` or directly in your agent code.
