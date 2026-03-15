export function getConfig() {
  const apiUrl = process.env.FLOWY_API_URL ?? 'https://flowy-ai.fly.dev/graphql'
  const apiKey = process.env.FLOWY_API_KEY ?? ''
  return { apiUrl, apiKey }
}
