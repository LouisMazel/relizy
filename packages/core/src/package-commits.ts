import type { CoreLogger, GitCommit, PrivatePackages, ReadPackage, SemverBumpType } from './types'
import { relative, sep } from 'node:path'
import { getCommitCatalogChanges, prefetchCatalogChanges, referencesCatalogEntries } from './catalogs'
import { parseCommits } from './commits'
import { runGitSync } from './git-exec'
import { getGitDiff, parseNameStatus } from './git-refs'
import { getPackageJsonHistory, getPreviousPackagePaths } from './moved-packages'
import { NEW_PACKAGE_MARKER } from './tags'
import { readPackageJson, readPackages } from './workspace'

/**
 * The paths of each `--name-status` line of a commit body: `getGitDiff` runs
 * `git log --name-status`, so the body carries lines like `M\tpath/to/file`,
 * and `R100\told\tnew` for renames and copies.
 */
function getNameStatusPaths(commit: GitCommit): string[][] {
  return parseNameStatus(commit.body).map(entry => entry.paths)
}

/**
 * Extract the changed file paths (POSIX) from a commit body (renames/copies:
 * the new path, the last field of their `--name-status` line). The commit must
 * come from `getGitDiff`, whose body carries the `--name-status` list.
 *
 * @param commit - A commit read with its `--name-status` list in the body
 * @returns One path per changed file; empty when the body has no such line
 * @example
 * ```ts
 * getCommitChangedFiles({ ...commit, body: 'M\tsrc/a.ts\nR100\told/b.ts\tnew/b.ts' })
 * // ['src/a.ts', 'new/b.ts']
 * ```
 */
export function getCommitChangedFiles(commit: GitCommit): string[] {
  return getNameStatusPaths(commit).map(paths => paths[paths.length - 1]!)
}

function isUnderPath(file: string, directory: string): boolean {
  return file === directory || file.startsWith(`${directory}/`)
}

/**
 * True when the commit changes a file of the package directory (POSIX, relative
 * to the repository). Both paths of a rename or a copy count, so a file moved
 * out of the package still belongs to its history. The directory is compared as
 * a whole: `packages/components` does not match `packages/components-mcp/...`.
 * The former directories of the package (`previousPaths`, see
 * `getPreviousPackagePaths`) count as the package directory.
 *
 * @param commit - A commit read with its `--name-status` list in the body
 * @param packageRelativePath - Directory of the package (POSIX, relative to the repository)
 * @param previousPaths - Former directories of the package (default: none)
 * @returns True when the commit touches the package
 * @example
 * ```ts
 * // body: 'M\tpackages/components-mcp/a.ts'
 * isCommitInPackage(commit, 'packages/components') // false
 * isCommitInPackage(commit, 'packages/components-mcp') // true
 * ```
 */
export function isCommitInPackage(commit: GitCommit, packageRelativePath: string, previousPaths: string[] = []): boolean {
  const directories = [packageRelativePath, ...previousPaths]

  return getNameStatusPaths(commit).some(paths => paths.some(file => directories.some(directory => isUnderPath(file, directory))))
}

/**
 * Whether a commit of the given type is kept: the `chore(deps)` and
 * `chore(release)` commits are not (unless breaking), a type given as an
 * object is kept when it triggers a bump (`semver`) or, with `changelog`, when
 * it has a `title`, a boolean type is kept as is, an unknown type is not.
 *
 * @param options - The options
 * @param options.commit - The parsed commit
 * @param options.type - The configuration of the commit type: an object with `title` and optional `semver`, a boolean, or undefined for an unknown type
 * @param options.changelog - Whether the types with a `title` only (no bump) count
 * @returns True when the commit is kept
 * @example
 * ```ts
 * isAllowedCommit({ commit, type: { title: 'Features', semver: 'minor' }, changelog: false }) // true
 * isAllowedCommit({ commit, type: { title: 'Docs' }, changelog: false }) // false
 * isAllowedCommit({ commit, type: undefined, changelog: true }) // false
 * ```
 */
export function isAllowedCommit({
  commit,
  type,
  changelog,
}: {
  commit: GitCommit
  type?: { title: string, semver?: SemverBumpType } | boolean
  changelog: boolean
}): boolean {
  if (
    commit.type === 'chore'
    && ['deps', 'release'].includes(commit.scope)
    && !commit.isBreaking
  ) {
    return false
  }

  if (typeof type === 'object') {
    return !!type.semver || (changelog && !!type.title)
  }

  if (typeof type === 'boolean') {
    return type
  }

  return false
}

/**
 * Get the first commit hash that touched a specific package directory, or one
 * of its former directories (see `getPreviousPackagePaths`).
 * This is used for new packages without tags to avoid ENOBUFS errors
 * when using the first commit of the entire repo.
 */
function getFirstPackageCommitHash(packagePath: string, cwd: string, movedPackages?: Record<string, string>, logger?: CoreLogger): string | null {
  const relativePath = relative(cwd, packagePath).split(sep).join('/')
  const previousPaths = relativePath
    ? getPreviousPackagePaths({
        packagePath: relativePath,
        commits: getPackageJsonHistory(relativePath, cwd),
        movedPackages,
        cwd,
      })
    : []

  try {
    // Get the oldest commit that touched this package directory
    const hash = runGitSync([
      'log',
      '--reverse',
      '--format=%H',
      '--',
      relativePath,
      ...previousPaths,
    ], { cwd }).split('\n')[0]?.trim()

    if (hash) {
      logger?.debug?.(`First commit for package at ${relativePath}: ${hash.slice(0, 8)}`)
      return hash
    }

    return null
  }
  catch {
    return null
  }
}

/**
 * Get the parent hash of a commit. Returns null for the repository root
 * commit, which has no parent.
 */
function getCommitParentHash(hash: string, cwd: string): string | null {
  try {
    const parent = runGitSync([
      'rev-parse',
      '--verify',
      '--quiet',
      `${hash}^`,
    ], { cwd })

    return parent || null
  }
  catch {
    return null
  }
}

/**
 * Resolve the commit a new package's compare link starts from: the parent of
 * the first commit that touched the package, so the link covers the whole
 * package history. Falls back to that first commit when it is the repository
 * root commit (no parent). Returns null when the package has no commits yet.
 *
 * @param packagePath - Absolute directory of the package
 * @param cwd - Root of the repository, where git is run
 * @param movedPackages - The `monorepo.movedPackages` setting, `old path: new path`, to include the former directories
 * @param logger - Receives debug messages
 * @returns The commit hash to compare from, or null when the package has no commits or git fails
 */
export function getNewPackageCompareBase(packagePath: string, cwd: string, movedPackages?: Record<string, string>, logger?: CoreLogger): string | null {
  const firstPackageCommit = getFirstPackageCommitHash(packagePath, cwd, movedPackages, logger)

  if (!firstPackageCommit) {
    return null
  }

  return getCommitParentHash(firstPackageCommit, cwd) || firstPackageCommit
}

/**
 * How the packages of a monorepo are found and moved: the monorepo settings
 * that `getPackageCommits` reads
 */
export interface PackageCommitsMonorepo {
  /** Path globs of the released packages. A project without any is a single package */
  packages?: string[]
  /** Path globs of the packages left out */
  ignored?: string[]
  /** What to do with the private packages among `packages` */
  privatePackages?: PrivatePackages
  /** Packages moved from a directory to another, `old path: new path`, for the moves git does not detect */
  movedPackages?: Record<string, string>
}

/**
 * Relative POSIX paths of the packages released by a monorepo: those of
 * `packages` with a version, except the `ignored` ones and the private ones
 * left out by `privatePackages`. The root is not one of them.
 *
 * @param options - The options
 * @param options.cwd - Root of the repository
 * @param options.patterns - Path globs of the packages, relative to `cwd`
 * @param options.ignored - Path globs of the packages left out
 * @param options.privatePackages - What to do with the private packages
 * @param options.logger - Receives debug messages
 * @returns The directories of the packages, relative to `cwd` with `/` separators
 * @example
 * ```ts
 * resolveReleasedPackagePaths({ cwd: '/repo', patterns: ['packages/*'] })
 * // ['packages/core', 'packages/cli']
 * ```
 */
export function resolveReleasedPackagePaths({
  cwd,
  patterns,
  ignored,
  privatePackages,
  logger,
}: {
  cwd: string
  patterns?: string[]
  ignored?: string[]
  privatePackages?: PrivatePackages
  logger?: CoreLogger
}): string[] {
  const packages = readPackages({
    cwd,
    patterns,
    ignored,
    privatePackages,
    logger,
  })

  return packages
    .filter(pkg => pkg.version)
    .map(pkg => relative(cwd, pkg.path).split(sep).join('/'))
    .filter(Boolean)
}

/**
 * The conventional commits of a package between two refs. A commit belongs to
 * a package when it changes a file under its directory (or one of its former
 * directories, see `getPreviousPackagePaths`) or an entry of a catalog the
 * package references. The root package of a monorepo gets the commits of its
 * released packages, the root of a single package project gets every commit.
 * Only the commits whose type is in `types` and passes `isAllowedCommit` are
 * kept.
 *
 * `from` is a ref, or `NEW_PACKAGE_MARKER` for a package without a previous
 * release, whose first commit then starts the range.
 *
 * Side effects: runs several git commands in `cwd` (log, rev-parse, catalog
 * file reads at the commits) and reads `package.json` files.
 *
 * @param options - The options
 * @param options.pkg - The package to read the commits of
 * @param options.from - Start ref (excluded), or `NEW_PACKAGE_MARKER` for a new package
 * @param options.to - End ref (included)
 * @param options.cwd - Root of the repository
 * @param options.types - The commit types kept, by type name
 * @param options.changelog - Whether the types with a title only (no bump) count
 * @param options.scopeMap - Renames the scopes of the commits
 * @param options.monorepo - The monorepo settings; without `packages`, the project is a single package
 * @param options.reconcileFrom - Gives the ref to start at from a `from` ref, e.g. to recover from a tag a rebase left orphaned
 * @param options.logger - Receives debug messages
 * @returns The parsed commits of the package, in the order `getGitDiff` returns them; empty when a new package has no commits
 * @throws `Failed to read root package.json` when the `package.json` at `cwd` cannot be read
 * @example
 * ```ts
 * const commits = await getPackageCommits({
 *   pkg,
 *   from: 'core@1.2.0',
 *   to: 'HEAD',
 *   cwd,
 *   types: { feat: { title: 'Features', semver: 'minor' }, fix: { title: 'Fixes', semver: 'patch' } },
 *   changelog: true,
 *   monorepo: { packages: ['packages/*'] },
 * })
 * ```
 */
// eslint-disable-next-line complexity
export async function getPackageCommits({
  pkg,
  from,
  to,
  cwd,
  types,
  changelog,
  scopeMap,
  monorepo,
  reconcileFrom,
  logger,
}: {
  /** The package to read the commits of */
  pkg: ReadPackage
  /** Start ref (excluded), or `NEW_PACKAGE_MARKER` for a package without a previous release */
  from: string
  /** End ref (included) */
  to: string
  /** Root of the repository */
  cwd: string
  /** The commit types kept, with the bump they trigger or the title of their changelog section */
  types: Record<string, { title: string, semver?: SemverBumpType } | boolean | undefined>
  /** The commits of a type with a title only count too */
  changelog: boolean
  /** Renames the scopes of the commits (`{ ui: 'components' }`) */
  scopeMap?: Record<string, string>
  /** The monorepo settings; without `packages`, the project is a single package */
  monorepo?: PackageCommitsMonorepo
  /**
   * Called with a `from` ref (not `NEW_PACKAGE_MARKER`) to get the ref the
   * commits start at, e.g. to recover from a tag a rebase left orphaned
   */
  reconcileFrom?: (from: string) => Promise<string> | string
  /** Receives debug messages */
  logger?: CoreLogger
}): Promise<GitCommit[]> {
  logger?.debug?.(`Analyzing commits for ${pkg.name} since ${from} to ${to}`)

  // For new packages without any previous tags, find the first commit
  // that touched this package to avoid ENOBUFS errors.
  let actualFrom: string | undefined
  if (from === NEW_PACKAGE_MARKER) {
    const firstPackageCommit = getFirstPackageCommitHash(pkg.path, cwd, monorepo?.movedPackages, logger)
    if (!firstPackageCommit) {
      logger?.debug?.(`${pkg.name} has no commits yet, returning empty`)
      return []
    }
    logger?.debug?.(`${pkg.name} is a new package, using first package commit: ${firstPackageCommit.slice(0, 8)}`)
    // Start from the parent of the first commit to include it in the diff.
    // When that commit is the repository root commit (no parent), drop the
    // lower bound: `git log <to>` then covers the full history, which is the
    // package history anyway.
    actualFrom = getCommitParentHash(firstPackageCommit, cwd) ?? undefined
  }
  else {
    actualFrom = reconcileFrom
      ? await reconcileFrom(from)
      : from
  }

  const rawCommits = getGitDiff(actualFrom, to, cwd)
  const allCommits = parseCommits(rawCommits, { scopeMap })

  const hasBreakingChanges = allCommits.some(commit => commit.isBreaking)
  logger?.debug?.(`Has breaking changes: ${hasBreakingChanges}`)

  const rootPackage = readPackageJson(cwd, logger)

  if (!rootPackage) {
    throw new Error('Failed to read root package.json')
  }

  const isRootPackage = pkg.path === cwd || pkg.name === rootPackage.name

  const movedPackages = monorepo?.movedPackages
  const getPreviousPaths = (packagePath: string) => getPreviousPackagePaths({
    packagePath,
    commits: rawCommits,
    movedPackages,
    cwd,
  })

  const packageRelativePath = relative(cwd, pkg.path).split(sep).join('/')

  // The root of a monorepo gets the commits of its released packages only: a
  // commit changing no package (CI, scripts, an ignored or private app) releases
  // nothing. The root of a single package project gets every commit.
  const isMonorepoRoot = isRootPackage && !!monorepo?.packages?.length
  const directories = isRootPackage
    ? isMonorepoRoot
      ? resolveReleasedPackagePaths({
          cwd,
          patterns: monorepo?.packages,
          ignored: monorepo?.ignored,
          privatePackages: monorepo?.privatePackages,
          logger,
        }).map(path => ({
          path,
          previousPaths: getPreviousPaths(path),
        }))
      : []
    : [
        {
          path: packageRelativePath,
          // The commits of the former directories of a moved package belong to it
          previousPaths: getPreviousPaths(packageRelativePath),
        },
      ]

  for (const { path, previousPaths } of directories) {
    if (previousPaths.length > 0) {
      logger?.debug?.(`${path} was moved from ${previousPaths.join(', ')}: their commits belong to it`)
    }
  }

  if (directories.length > 0) {
    // The catalogs changed by the commits, read at once
    prefetchCatalogChanges({
      commits: allCommits.map(commit => ({
        hash: commit.shortHash,
        files: getCommitChangedFiles(commit),
      })),
      cwd,
    })
  }

  const commits = allCommits.filter((commit) => {
    const type = types[commit.type]

    if (!isAllowedCommit({ commit, type, changelog })) {
      return false
    }

    if (isRootPackage && !isMonorepoRoot) {
      return true
    }

    if (directories.some(({ path, previousPaths }) => isCommitInPackage(commit, path, previousPaths))) {
      return true
    }

    // A commit changing an entry of a catalog (`catalog:` dependencies) changes the packages using it
    const catalogChanges = getCommitCatalogChanges({
      hash: commit.shortHash,
      files: getCommitChangedFiles(commit),
      cwd,
    })

    const isInPackages = directories.some(({ path }) => referencesCatalogEntries({
      hash: commit.shortHash,
      packageRelativePath: path,
      entries: catalogChanges,
      cwd,
    }))

    if (!isInPackages && isRootPackage) {
      logger?.debug?.(`Commit "${commit.message}" changes no released package, excluded from root`)
    }

    return isInPackages
  })

  logger?.debug?.(`Found ${commits.length} commit(s) for ${pkg.name} from ${from} to ${to}`)

  if (commits.length > 0) {
    logger?.debug?.(`${pkg.name}: ${commits.length} commit(s) found`)
  }
  else {
    logger?.debug?.(`${pkg.name}: No commits found`)
  }

  return commits
}
