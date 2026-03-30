import { getConfig } from './config.ts'

export async function graphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const { apiUrl, apiKey } = getConfig()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })

  const json = (await res.json()) as {
    data?: T
    errors?: Array<{ message: string; extensions?: { code?: string } }>
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

    throw new Error(error?.message)
  }

  return json.data as T
}
