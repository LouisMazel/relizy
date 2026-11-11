import { existsSync } from 'node:fs'
import { join, posix } from 'node:path'
import { runGitSync } from './git-exec'
import { parseNameStatus } from './git-refs'

/** A package directory moved from `from` to `to` (POSIX paths, relative to the repository) */
export interface PackageMove {
  /** Former directory of the package */
  from: string
  /** New directory of the package */
  to: string
  /** Read from the history (a renamed `package.json`), not from `monorepo.movedPackages` */
  detected: boolean
}

function normalizeDirectory(path: string): string {
  // `normalize` collapses the repeated slashes: at most one trailing slash is left
  return posix.normalize(path.replaceAll('\\', '/')).replace(/\/$/, '')
}

function isPackageJson(path: string): boolean {
  return posix.basename(path) === 'package.json' && posix.dirname(path) !== '.'
}

function readPackageName(ref: string, cwd: string): string | undefined {
  try {
    const content = runGitSync(['show', ref], { cwd })

    return (JSON.parse(content) as { name?: string }).name
  }
  catch {
    return undefined
  }
}

/**
 * An inexact rename can pair the `package.json` of two packages (one removed,
 * another added in the same commit): it is a move only when the package keeps
 * its name.
 */
function isSamePackage({ hash, from, to, cwd }: { hash: string, from: string, to: string, cwd: string }): boolean {
  const name = readPackageName(`${hash}^:${from}`, cwd)

  return name !== undefined && name === readPackageName(`${hash}:${to}`, cwd)
}

/**
 * The package directories moved by the commits. A renamed `package.json`
 * (`R<score>\told/package.json\tnew/package.json`) moves the directory of its
 * package: as is for an exact rename (`R100`), when the package keeps its name
 * for an inexact one. A file moved alone from one package to another does not.
 *
 * @param commits - Commits with their `--name-status` list as `body`; `shortHash` is needed to check the name of the package on an inexact rename
 * @param cwd - Root of the repository, where git is run
 * @returns The detected moves (`detected: true`), empty when there is none
 * @example
 * ```ts
 * getDetectedPackageMoves([{ body: 'R100\tpackages/a/package.json\tlibs/a/package.json' }], cwd)
 * // [{ from: 'packages/a', to: 'libs/a', detected: true }]
 * ```
 */
export function getDetectedPackageMoves(commits: { body: string, shortHash?: string }[], cwd: string): PackageMove[] {
  return commits.flatMap(commit => parseNameStatus(commit.body)
    .filter(entry => entry.status.startsWith('R') && entry.paths.length === 2 && entry.paths.every(isPackageJson))
    .filter(({ status, paths: [from, to] }) => status === 'R100'
      || (!!commit.shortHash && isSamePackage({
        hash: commit.shortHash,
        from: from!,
        to: to!,
        cwd,
      })))
    .map(entry => ({
      from: posix.dirname(entry.paths[0]!),
      to: posix.dirname(entry.paths[1]!),
      detected: true,
    })))
}

/**
 * The former directories of a package (POSIX, relative to the repository): the
 * moves detected in the commits, plus the ones of `monorepo.movedPackages`
 * (old path → new path), followed through the chains (`a` → `b` → `c`). The
 * commits that changed these directories belong to the package.
 *
 * A detected move is skipped when a package lives in its old directory again:
 * the commits of that directory belong to this other package.
 *
 * @param options - The options
 * @param options.packagePath - Current directory of the package (POSIX, relative to the repository)
 * @param options.commits - Commits with their `--name-status` list as `body`, to detect the moves
 * @param options.movedPackages - The `monorepo.movedPackages` setting, `old path: new path`
 * @param options.cwd - Root of the repository
 * @returns The former directories, without the current one; empty when the package never moved
 * @example
 * ```ts
 * getPreviousPackagePaths({
 *   packagePath: 'libs/a',
 *   commits: [],
 *   movedPackages: { 'packages/a': 'libs/a' },
 *   cwd,
 * })
 * // ['packages/a']
 * ```
 */
export function getPreviousPackagePaths({
  packagePath,
  commits,
  movedPackages,
  cwd,
}: {
  packagePath: string
  commits: { body: string, shortHash?: string }[]
  movedPackages?: Record<string, string>
  cwd: string
}): string[] {
  const moves: PackageMove[] = [
    ...Object.entries(movedPackages ?? {}).map(([from, to]) => ({
      from: normalizeDirectory(from),
      to: normalizeDirectory(to),
      detected: false,
    })),
    ...getDetectedPackageMoves(commits, cwd),
  ]
  const currentPath = normalizeDirectory(packagePath)
  const paths = new Set([currentPath])
  let found = true

  while (found) {
    found = false

    for (const move of moves) {
      if (!paths.has(move.to) || paths.has(move.from)) {
        continue
      }

      if (move.detected && existsSync(join(cwd, move.from, 'package.json'))) {
        continue
      }

      paths.add(move.from)
      found = true
    }
  }

  paths.delete(currentPath)

  return [...paths]
}

/**
 * The commits of the `package.json` of a package, followed through its renames
 * (`git log --follow`), with their `--name-status` list: the moves of the
 * package before its first tag. Read from `rev` (HEAD by default).
 *
 * @param packageRelativePath - Directory of the package (POSIX, relative to the repository)
 * @param cwd - Root of the repository, where git is run
 * @param rev - Revision to read the history from (default: HEAD)
 * @returns The commits, newest first, with their short hash and `--name-status` list as `body`; empty when git fails
 */
export function getPackageJsonHistory(packageRelativePath: string, cwd: string, rev?: string): { body: string, shortHash: string }[] {
  try {
    const output = runGitSync(
      [
        '--no-pager',
        'log',
        '--follow',
        '--name-status',
        '--format=%x1E%h',
        ...(rev
          ? [rev]
          : []),
        '--',
        `${packageRelativePath}/package.json`,
      ],
      { cwd, trim: false },
    )

    return output.split('\x1E').slice(1).map((record) => {
      const [shortHash = '', ...body] = record.split('\n')

      return {
        shortHash,
        body: body.join('\n'),
      }
    })
  }
  catch {
    return []
  }
}
