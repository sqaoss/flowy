import { getConfig } from './config.ts'

export interface GraphqlOptions {
  /** Per-request timeout in milliseconds. Default 15s. */
  timeoutMs?: number
  /** Max retry attempts on transient transport failures. Default 2. */
  retries?: number
  /** Base backoff delay in milliseconds (exponential). Default 300ms. */
  retryDelayMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_RETRIES = 2
const DEFAULT_RETRY_DELAY_MS = 300

/** HTTP statuses worth retrying — transient server/proxy conditions. */
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504])

type CodedError = Error & { code?: string }

function codedError(message: string, code: string): CodedError {
  const err = new Error(message) as CodedError
  err.code = code
  return err
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

export async function graphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  options: GraphqlOptions = {},
): Promise<T> {
  const { apiUrl, apiKey } = getConfig()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = options.retries ?? DEFAULT_RETRIES
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const body = JSON.stringify({ query, variables })

  let lastError: CodedError | undefined

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response
    try {
      res = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      // Network-layer failure: DNS, connection refused, or our timeout abort.
      const message = isAbortError(error)
        ? `Request timed out after ${timeoutMs}ms`
        : `Network request failed: ${
            error instanceof Error ? error.message : String(error)
          }`
      lastError = codedError(message, 'NETWORK_ERROR')
      if (attempt < retries) {
        await sleep(retryDelayMs * 2 ** attempt)
        continue
      }
      throw lastError
    }

    // HTTP-level (non-2xx) failure — handled before attempting to parse JSON,
    // so proxy HTML / empty bodies never crash with a SyntaxError.
    if (!res.ok) {
      if (TRANSIENT_STATUSES.has(res.status) && attempt < retries) {
        lastError = codedError(
          `Server returned HTTP ${res.status}`,
          'SERVER_ERROR',
        )
        await sleep(retryDelayMs * 2 ** attempt)
        continue
      }
      const snippet = (await readBody(res)).trim().slice(0, 200)
      const detail = snippet ? `: ${snippet}` : ''
      throw codedError(
        `Server returned HTTP ${res.status}${detail}`,
        'SERVER_ERROR',
      )
    }

    type GraphqlBody = {
      data?: T
      errors?: Array<{ message: string; extensions?: { code?: string } }>
    }
    let json: GraphqlBody
    try {
      json = (await res.json()) as GraphqlBody
    } catch {
      const snippet = (await readBody(res)).trim().slice(0, 200)
      const detail = snippet ? `: ${snippet}` : ''
      throw codedError(
        `Server returned a non-JSON response${detail}`,
        'SERVER_ERROR',
      )
    }

    if (json.errors?.length) {
      const error = json.errors[0]
      const code = error?.extensions?.code

      if (code === 'SUBSCRIPTION_REQUIRED') {
        throw new Error(
          'An active subscription is required. Run `flowy billing checkout` to subscribe.',
        )
      }
      if (code === 'SUBSCRIPTION_EXPIRED') {
        throw new Error(
          'Your subscription has expired. Run `flowy billing checkout` to renew.',
        )
      }
      if (code === 'SUBSCRIPTION_SUSPENDED') {
        throw new Error(
          'Your subscription is suspended. Please contact support to resolve this.',
        )
      }

      const err = new Error(error?.message) as CodedError
      if (code) err.code = code
      throw err
    }

    return json.data as T
  }

  // Exhausted retries on a transient condition.
  throw lastError ?? codedError('Request failed after retries', 'NETWORK_ERROR')
}
