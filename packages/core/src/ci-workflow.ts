import type { PackageManager } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import fastGlob from 'fast-glob'
import { tryGitSync } from './git-exec'

/**
 * Reading the CI of a project: where its workflows are, what they run, and
 * what a workflow needs to know of the repository (default branch, Node
 * version, package manager).
 */

/** The CI providers whose files are read: GitHub Actions and GitLab CI */
export type CiProvider = 'github' | 'gitlab'

/** A CI file of a project */
export interface CiFile {
  /** Relative to the root of the project */
  file: string
  /** The content of the file without its comment lines */
  code: string
}

/** The CI files of each provider */
const CI_FILES: Record<CiProvider, string[]> = {
  github: ['.github/workflows/*.{yml,yaml}'],
  gitlab: ['.gitlab-ci.yml', '.gitlab/**/*.{yml,yaml}'],
}

/**
 * The CI files of a provider (the workflows of GitHub Actions, the files of
 * GitLab CI), sorted by path, with their content without the comment lines.
 * Reads `.github/workflows/*.{yml,yaml}` for GitHub, `.gitlab-ci.yml` and
 * the `.yml` and `.yaml` files under `.gitlab/` for GitLab.
 *
 * @param cwd - The root of the project
 * @param provider - The CI provider to read
 * @returns The files found, empty when there is none
 * @example
 * ```ts
 * findCiFiles(process.cwd(), 'github')
 * // [{ file: '.github/workflows/release.yml', code: 'name: Release\non: ...' }]
 * ```
 */
export function findCiFiles(cwd: string, provider: CiProvider): CiFile[] {
  return fastGlob.sync(CI_FILES[provider], { cwd, dot: true }).sort().map(file => ({
    file,
    code: readFileSync(join(cwd, file), 'utf8').split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n'),
  }))
}

/**
 * The default branch of the repository: the one `origin` points to, else the
 * current branch, else `main`
 *
 * @param cwd - The directory of the repository
 * @returns The branch name; `main` when there is no `origin/HEAD` and HEAD is detached or unreadable
 */
export function getDefaultBranch(cwd: string): string {
  const remoteHead = (tryGitSync(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd }) ?? '').replace(/^origin\//, '')
  const current = tryGitSync(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
  return remoteHead || (current && current !== 'HEAD'
    ? current
    : 'main')
}

/**
 * The Node version file of the project (`.nvmrc` or `.node-version`, in this
 * order) and the major version it holds. Empty without file; the version is
 * omitted when the file holds no leading number (`lts/*`).
 *
 * @param cwd - The root of the project
 * @returns The file name and the major version as a string
 * @example
 * ```ts
 * getNodeVersion(cwd) // { nodeVersionFile: '.nvmrc', nodeVersion: '22' } for a file holding "v22.11.0"
 * ```
 */
export function getNodeVersion(cwd: string): { nodeVersionFile?: string, nodeVersion?: string } {
  const file = ['.nvmrc', '.node-version'].find(name => existsSync(join(cwd, name)))
  if (!file) {
    return {}
  }

  const major = /^v?(\d+)/.exec(readFileSync(join(cwd, file), 'utf8').trim())?.[1]
  return {
    nodeVersionFile: file,
    ...(major && { nodeVersion: major }),
  }
}

/**
 * Whether the `packageManager` field of the package.json names pnpm (`pnpm@...`)
 *
 * @param cwd - The root of the project
 * @returns True when it does, false otherwise or when the package.json cannot be read
 */
export function isPnpmPinned(cwd: string): boolean {
  try {
    return (JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).packageManager ?? '').startsWith('pnpm@')
  }
  catch {
    return false
  }
}

/**
 * The command installing the dependencies of a project from its lockfile, as a
 * CI job runs it
 *
 * @param options - The package manager of the project
 * @param options.packageManager - The package manager, `npm ci` for npm
 * @param options.yarnBerry - Whether yarn is Berry (2+), which uses `--immutable`
 * @returns The install command
 * @example
 * ```ts
 * getInstallDependenciesCommand({ packageManager: 'pnpm', yarnBerry: false }) // 'pnpm install --frozen-lockfile'
 * getInstallDependenciesCommand({ packageManager: 'yarn', yarnBerry: true }) // 'yarn install --immutable'
 * ```
 */
export function getInstallDependenciesCommand({ packageManager, yarnBerry }: { packageManager: PackageManager, yarnBerry: boolean }): string {
  switch (packageManager) {
    case 'pnpm':
      return 'pnpm install --frozen-lockfile'
    case 'yarn':
      return yarnBerry ? 'yarn install --immutable' : 'yarn install --frozen-lockfile'
    case 'bun':
      return 'bun install --frozen-lockfile'
    default:
      return 'npm ci'
  }
}
