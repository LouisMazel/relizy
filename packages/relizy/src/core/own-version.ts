import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * The directory of the running relizy, the one of its `package.json`: none
 * when it is not found (relizy bundled in another program)
 */
export function findOwnRoot(from: string = HERE): string | undefined {
  let directory = from

  for (;;) {
    const file = join(directory, 'package.json')

    if (existsSync(file) && (JSON.parse(readFileSync(file, 'utf8')) as { name?: string }).name === 'relizy') {
      return directory
    }

    const parent = dirname(directory)

    if (parent === directory) {
      return undefined
    }

    directory = parent
  }
}

/**
 * Version of the running relizy, read at runtime from its `package.json`: the
 * release bumps the version after the build, so a version inlined at build
 * time would be outdated.
 */
export function readOwnVersion(from: string = HERE): string {
  const root = findOwnRoot(from)
  const version = root
    ? (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: string }).version
    : undefined

  return version || '0.0.0'
}

/**
 * The entry of the running relizy, what a config importing `relizy` gets: its
 * build, or its sources when it runs from them. None when its directory is not found.
 */
export function getOwnEntry(from: string = HERE): string | undefined {
  const root = findOwnRoot(from)

  if (!root) {
    return undefined
  }

  return relative(root, from).split(sep)[0] === 'src'
    ? join(root, 'src', 'index.ts')
    : join(root, 'dist', 'index.mjs')
}

type ExportTarget = string | { import?: string, default?: string } | null

/**
 * What a config importing relizy gets: `relizy` and each subpath its
 * `package.json` exports (`relizy/cli`) point to the running relizy, whatever
 * the project installs. None when the running relizy is not found, or its
 * build is missing (relizy bundled in another program): the config then gets
 * the relizy of the project, as any import.
 */
export function getOwnImportAliases(from: string = HERE): Record<string, string> {
  const root = findOwnRoot(from)
  const entry = getOwnEntry(from)

  if (!root || !entry || !existsSync(entry)) {
    return {}
  }

  const { exports = {} } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { exports?: Record<string, ExportTarget> }
  const aliases: Record<string, string> = { relizy: entry }

  for (const [subpath, target] of Object.entries(exports)) {
    const file = typeof target === 'string'
      ? target
      : target?.import ?? target?.default

    // `.` is the entry, a pattern (`./*`) has no single file
    if (subpath === '.' || !subpath.startsWith('./') || subpath.includes('*') || !file || !existsSync(join(root, file))) {
      continue
    }

    aliases[`relizy/${subpath.slice(2)}`] = join(root, file)
  }

  return aliases
}
