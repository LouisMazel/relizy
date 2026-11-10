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

/** A file that can hold dependency catalogs */
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

/**
 * The catalog entries declared by a catalog file, empty when the file is missing or invalid.
 * The keys are `<catalog>:<dependency>`, the default catalog being named `default`.
 *
 * @param file - Which catalog file the content comes from, to pick the parser (JSON for `package.json`, YAML otherwise)
 * @param content - Content of the file, undefined when it does not exist
 * @returns The entries keyed `<catalog>:<dependency>`
 * @example
 * ```ts
 * readCatalogEntries('pnpm-workspace.yaml', 'catalog:\n  vue: ^3.4.0\ncatalogs:\n  legacy:\n    vue: ^2.7.0')
 * // Map { 'default:vue' => '^3.4.0', 'legacy:vue' => '^2.7.0' }
 * ```
 */
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

/**
 * The catalog entries added, removed or changed between two versions of the catalogs.
 *
 * @param before - The entries before
 * @param after - The entries after
 * @returns The `<catalog>:<dependency>` keys whose range differs or that exist on one side only
 * @example
 * ```ts
 * getChangedCatalogEntries(new Map([['default:vue', '^3.3.0']]), new Map([['default:vue', '^3.4.0'], ['default:pinia', '^2.0.0']]))
 * // Set { 'default:vue', 'default:pinia' }
 * ```
 */
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

/**
 * The catalog a dependency specifier references: `catalog:` is the default catalog, `catalog:vue3` the `vue3` one.
 *
 * @param specifier - A version specifier, any value
 * @returns The catalog name (`default` for `catalog:`), or undefined when it is not a `catalog:` string
 * @example
 * ```ts
 * getCatalogName('catalog:') // 'default'
 * getCatalogName('catalog:vue3') // 'vue3'
 * getCatalogName('^1.0.0') // undefined
 * ```
 */
export function getCatalogName(specifier: unknown): string | undefined {
  if (typeof specifier !== 'string' || !specifier.startsWith('catalog:')) {
    return undefined
  }

  return specifier.slice('catalog:'.length).trim() || DEFAULT_CATALOG
}

/**
 * Contents of files at commits (`<revision>:<path>`), read with a single
 * `git cat-file --batch`: `undefined` for a file that does not exist there.
 * When git fails, every content is undefined.
 *
 * @param cwd - Root of the repository, where git is run
 * @param objects - The objects to read, `<revision>:<path>`
 * @returns The contents (UTF-8 strings), in the order of `objects`; `[]` for no objects. Side effect: runs `git cat-file --batch` in `cwd`
 * @example
 * ```ts
 * readFilesAtCommits(cwd, ['abc123^:pnpm-workspace.yaml', 'abc123:pnpm-workspace.yaml'])
 * // [contentBefore, contentAfter]
 * ```
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

/** A commit and the files it changed */
export interface CatalogCommit {
  /** Hash of the commit, as the revision git reads files at */
  hash: string
  /** Files changed by the commit, relative to the root of the repository */
  files: string[]
}

/**
 * Compute and cache the catalog entries changed by commits, reading every
 * catalog file they modify, before and after them, at once. The result is read
 * back with `getCommitCatalogChanges`; the commits already computed are skipped.
 * Cleared by `resetCatalogCache`.
 *
 * @param options - The options
 * @param options.commits - The commits and the files they changed
 * @param options.cwd - Root of the repository, where git is run (also part of the cache key)
 * @example
 * ```ts
 * prefetchCatalogChanges({ commits: [{ hash: 'abc123', files: ['pnpm-workspace.yaml'] }], cwd: '/repo' })
 * getCommitCatalogChanges({ hash: 'abc123', files: ['pnpm-workspace.yaml'], cwd: '/repo' }) // served from the cache
 * ```
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
 * Empty for a commit that does not modify any catalog file. The result is
 * cached by repository and commit.
 *
 * @param options - The options
 * @param options.hash - Hash of the commit
 * @param options.files - Files changed by the commit, relative to the root of the repository
 * @param options.cwd - Root of the repository, where git is run
 * @returns The changed `<catalog>:<dependency>` keys; runs git on a cache miss (a root commit has no `<hash>^`, so its before side reads as empty)
 * @example
 * ```ts
 * getCommitCatalogChanges({ hash: 'abc123', files: ['pnpm-workspace.yaml'], cwd: '/repo' })
 * // Set { 'default:vue' }
 * ```
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
 *
 * @param options - The options
 * @param options.hash - Hash of the commit
 * @param options.packageRelativePath - Directory of the package (POSIX, relative to the repository)
 * @param options.entries - The changed `<catalog>:<dependency>` keys, see `getCommitCatalogChanges`
 * @param options.cwd - Root of the repository, where git is run
 * @returns True when the package references one of the entries; false when `entries` is empty or the `package.json` is missing or invalid
 * @example
 * ```ts
 * referencesCatalogEntries({ hash: 'abc123', packageRelativePath: 'packages/app', entries: new Set(['default:vue']), cwd: '/repo' })
 * // true when packages/app/package.json has "vue": "catalog:" at that commit
 * ```
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

/**
 * Forget the catalog changes computed by `prefetchCatalogChanges` (for
 * long-lived processes, where the repository changes between runs).
 */
export function resetCatalogCache(): void {
  changedEntriesCache.clear()
}
