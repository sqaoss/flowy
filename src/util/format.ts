export function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

/**
 * Map a GraphQL `extensions.code` (or transport code) to a distinct process
 * exit code so callers can branch on failure class:
 *   1 — usage / validation / conflict (default)
 *   2 — not found
 *   3 — server error (non-2xx, masked, non-JSON)
 *   4 — network / transport (timeout, connection failure)
 */
function exitCodeFor(code: string | undefined): number {
  switch (code) {
    case 'NOT_FOUND':
      return 2
    case 'SERVER_ERROR':
      return 3
    case 'NETWORK_ERROR':
      return 4
    default:
      return 1
  }
}

export function outputError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const rawCode =
    error instanceof Error ? (error as { code?: unknown }).code : undefined
  const code = typeof rawCode === 'string' ? rawCode : undefined
  console.error(
    JSON.stringify(code ? { error: message, code } : { error: message }),
  )
  process.exit(exitCodeFor(code))
}
