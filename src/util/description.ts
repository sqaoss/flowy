import { existsSync, readFileSync } from 'node:fs'

export async function resolveDescription(value: string): Promise<string> {
  if (existsSync(value)) {
    return readFileSync(value, 'utf-8')
  }
  return value
}
