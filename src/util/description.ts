import { existsSync, readFileSync } from 'node:fs'

export interface DescriptionInput {
  /** Literal description text. Used verbatim — never interpreted as a path. */
  description?: string
  /**
   * Path to a file whose contents become the description.
   * Use `-` to read from stdin.
   */
  descriptionFile?: string
}

type AsyncByteSource = AsyncIterable<Uint8Array | Buffer | string>

async function readStdin(source: AsyncByteSource): Promise<string> {
  const chunks: string[] = []
  for await (const chunk of source) {
    chunks.push(
      typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'),
    )
  }
  return chunks.join('')
}

/**
 * Resolve a node description from explicit options.
 *
 * - `--description <text>` is always literal (never read as a file).
 * - `--description-file <path>` reads file contents; `-` reads stdin.
 * - Supplying both, or neither, is an error.
 */
export async function resolveDescription(
  input: DescriptionInput,
  stdin: AsyncByteSource = process.stdin,
): Promise<string> {
  const hasLiteral = input.description != null
  const hasFile = input.descriptionFile != null

  if (hasLiteral && hasFile) {
    throw new Error(
      'Pass only one of --description or --description-file, not both.',
    )
  }

  if (hasLiteral) {
    return input.description as string
  }

  if (hasFile) {
    const path = input.descriptionFile as string
    if (path === '-') {
      return readStdin(stdin)
    }
    if (!existsSync(path)) {
      throw new Error(`--description-file not found: ${path}`)
    }
    return readFileSync(path, 'utf-8')
  }

  throw new Error(
    'A description is required: pass --description or --description-file.',
  )
}
