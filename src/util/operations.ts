/**
 * Canonical GraphQL operations the Flowy CLI sends.
 *
 * Every operation the CLI relies on lives here, copied verbatim from the
 * command that issues it. Commands import these constants instead of inlining
 * the query/mutation text, so there is a single source of truth for the
 * contract the CLI expects a backend to satisfy.
 *
 * Two consumers share this module:
 *   1. `src/commands/*.ts` — the runtime CLI commands.
 *   2. `server/src/contract.test.ts` — the contract guard that executes each
 *      operation against the bundled local server and asserts it is satisfied.
 *
 * If the bundled local server (or the SaaS server) renames an operation, a
 * field, or an argument the CLI uses, the contract test fails — catching drift
 * before it ships. See `server/src/contract.test.ts` for the documented list
 * of intentional local/SaaS divergences (SaaS-only `whoami`, `register`,
 * `rotateApiKey`, `createCheckout`, `auditLog`, `ancestors`).
 */

// --- Nodes: read --------------------------------------------------------------

/** project.ts `show`, feature.ts `show` — fetch a single node by id. */
export const GET_NODE = `query GetNode($id: String!) {
  node(id: $id) {
    id type title description status metadata createdAt updatedAt
  }
}`

/** project.ts `show` — same shape as GET_NODE, distinct operation name. */
export const GET_PROJECT = `query GetProject($id: String!) {
  node(id: $id) {
    id type title description status metadata createdAt updatedAt
  }
}`

/** project.ts `set` — list nodes of a type, minimal fields for name matching. */
export const LIST_PROJECTS_FOR_SET = `query ListProjects($type: String) {
  nodes(type: $type) {
    id title
  }
}`

/** project.ts `list` — list nodes of a type with display fields. */
export const LIST_PROJECTS = `query ListProjects($type: String) {
  nodes(type: $type) {
    id type title description status createdAt updatedAt
  }
}`

/** task.ts `list --all` — every node of a type. */
export const ALL_TASKS = `query AllTasks($type: String!) {
  nodes(type: $type) {
    id type title status createdAt
  }
}`

/** feature.ts `list` — direct children via relation, full display fields. */
export const DESCENDANTS = `query Descendants($nodeId: String!, $relation: String, $maxDepth: Int) {
  descendants(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
    id type title description status createdAt updatedAt
  }
}`

/** feature.ts `set` — direct children via relation, brief fields for matching. */
export const DESCENDANTS_BRIEF = `query Descendants($nodeId: String!, $relation: String, $maxDepth: Int) {
  descendants(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
    id type title status
  }
}`

/** task.ts `list` (active feature) — children with status only. */
export const LIST_TASKS = `query ListTasks($nodeId: String!, $relation: String!, $maxDepth: Int) {
  descendants(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
    id type title status createdAt
  }
}`

/** tree.ts — subtree from any root, filtered to one relation (default part_of),
 *  each node annotated with parentId/depth/relation. */
export const SUBTREE = `query Subtree($nodeId: String!, $relation: String, $maxDepth: Int) {
  subtree(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
    id type title status parentId depth relation
  }
}`

/** task.ts `list --ready` — actionable tasks (server-side dependency logic). */
export const READY_TASKS = `query ReadyTasks($projectId: String) {
  readyTasks(projectId: $projectId) {
    id type title status createdAt
  }
}`

/** task.ts `show` — node plus its incoming/outgoing `blocks` edges. */
export const SHOW_TASK = `query ShowTask($id: String!) {
  node(id: $id) {
    id type title description status metadata createdAt updatedAt
  }
  blockedBy: edges(nodeId: $id, relation: "blocks", direction: "incoming") {
    id type title status
  }
  blocks: edges(nodeId: $id, relation: "blocks", direction: "outgoing") {
    id type title status
  }
}`

/** task.ts `deps` — incoming/outgoing `blocks` edges only. */
export const TASK_DEPS = `query TaskDeps($id: String!) {
  blockedBy: edges(nodeId: $id, relation: "blocks", direction: "incoming") {
    id type title status
  }
  blocks: edges(nodeId: $id, relation: "blocks", direction: "outgoing") {
    id type title status
  }
}`

/** search.ts — full-text search with optional type/status/limit filters. */
export const SEARCH = `query Search($query: String!, $type: String, $status: String, $limit: Int) {
  search(query: $query, type: $type, status: $status, limit: $limit) {
    id type title description status
  }
}`

// --- Nodes: write -------------------------------------------------------------

/** project.ts `create`, init.ts — create a node by type/title. */
export const CREATE_PROJECT = `mutation CreateProject($type: String!, $title: String!) {
  createNode(type: $type, title: $title) {
    id type title description status metadata createdAt updatedAt
  }
}`

/** feature.ts `create` — create a node with a description. */
export const CREATE_NODE = `mutation CreateNode($type: String!, $title: String!, $description: String) {
  createNode(type: $type, title: $title, description: $description) {
    id type title description status createdAt updatedAt
  }
}`

/** task.ts `create` — create a task node. */
export const CREATE_TASK = `mutation CreateTask($type: String!, $title: String!, $description: String) {
  createNode(type: $type, title: $title, description: $description) {
    id type title description status createdAt
  }
}`

/** project/feature/task `update` — title/description/metadata. */
export const UPDATE_NODE = `mutation UpdateNode($id: String!, $title: String, $description: String, $metadata: String) {
  updateNode(id: $id, title: $title, description: $description, metadata: $metadata) {
    id type title description status metadata createdAt updatedAt
  }
}`

/** status.ts — status-only shorthand update. */
export const UPDATE_STATUS = `mutation UpdateStatus($id: String!, $status: String) {
  updateNode(id: $id, status: $status) {
    id type title status updatedAt
  }
}`

/** approve.ts — promote a pending_review node to approved. */
export const APPROVE_NODE = `mutation ApproveNode($id: String!) {
  approveNode(id: $id) { id type title status updatedAt }
}`

/** project/feature/task `delete` — remove a node (and its edges). */
export const DELETE_NODE = `mutation DeleteNode($id: String!) {
  deleteNode(id: $id)
}`

// --- Edges --------------------------------------------------------------------

/** feature.ts `create` — link feature under project. */
export const CREATE_EDGE = `mutation CreateEdge($sourceId: String!, $targetId: String!, $relation: String!) {
  createEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation) {
    sourceId targetId relation createdAt
  }
}`

/** task.ts `create` — link task under feature (no createdAt selected). */
export const LINK_TASK = `mutation LinkTask($sourceId: String!, $targetId: String!, $relation: String!) {
  createEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation) {
    sourceId targetId relation
  }
}`

/** task.ts `block` — create a `blocks` edge between two tasks. */
export const BLOCK_TASK = `mutation BlockTask($sourceId: String!, $targetId: String!, $relation: String!) {
  createEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation) {
    sourceId targetId relation createdAt
  }
}`

/** task.ts `unblock` — remove a `blocks` edge. */
export const UNBLOCK_TASK = `mutation UnblockTask($sourceId: String!, $targetId: String!, $relation: String!) {
  removeEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation)
}`

// --- Import / export ----------------------------------------------------------

/** import.ts — read existing nodes of a type to dedup by client-key. */
export const IMPORT_EXISTING = `query ImportExisting($type: String) {
  nodes(type: $type) { id type title metadata }
}`

/** import.ts — outgoing edges of a node, used to dedup edge creation. */
export const IMPORT_EDGES = `query ImportEdges($nodeId: String!, $relation: String!) {
  edges(nodeId: $nodeId, relation: $relation, direction: "outgoing") { id }
}`

/** import.ts — create a node (full arg surface incl. status/metadata). */
export const IMPORT_CREATE = `mutation ImportCreate($type: String!, $title: String!, $description: String, $status: String, $metadata: String) {
  createNode(type: $type, title: $title, description: $description, status: $status, metadata: $metadata) { id }
}`

/** import.ts — update a node (full arg surface incl. status/metadata). */
export const IMPORT_UPDATE = `mutation ImportUpdate($id: String!, $title: String, $description: String, $status: String, $metadata: String) {
  updateNode(id: $id, title: $title, description: $description, status: $status, metadata: $metadata) { id }
}`

/** import.ts — create an edge during materialization. */
export const IMPORT_EDGE = `mutation ImportEdge($sourceId: String!, $targetId: String!, $relation: String!) {
  createEdge(sourceId: $sourceId, targetId: $targetId, relation: $relation) { sourceId targetId relation }
}`

/** export.ts — fetch the root project node. */
export const EXPORT_PROJECT = `query ExportProject($id: String!) {
  node(id: $id) { id type title description status metadata }
}`

/** export.ts — all descendants of the project for the dump. */
export const EXPORT_DESCENDANTS = `query ExportDescendants($nodeId: String!, $relation: String, $maxDepth: Int) {
  descendants(nodeId: $nodeId, relation: $relation, maxDepth: $maxDepth) {
    id type title description status metadata
  }
}`

/** export.ts — outgoing edges of a node, read back through the edge model. */
export const EXPORT_EDGES = `query ExportEdges($nodeId: String!, $relation: String!) {
  edges(nodeId: $nodeId, relation: $relation, direction: "outgoing") {
    id metadata
  }
}`

// --- SaaS-only operations (NOT served by the bundled local server) ------------
//
// These belong to the hosted `flowy-saas` backend (auth, billing, audit). The
// bundled local server intentionally does not implement them — see the
// divergence list in `server/src/contract.test.ts`. They are exported here so
// the CLI commands share the same single source of truth and the SaaS contract
// test (flowy-saas `test/helpers/cli-queries.ts`) can mirror them.

/** setup.ts remote — register a hosted account. */
export const REGISTER = `mutation Register($email: String!, $tier: String) {
  register(email: $email, tier: $tier) {
    user { id email tier createdAt graceEndsAt }
    apiKey
    checkoutUrl
  }
}`

/** whoami.ts — current hosted user. */
export const WHOAMI = `query Whoami {
  whoami {
    id email tier createdAt graceEndsAt
  }
}`

/** key.ts — rotate the hosted API key. */
export const ROTATE_API_KEY = `mutation RotateApiKey {
  rotateApiKey {
    user { id email tier createdAt graceEndsAt }
    apiKey
  }
}`

/** billing.ts — create a checkout session for a tier. */
export const CREATE_CHECKOUT = `mutation CreateCheckout($tier: String!) {
  createCheckout(tier: $tier) {
    url
  }
}`

/**
 * Operations the bundled local server is contractually required to satisfy.
 * The contract test executes each of these against a live local server.
 */
export const LOCAL_CONTRACT_OPERATIONS = {
  GET_NODE,
  GET_PROJECT,
  LIST_PROJECTS_FOR_SET,
  LIST_PROJECTS,
  ALL_TASKS,
  DESCENDANTS,
  DESCENDANTS_BRIEF,
  LIST_TASKS,
  SUBTREE,
  READY_TASKS,
  SHOW_TASK,
  TASK_DEPS,
  SEARCH,
  CREATE_PROJECT,
  CREATE_NODE,
  CREATE_TASK,
  UPDATE_NODE,
  UPDATE_STATUS,
  APPROVE_NODE,
  DELETE_NODE,
  CREATE_EDGE,
  LINK_TASK,
  BLOCK_TASK,
  UNBLOCK_TASK,
  IMPORT_EXISTING,
  IMPORT_EDGES,
  IMPORT_CREATE,
  IMPORT_UPDATE,
  IMPORT_EDGE,
  EXPORT_PROJECT,
  EXPORT_DESCENDANTS,
  EXPORT_EDGES,
} as const

/**
 * SaaS-only operations the bundled local server intentionally does NOT serve.
 * Documented here so the divergence is explicit and discoverable.
 */
export const SAAS_ONLY_OPERATIONS = {
  REGISTER,
  WHOAMI,
  ROTATE_API_KEY,
  CREATE_CHECKOUT,
} as const
