import type { LogLevel } from '@maz-ui/node'
import type { GitCommit, ChangelogConfig as IChangelogConfig, SemverBumpType } from 'changelogen'
import type { ReleaseType } from 'semver'
import type { ResolvedRelizyConfig, RootPackage } from './core'

export type VersionMode = 'unified' | 'independent' | 'selective'
export type GitProvider = 'github' | 'gitlab'
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

/**
 * PACAKGE TYPES
 */
export interface ReadPackage {
  /**
   * Package name
   */
  name: string
  /**
   * Package path
   */
  path: string
  /**
   * Current version
   */
  version: string
  /**
   * Package path
   */
  private: boolean
}

export interface PackageBase extends ReadPackage {
  /**
   * From tag
   */
  fromTag: string
  /**
   * Commits
   */
  commits: GitCommit[]
  /**
   * New version
   */
  newVersion?: string
  /**
   * Dependencies
   */
  dependencies: string[]
  /**
   * Reason for bumping
   */
  reason?: 'commits' | 'dependency' | 'graduation'
  /**
   * Dependency chain
   */
  dependencyChain?: string[]
}

/**
 * OTHERS
 */

export interface PublishResponse {
  publishedPackages: PackageBase[]
}

export interface BumpResultTruthy {
  /**
   * Old version
   */
  oldVersion?: string
  /**
   * New version
   */
  newVersion?: string
  /**
   * Tag name
   */
  fromTag?: string
  /**
   * Root package
   */
  rootPackage?: RootPackage
  /**
   * Bumped packages
   */
  bumpedPackages: (PackageBase & {
    oldVersion: string
  })[]
  /**
   * Bumped
   */
  bumped: true
}
export interface BumpResultFalsy {
  /**
   * Bumped
   */
  bumped: false
}
export type BumpResult = BumpResultTruthy | BumpResultFalsy

export interface PostedRelease {
  /**
   * Release name
   */
  name: string
  /**
   * Release tag
   */
  tag: string
  /**
   * Is prerelease
   */
  prerelease: boolean
  /**
   * Release version
   */
  version: string
}

export interface MonorepoConfig {
  /**
   * Version mode for the monorepo.
   */
  versionMode: VersionMode
  /**
   * Glob pattern matching for packages to bump.
   */
  packages: string[]
  /**
   * Package names to ignore.
   * @default []
   */
  ignorePackageNames?: string[]
}

export type ConfigType = {
  /**
   * Title
   */
  title: string
  /**
   * Semver bump type
   */
  semver?: SemverBumpType
} | boolean

export interface BumpConfig {
  /**
   * Release type (e.g. 'major', 'minor', 'patch', 'prerelease', 'prepatch', 'preminor', 'premajor')
   * @default 'release'
   */
  type?: ReleaseType
  /**
   * Prerelease identifier (e.g. 'beta', 'alpha')
   */
  preid?: string
  /**
   * Check if there are any changes to commit before bumping.
   * @default true
   */
  clean?: boolean
  /**
   * Include dependencies when bumping.
   * @default ['dependencies']
   */
  dependencyTypes?: ('dependencies' | 'devDependencies' | 'peerDependencies')[]
  /**
   * Skip confirmation prompt about bumping packages
   * @default true
   */
  yes?: boolean
}

export interface BumpOptions extends BumpConfig {
  /**
   * Run without side effects
   * @default false
   */
  dryRun?: boolean
  /**
   * Use custom config
   */
  config?: ResolvedRelizyConfig
  /**
   * Set log level
   */
  logLevel?: LogLevel
  /**
   * Bump all packages even if there are no commits
   * @default false
   */
  force?: boolean
  /**
   * Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)
   * @default 'relizy'
   */
  configName?: string
  /**
   * Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)
   */
  suffix?: string
}

export interface ChangelogConfig {
  /**
   * Command to format the changelog (e.g. `prettier --write CHANGELOG.md`).
   */
  formatCmd?: string
  /**
   * Generate changelog at root level with all changes
   * @default true
   */
  rootChangelog?: boolean
  /**
   * Include commit body in the changelog.
   * @default true
   */
  includeCommitBody?: boolean
}
export interface ChangelogOptions extends ChangelogConfig {
  /**
   * Start tag
   */
  from?: string
  /**
   * End tag
   */
  to?: string
  /**
   * Run without side effects
   * @default false
   */
  dryRun?: boolean
  /**
   * Bump result
   */
  bumpResult?: BumpResultTruthy
  /**
   * Use custom config
   */
  config?: ResolvedRelizyConfig
  /**
   * Set log level
   */
  logLevel?: LogLevel
  /**
   * Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)
   * @default 'relizy'
   */
  configName?: string
  /**
   * Generate changelog for all packages even if there are no commits
   * @default false
   */
  force: boolean
  /**
   * Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)
   */
  suffix?: string
}

export interface ProviderReleaseOptions {
  /**
   * Start tag
   */
  from?: string
  /**
   * End tag
   */
  to?: string
  /**
   * Git token (GitHub or GitLab)
   */
  token?: string
  /**
   * Use custom config
   */
  config?: ResolvedRelizyConfig
  /**
   * Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)
   * @default 'relizy'
   */
  configName?: string
  /**
   * Git provider
   * @default 'github'
   */
  provider?: GitProvider
  /**
   * Bump result
   */
  bumpResult?: BumpResultTruthy
  /**
   * Set log level
   */
  logLevel?: LogLevel
  /**
   * Run without side effects
   * @default false
   */
  dryRun?: boolean
  /**
   * Skip safety check
   * @default false
   */
  safetyCheck?: boolean
  /**
   * Generate changelog for all packages even if there are no commits
   * @default false
   */
  force: boolean
  /**
   * Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)
   */
  suffix?: string
}

export type PublishConfig = IChangelogConfig['publish'] & {
  /**
   * NPM registry URL (e.g. `https://registry.npmjs.org/`)
   */
  registry?: string
  /**
   * NPM tag (e.g. `latest`)
   */
  tag?: string
  /**
   * NPM access level (e.g. `public` or `restricted`)
   */
  access?: 'public' | 'restricted'
  /**
   * NPM OTP (e.g. `123456`)
   */
  otp?: string
  /**
   * Glob pattern matching for packages to publish
   */
  packages?: string[]
  /**
   * Command to build your packages before publishing (e.g. `pnpm build`)
   */
  buildCmd?: string
}

export interface PublishOptions extends PublishConfig {
  /**
   * Run without side effects
   * @default false
   */
  dryRun?: boolean
  /**
   * Use custom config
   */
  config?: ResolvedRelizyConfig
  /**
   * Bump result
   */
  bumpResult?: BumpResultTruthy
  /**
   * Set log level
   */
  logLevel?: LogLevel
  /**
   * Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)
   * @default 'relizy'
   */
  configName?: string
  /**
   * Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)
   */
  suffix?: string
  /**
   * Bump even if there are no commits
   * @default false
   */
  force?: boolean
}

export interface ReleaseConfig {
  /**
   * Commit changes and create tag
   * @default true
   */
  commit?: boolean
  /**
   * Push changes to your repository (commit and tag(s))
   * @default true
   */
  push?: boolean
  /**
   * Generate changelog files (CHANGELOG.md)
   * @default true
   */
  changelog?: boolean
  /**
   * Publish release to your repository (github or gitlab)
   * @default true
   */
  providerRelease?: boolean
  /**
   * Publish release to your registry
   * @default true
   */
  publish?: boolean
  /**
   * Skip git verification while committing by using --no-verify flag
   * @default true
   */
  noVerify?: boolean
  /**
   * Determine if the working directory is clean and if it is not clean, exit
   * @default false
   */
  clean?: boolean
  /**
   * Create tag
   * @default true
   */
  gitTag?: boolean
}

export interface ReleaseOptions extends ReleaseConfig, BumpConfig, ChangelogConfig, PublishConfig {
  /**
   * Run without side effects
   * @default false
   */
  dryRun?: boolean
  /**
   */
  from?: string
  /**
   */
  to?: string
  /**
   */
  token?: string
  /**
   */
  logLevel?: LogLevel
  /**
   * @default 'relizy'
   */
  configName?: string
  /**
   * Bump even if there are no commits
   * @default false
   */
  force?: boolean
  /**
   * Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)
   */
  suffix?: string
  /**
   * Git provider (e.g. `github` or `gitlab`)
   * @default 'github'
   */
  provider?: GitProvider
  /**
   * Skip safety check
   * @default true
   */
  safetyCheck?: boolean
}

export interface TemplatesConfig {
  /**
   * Commit message template
   */
  commitMessage?: string
  /**
   * Tag message template
   */
  tagMessage?: string
  /**
   * Not used with "independent" version mode
   */
  tagBody?: string
  /**
   * Empty changelog content
   */
  emptyChangelogContent?: string
}

export interface RepoConfig {
  /**
   * Git domain (e.g. `github.com`)
   */
  domain?: string
  /**
   * Git repository (e.g. `user/repo`)
   */
  repo?: string
  /**
   * Git token
   */
  token?: string
  /**
   * Git provider (e.g. `github` or `gitlab`)
   * @default 'github'
   */
  provider?: GitProvider
}

export type HookType = 'before' | 'success' | 'error'
export type HookStep = 'bump' | 'changelog' | 'commit-and-tag' | 'provider-release' | 'publish' | 'push' | 'release'

/**
 * Hooks configuration
 * Useful to run custom scripts before, after a step or on error
 */
export type HookConfig = {
  [K in `${HookType}:${HookStep}`]?: string | ((config: ResolvedRelizyConfig, dryRun: boolean) => any)
} & {
  'generate:changelog'?: (config: ResolvedRelizyConfig, dryRun: boolean, params: {
    commits: GitCommit[]
    changelog: string
  }) => string | void | null | undefined | Promise<string | void | null | undefined>
}

/**
 * Relizy configuration
 * @see https://louismazel.github.io/relizy/config/overview
 */
export interface RelizyConfig extends Partial<Omit<IChangelogConfig, 'output' | 'templates' | 'publish' | 'types'>> {
  types: Record<string, {
    title: string
    semver?: SemverBumpType
  } | false>

  /**
   * Current working directory
   * @default process.cwd()
   */
  cwd?: string
  /**
   * Start tag
   */
  from?: string
  /**
   * End tag
   */
  to?: string
  /**
   * Monorepo config
   */
  monorepo?: MonorepoConfig
  /**
   * Repo config
   */
  repo?: RepoConfig
  /**
   * Templates config
   */
  templates?: TemplatesConfig
  /**
   * Bump config
   */
  bump?: BumpConfig
  /**
   * Publish config
   */
  publish?: PublishConfig
  /**
   * Changelog config
   */
  changelog?: ChangelogConfig
  /**
   * Release config
   */
  release?: ReleaseConfig
  /**
   * Hooks config
   */
  hooks?: HookConfig
  /**
   * Set log level
   * @default 'default'
   */
  logLevel?: LogLevel
  /**
   * The safety check will verify if tokens or others required for release are set (depends on the release options)
   * @default true
   */
  safetyCheck?: boolean
}
