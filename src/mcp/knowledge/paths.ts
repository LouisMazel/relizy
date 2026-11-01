import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `agent-docs/` of the relizy package: next to `dist/` once built, at the root
 * of the repository from the sources. Without dependency, so that `relizy init`
 * does not load the schema of the bundle (zod is only loaded by `relizy mcp`).
 */
export function defaultBundleDir(from: string = dirname(fileURLToPath(import.meta.url))): string {
  const candidates = [resolve(from, '../agent-docs'), resolve(from, '../../agent-docs'), resolve(from, '../../../agent-docs')]

  return candidates.find(candidate => existsSync(join(candidate, 'manifest.json'))) ?? candidates[0]!
}
