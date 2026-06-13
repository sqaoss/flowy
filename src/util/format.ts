export function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

export function outputError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const rawCode =
    error instanceof Error ? (error as { code?: unknown }).code : undefined
  const code = typeof rawCode === 'string' ? rawCode : undefined
  console.error(
    JSON.stringify(code ? { error: message, code } : { error: message }),
  )
  process.exit(1)
}
