export function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

export function outputError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(JSON.stringify({ error: message }))
  process.exit(1)
}
