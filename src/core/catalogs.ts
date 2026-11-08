import type { Buffer } from 'node:buffer'
import { posix } from 'node:path'
import { parseJSON, parseYAML } from 'confbox'
import { runGitSyncBuffer } from './git-exec'

/**
 * Catalogs of the package managers: the versions of the dependencies declared
 * once at the root and referenced with `catalog:` (the default catalog) or
 * `catalog:<name>` by the packages.
 *
 * - pnpm: `catalog` and `catalogs` of `pnpm-workspace.yaml`
 * - yarn (4.10+): `catalog` and `catalogs` of `.yarnrc.yml`
 * - bun: `catalog` and `catalogs` of the root `package.json`, or of its `workspaces` field
 */
const CATALOG_FILES = ['pnpm-workspace.yaml', '.yarnrc.yml', 'package.json'] as const

export type CatalogFile = typeof CATALOG_FILES[number]

const DEFAULT_CATALOG = 'default'

/** Fields of a `package.json` whose dependencies can reference a catalog */
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

/** Entries of the catalogs, keyed by `<catalog>:<dependency>`, with their version range */
export type CatalogEntries = Map<string, string>

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function addCatalog(entries: CatalogEntries, name: string, catalog: unknown): void {
  if (!isObject(catalog)) {
    return
  }

  for (const [dependency, range] of Object.entries(catalog)) {
    entries.set(`${name}:${dependency}`, String(range))
  }
}

function addCatalogs(entries: CatalogEntries, source: unknown): void {
  if (!isObject(source)) {
    return
  }

  addCatalog(entries, DEFAULT_CATALOG, source.catalog)

  if (isObject(source.catalogs)) {
    for (const [name, catalog] of Object.entries(source.catalogs)) {
      addCatalog(entries, name, catalog)
    }
  }
}

/** The catalog entries declared by a catalog file, empty when the file is missing or invalid */
export function readCatalogEntries(file: CatalogFile, content: string | undefined): CatalogEntries {
  const entries: CatalogEntries = new Map()

  if (!content) {
    return entries
  }

  try {
    const parsed: unknown = file === 'package.json'
      ? parseJSON(content)
      : parseYAML(content)

    addCatalogs(entries, parsed)

    if (file === 'package.json' && isObject(parsed)) {
      addCatalogs(entries, parsed.workspaces)
    }
  }
  catch {
    // An invalid file declares no catalog
  }

  return entries
}

/** The catalog entries added, removed or changed between two versions of the catalogs */
export function getChangedCatalogEntries(before: CatalogEntries, after: CatalogEntries): Set<string> {
  const changed = new Set<string>()

  for (const [key, range] of after) {
    if (before.get(key) !== range) {
      changed.add(key)
    }
  }

  for (const key of before.keys()) {
    if (!after.has(key)) {
      changed.add(key)
    }
  }

  return changed
}

/** The catalog a dependency specifier references: `catalog:` is the default catalog, `catalog:vue3` the `vue3` one */
export function getCatalogName(specifier: unknown): string | undefined {
  if (typeof specifier !== 'string' || !specifier.startsWith('catalog:')) {
    return undefined
  }

  return specifier.slice('catalog:'.length).trim() || DEFAULT_CATALOG
}

/**
 * Contents of files at commits (`<revision>:<path>`), read with a single
 * `git cat-file --batch`: `undefined` for a file that does not exist there.
 */
export function readFilesAtCommits(cwd: string, objects: string[]): (string | undefined)[] {
  if (objects.length === 0) {
    return []
  }

  let output: Buffer

  try {
    output = runGitSyncBuffer(['cat-file', '--batch'], { cwd, input: `${objects.join('\n')}\n` })
  }
  catch {
    return objects.map(() => undefined)
  }

  const contents: (string | undefined)[] = []
  let offset = 0

  for (let index = 0; index < objects.length; index++) {
    const lineEnd = output.indexOf(0x0A, offset)
    const header = output.subarray(offset, lineEnd).toString('utf8')
    const size = /^\S+ blob (\d+)$/.exec(header)?.[1]

    offset = lineEnd + 1

    if (size === undefined) {
      // `<object> missing`, or not a file (`ambiguous`, a tree...)
      contents.push(undefined)
      continue
    }

    contents.push(output.subarray(offset, offset + Number(size)).toString('utf8'))
    offset += Number(size) + 1
  }

  return contents
}

/** Content of a file at a commit, `undefined` when it does not exist there */
function readFileAtCommit(cwd: string, revision: string, file: string): string | undefined {
  return readFilesAtCommits(cwd, [`${revision}:${file}`])[0]
}

const changedEntriesCache = new Map<string, Set<string>>()

export interface CatalogCommit {
  hash: string
  /** Files changed by the commit, relative to the root of the repository */
  files: string[]
}

/**
 * Compute and cache the catalog entries changed by commits, reading every
 * catalog file they modify, before and after them, at once.
 */
export function prefetchCatalogChanges({ commits, cwd }: { commits: CatalogCommit[], cwd: string }): void {
  const pending = commits
    .map(commit => ({
      ...commit,
      catalogFiles: CATALOG_FILES.filter(file => commit.files.includes(file)),
    }))
    .filter(commit => commit.catalogFiles.length > 0 && !changedEntriesCache.has(`${cwd}\0${commit.hash}`))
  const objects = pending.flatMap(commit => commit.catalogFiles.flatMap(file => [`${commit.hash}^:${file}`, `${commit.hash}:${file}`]))
  const contents = readFilesAtCommits(cwd, objects)
  let index = 0

  for (const commit of pending) {
    const changed = new Set<string>()

    for (const file of commit.catalogFiles) {
      const before = readCatalogEntries(file, contents[index++])
      const after = readCatalogEntries(file, contents[index++])

      for (const key of getChangedCatalogEntries(before, after)) {
        changed.add(key)
      }
    }

    changedEntriesCache.set(`${cwd}\0${commit.hash}`, changed)
  }
}

/**
 * The catalog entries a commit changes, from the catalog files it modifies.
 * Empty for a commit that does not modify any catalog file.
 */
export function getCommitCatalogChanges({ hash, files, cwd }: CatalogCommit & { cwd: string }): Set<string> {
  if (!CATALOG_FILES.some(file => files.includes(file))) {
    return new Set()
  }

  prefetchCatalogChanges({
    commits: [
      { hash, files },
    ],
    cwd,
  })

  return changedEntriesCache.get(`${cwd}\0${hash}`)!
}

/**
 * `true` when the `package.json` of a package, as it was at a commit,
 * references one of the given catalog entries, in any dependency field: the
 * commit changes what the package declares, as an edit of its `package.json` would.
 */
export function referencesCatalogEntries({ hash, packageRelativePath, entries, cwd }: {
  hash: string
  packageRelativePath: string
  entries: Set<string>
  cwd: string
}): boolean {
  if (entries.size === 0) {
    return false
  }

  const content = readFileAtCommit(cwd, hash, posix.join(packageRelativePath, 'package.json'))
  let packageJson: unknown

  try {
    packageJson = content
      ? parseJSON(content)
      : undefined
  }
  catch {
    return false
  }

  if (!isObject(packageJson)) {
    return false
  }

  return DEPENDENCY_FIELDS.some((field) => {
    const dependencies = packageJson[field]

    return isObject(dependencies) && Object.entries(dependencies).some(([dependency, specifier]) => {
      const catalog = getCatalogName(specifier)

      return catalog !== undefined && entries.has(`${catalog}:${dependency}`)
    })
  })
}

/** Forget the catalog changes computed for the commits (long-lived processes) */
export function resetCatalogCache(): void {
  changedEntriesCache.clear()
}
