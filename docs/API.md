# Flowy GraphQL API Reference (local / bundled server)

This documents the GraphQL API exposed by the **bundled local server** — the one
you run with `flowy serve` in self-hosted mode. It is the API the CLI talks to
over HTTP, and the same API an agent or script can call directly.

> **Scope.** This reference covers the **local (self-hosted) server** shipped
> inside `@sqaoss/flowy` (`server/src/`). The hosted service at
> `flowy-ai.fly.dev` exposes a superset of this schema plus account/billing
> operations and subscription gating; its SDL and docs are maintained
> separately in the `flowy-saas` repo. The subscription error codes in the
> [error catalogue](#error-code-catalogue) below only ever come from the hosted
> server — the local server never emits them.

- **Endpoint:** `http://127.0.0.1:4000/graphql` (override host/port with
  `flowy serve --host <h> --port <p>`).
- **Transport:** HTTP `POST`, `Content-Type: application/json`, body
  `{ "query": "...", "variables": { ... } }`. Standard GraphQL over HTTP
  (GraphQL Yoga).
- **Auth:** none in local mode. The CLI sends a `Authorization: Bearer <key>`
  header only when an API key is configured (remote mode); the local server
  ignores it.

## Contents

- [Schema (SDL)](#schema-sdl)
- [Data model](#data-model)
- [Example operations](#example-operations)
  - [Queries](#queries)
  - [Mutations](#mutations)
- [Error-code catalogue](#error-code-catalogue)
- [Limits and validation rules](#limits-and-validation-rules)

## Schema (SDL)

The full schema is committed as a regenerable SDL file:

**[`docs/api/schema.graphql`](api/schema.graphql)**

Regenerate it from the server source at any time:

```bash
bun run sdl            # writes docs/api/schema.graphql from server/src/schema.ts
bun run sdl -- --check # verify the committed SDL is up to date (CI-friendly)
```

A condensed view:

```graphql
type Node {
  id: String!
  type: String!
  title: String!
  description: String
  status: String!
  metadata: String
  createdAt: String!
  updatedAt: String!
}

type Edge {
  sourceId: String!
  targetId: String!
  relation: String!
  createdAt: String!
}

type Query {
  node(id: String!): Node
  nodes(type: String): [Node!]!
  descendants(nodeId: String!, relation: String, maxDepth: Int): [Node!]!
  subtree(nodeId: String!, maxDepth: Int): [Node!]!
  edges(nodeId: String!, relation: String!, direction: String): [Node!]!
  readyTasks(projectId: String): [Node!]!
  search(query: String!, type: String, status: String, limit: Int): [Node!]!
}

type Mutation {
  createNode(type: String!, title: String!, description: String, status: String, metadata: String): Node!
  updateNode(id: String!, title: String, description: String, status: String, metadata: String): Node!
  approveNode(id: String!): Node!
  deleteNode(id: String!): Boolean!
  createEdge(sourceId: String!, targetId: String!, relation: String!): Edge!
  removeEdge(sourceId: String!, targetId: String!, relation: String!): Boolean!
}
```

## Data model

Everything is a **Node** connected by **Edges**. There are three node `type`s,
arranged in a strict 1-to-many hierarchy:

```
project --(part_of)--> feature --(part_of)--> task
```

`part_of` edges point **child → parent** (`sourceId` is the child, `targetId`
is the parent). The CLI's `client → project → feature → task` naming maps onto
these node types.

| Field       | Type      | Notes |
|-------------|-----------|-------|
| `id`        | `String!` | Generated as `<prefix>_<nanoid>` — `proj_`, `feat_`, `task_`, or the raw `type` for other types. |
| `type`      | `String!` | `project`, `feature`, `task`. |
| `title`     | `String!` | Required, non-empty. |
| `description` | `String` | Optional; if provided it must be non-empty. |
| `status`    | `String!` | One of the [status values](#status-values). Defaults to `draft` on create. |
| `metadata`  | `String`  | A **JSON-encoded string** (the field is `String`, not an object). Invalid JSON is rejected. |
| `createdAt` / `updatedAt` | `String!` | ISO-8601 timestamps. |

**Edge relations:** `part_of` (hierarchy) and `blocks` (dependency). These are
the only two relations `createEdge` accepts.

### Status values

`draft`, `pending_review`, `approved`, `in_progress`, `done`, `blocked`,
`cancelled`. Only a node in `pending_review` can be approved (see
`approveNode`).

## Example operations

All examples are `POST http://127.0.0.1:4000/graphql` with a JSON body. Request
shows `query` + `variables`; response shows the JSON the server returns.

### Queries

#### `node(id)` — fetch a single node

Returns the node, or `null` if it does not exist (note: `node` returns `null`
for a miss; `updateNode`/`deleteNode`/`approveNode` throw `NOT_FOUND` instead).

```jsonc
// Request
{
  "query": "query ($id: String!) { node(id: $id) { id type title status } }",
  "variables": { "id": "task_V1StGXR8_Z5j" }
}
// Response
{
  "data": {
    "node": {
      "id": "task_V1StGXR8_Z5j",
      "type": "task",
      "title": "Implement OAuth",
      "status": "in_progress"
    }
  }
}
```

#### `nodes(type)` — list nodes, optionally filtered by type

```jsonc
// Request
{
  "query": "query ($type: String) { nodes(type: $type) { id title status } }",
  "variables": { "type": "project" }
}
// Response
{ "data": { "nodes": [ { "id": "proj_abc123def456", "title": "My Project", "status": "approved" } ] } }
```

#### `search(query, type, status, limit)` — substring search over title/description

Case-insensitive `LIKE` match against `title` and `description`. The query must
be **at least 3 characters** (after trimming) or you get a `VALIDATION_ERROR`.
`limit` defaults to **50**.

```jsonc
// Request
{
  "query": "query ($q: String!, $limit: Int) { search(query: $q, limit: $limit) { id type title } }",
  "variables": { "q": "oauth", "limit": 20 }
}
// Response
{ "data": { "search": [ { "id": "task_V1StGXR8_Z5j", "type": "task", "title": "Implement OAuth" } ] } }
```

#### `subtree(nodeId, maxDepth)` — all descendants of a node

Walks `part_of` edges downward (and any other incoming edges) from `nodeId`.
`maxDepth` defaults to **100**; `maxDepth: 0` returns an empty list.

```jsonc
// Request
{
  "query": "query ($id: String!) { subtree(nodeId: $id) { id type title } }",
  "variables": { "id": "proj_abc123def456" }
}
// Response
{
  "data": {
    "subtree": [
      { "id": "feat_GHI789", "type": "feature", "title": "User Auth" },
      { "id": "task_V1StGXR8_Z5j", "type": "task", "title": "Implement OAuth" }
    ]
  }
}
```

#### `edges(nodeId, relation, direction)` — nodes connected by a relation

`direction` is `outgoing` (default) or `incoming`. For relation `blocks`,
`incoming` returns the tasks that **block** `nodeId` (its `blockedBy`);
`outgoing` returns the tasks `nodeId` **blocks**.

```jsonc
// Request — what blocks this task?
{
  "query": "query ($id: String!) { edges(nodeId: $id, relation: \"blocks\", direction: \"incoming\") { id title status } }",
  "variables": { "id": "task_V1StGXR8_Z5j" }
}
// Response
{ "data": { "edges": [ { "id": "task_blocker01", "title": "Provision DB", "status": "in_progress" } ] } }
```

#### `readyTasks(projectId)` — actionable tasks

Tasks (`type: task`) that are not `done`/`cancelled` and have **zero unfinished
blockers**. Optionally scoped to a `projectId` via the `part_of` hierarchy.
This backs `flowy task list --ready`.

```jsonc
// Request
{
  "query": "query ($p: String) { readyTasks(projectId: $p) { id title status } }",
  "variables": { "p": "proj_abc123def456" }
}
// Response
{ "data": { "readyTasks": [ { "id": "task_ready01", "title": "Write tests", "status": "draft" } ] } }
```

### Mutations

#### `createNode(type, title, description, status, metadata)`

`title` is required and non-empty. `description`, if given, must be non-empty.
`status` defaults to `draft`. `metadata` must be a JSON-encoded string.

```jsonc
// Request
{
  "query": "mutation ($type: String!, $title: String!, $desc: String) { createNode(type: $type, title: $title, description: $desc) { id type title status createdAt } }",
  "variables": { "type": "task", "title": "Implement OAuth", "desc": "Wire up the OAuth provider" }
}
// Response
{
  "data": {
    "createNode": {
      "id": "task_V1StGXR8_Z5j",
      "type": "task",
      "title": "Implement OAuth",
      "status": "draft",
      "createdAt": "2026-06-13T10:00:00.000Z"
    }
  }
}
```

#### `updateNode(id, title, description, status, metadata)`

Partial update — omitted fields are left unchanged. Throws `NOT_FOUND` if the
node does not exist. The same non-empty / valid-status / valid-JSON rules apply.

```jsonc
// Request
{
  "query": "mutation ($id: String!, $status: String) { updateNode(id: $id, status: $status) { id status updatedAt } }",
  "variables": { "id": "task_V1StGXR8_Z5j", "status": "in_progress" }
}
// Response
{ "data": { "updateNode": { "id": "task_V1StGXR8_Z5j", "status": "in_progress", "updatedAt": "2026-06-13T10:05:00.000Z" } } }
```

#### `deleteNode(id)`

Returns `true`. Throws `NOT_FOUND` if missing, and `CONFLICT` if the node still
has children (re-link or delete them first — the server does not cascade).
Deleting a node also removes its edges.

```jsonc
// Request
{ "query": "mutation ($id: String!) { deleteNode(id: $id) }", "variables": { "id": "task_V1StGXR8_Z5j" } }
// Response
{ "data": { "deleteNode": true } }
```

#### `createEdge(sourceId, targetId, relation)`

`relation` must be `part_of` or `blocks`. Both nodes must exist
(`NOT_FOUND` otherwise). A node cannot `blocks` itself.

```jsonc
// Request — task "part_of" feature
{
  "query": "mutation ($s: String!, $t: String!, $r: String!) { createEdge(sourceId: $s, targetId: $t, relation: $r) { sourceId targetId relation createdAt } }",
  "variables": { "s": "task_V1StGXR8_Z5j", "t": "feat_GHI789", "r": "part_of" }
}
// Response
{ "data": { "createEdge": { "sourceId": "task_V1StGXR8_Z5j", "targetId": "feat_GHI789", "relation": "part_of", "createdAt": "2026-06-13T10:00:00.000Z" } } }
```

#### `approveNode(id)`

Transitions a `pending_review` node to `approved`. Throws `CONFLICT` if the
node is in any other status, `NOT_FOUND` if missing.

```jsonc
// Request
{ "query": "mutation ($id: String!) { approveNode(id: $id) { id status } }", "variables": { "id": "feat_GHI789" } }
// Response
{ "data": { "approveNode": { "id": "feat_GHI789", "status": "approved" } } }
```

#### `removeEdge(sourceId, targetId, relation)`

Returns `true` if an edge was removed, `false` if no matching edge existed (it
does **not** throw on a miss).

```jsonc
// Request
{ "query": "mutation ($s: String!, $t: String!, $r: String!) { removeEdge(sourceId: $s, targetId: $t, relation: $r) }", "variables": { "s": "task_a", "t": "task_b", "r": "blocks" } }
// Response
{ "data": { "removeEdge": true } }
```

## Error-code catalogue

GraphQL errors are returned in the standard `errors[]` array, each carrying a
machine-readable code under `extensions.code`:

```jsonc
{
  "errors": [
    { "message": "Title is required", "extensions": { "code": "VALIDATION_ERROR" } }
  ]
}
```

The CLI maps each code to a **distinct process exit code** so scripts can branch
on the failure class. Codes marked _hosted only_ are emitted by the
`flowy-ai.fly.dev` service, never by the local server.

| `extensions.code` | Source | Triggered by | CLI exit code |
|-------------------|--------|--------------|:-------------:|
| `VALIDATION_ERROR` | local + hosted | Empty title/description, invalid status, invalid relation, bad metadata JSON, self-`blocks`, search query < 3 chars | **1** (usage/validation) |
| `CONFLICT` | local + hosted | Deleting a node that still has children; approving a node not in `pending_review` | **1** (usage/validation) |
| `NOT_FOUND` | local + hosted | `updateNode`/`deleteNode`/`approveNode`/`createEdge` referencing an id that doesn't exist | **2** |
| `SUBSCRIPTION_REQUIRED` | _hosted only_ | A data operation when no active subscription exists | **1** |
| `SUBSCRIPTION_EXPIRED` | _hosted only_ | Subscription lapsed | **1** |
| `SUBSCRIPTION_SUSPENDED` | _hosted only_ | Subscription suspended (billing/abuse) | **1** |
| `SERVER_ERROR` | transport | Non-2xx HTTP (after retries on 429/502/503/504), masked/HTML body, or non-JSON 200 response | **3** |
| `NETWORK_ERROR` | transport | DNS failure, connection refused, or request timeout (default 15s, 2 retries with exponential backoff) | **4** |
| _(none / other)_ | — | Any uncoded error | **1** (default) |

`SERVER_ERROR` and `NETWORK_ERROR` are produced by the CLI's transport layer
(`src/util/client.ts`), not by the GraphQL schema — they describe failures that
happen before or instead of a structured GraphQL response. The three
`SUBSCRIPTION_*` codes are recognized by the CLI and turned into a friendly
message pointing at `flowy billing checkout`.

On failure the CLI prints `{"error": "<message>", "code": "<code>"}` to
**stderr** and exits with the code above. On success it prints the result JSON
to **stdout** and exits `0`.

## Limits and validation rules

| Limit / rule | Value | Where |
|--------------|-------|-------|
| Search query minimum length | **3 characters** (after trim) | `search` — else `VALIDATION_ERROR` |
| Search result default limit | **50** | `search` `limit` arg |
| Traversal default depth | **100** | `subtree`/`descendants` `maxDepth` arg |
| Traversal `maxDepth: 0` | returns `[]` | `subtree`/`descendants` |
| Valid statuses | `draft`, `pending_review`, `approved`, `in_progress`, `done`, `blocked`, `cancelled` | create/update |
| Valid edge relations | `part_of`, `blocks` | `createEdge` |
| `title` | required, non-empty | `createNode`; non-empty if provided on `updateNode` |
| `description` | optional, but non-empty if provided | create/update |
| `metadata` | must be a valid JSON-encoded string | create/update |
| Approval | only from `pending_review` | `approveNode` |
| Delete | rejected if the node has children (`part_of`) | `deleteNode` |
| Self-block | rejected | `createEdge` with `relation: blocks` and `sourceId == targetId` |

> **Search min-length drift.** The local server enforces a 3-character minimum.
> The hosted server has historically used a different threshold; if you target
> both, treat 3 characters as the safe floor. This drift is tracked for the
> hosted-API docs in `flowy-saas`.

### Request timeouts and retries (CLI transport)

The CLI's GraphQL client (`src/util/client.ts`) applies, by default:

- **Timeout:** 15s per request (`AbortSignal.timeout`).
- **Retries:** up to 2, with exponential backoff (base 300ms), on network
  failures and transient HTTP statuses `429`, `502`, `503`, `504`.

These are client-side transport behaviors, not server limits.
