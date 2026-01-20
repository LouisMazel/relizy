import type { LogLevel } from '@maz-ui/node'
import type { GitCommit, ChangelogConfig as IChangelogConfig, SemverBumpType } from 'changelogen'
import type { ReleaseType } from 'semver'
import type { ResolvedRelizyConfig, RootPackage } from './core'

export type VersionMode = 'unified' | 'independent' | 'selective'
export type GitProvider = 'github' | 'gitlab' | 'bitbucket'
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

export interface SocialNetworkResult {
  /**
   * Social platform name (e.g., 'twitter', 'slack')
   */
  platform: string
  /**
   * Whether the post was successful
   */
  success: boolean
  /**
   * Error message if the post failed
   */
  error?: string
}

export interface SocialResult {
  /**
   * Results for each social platform
   */
  results: SocialNetworkResult[]
  /**
   * Whether any of the social posts had errors
   */
  hasErrors: boolean
}

export interface ProviderReleaseResult {
  /**
   * Detected Git provider
   */
  detectedProvider: GitProvider
  /**
   * Posted releases
   */
  postedReleases: PostedRelease[]
  /**
   * Error message if provider release failed
   */
  error?: string
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
   * @default true
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

export interface SocialOptions {
  /**
   * Start tag
   */
  from?: string
  /**
   * End tag
   */
  to?: string
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
   * Bump result (contains release information)
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
   * @default true
   */
  safetyCheck?: boolean
}

export type PublishConfig = IChangelogConfig['publish'] & {
  /**
   * Package manager (e.g. `pnpm`, `npm`, `yarn` or `bun`)
   */
  packageManager?: PackageManager
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
  /**
   * NPM token (e.g. `123456`) - only supported for pnpm and npm
   */
  token?: string
  /**
   * Skip safety check
   * @default true
   */
  safetyCheck?: boolean
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
  /**
   * Post release announcements to social media platforms
   * @default false
   */
  social?: boolean
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
  /**
   * NPM token (e.g. "123456")
   */
  publishToken?: string
}

export interface TwitterCredentials {
  /**
   * Twitter API Key (Consumer Key)
   */
  apiKey?: string
  /**
   * Twitter API Secret (Consumer Secret)
   */
  apiKeySecret?: string
  /**
   * Twitter Access Token
   */
  accessToken?: string
  /**
   * Twitter Access Token Secret
   */
  accessTokenSecret?: string
}

export interface TwitterSocialConfig {
  /**
   * Enable Twitter posting
   * @default false
   */
  enabled?: boolean
  /**
   * Skip Twitter posting for prerelease versions (alpha, beta, rc, etc.)
   * Only stable versions will be posted to Twitter
   * @default true
   */
  onlyStable?: boolean
  /**
   * Custom message template
   * Available variables: {{projectName}}, {{version}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}
   * @default '🚀 {{projectName}} {{version}} is out!\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}'
   */
  template?: string
  /**
   * Twitter credentials (optional - falls back to environment variables)
   */
  credentials?: TwitterCredentials
  /**
   * Maximum length of the tweet
   * @default 280
   */
  postMaxLength?: number
}

export interface SlackCredentials {
  /**
   * Slack Bot Token or User OAuth Token
   * Required scopes: chat:write, chat:write.public (for public channels)
   */
  token?: string
}

export interface SlackSocialConfig {
  /**
   * Enable Slack posting
   * @default false
   */
  enabled?: boolean
  /**
   * Skip Slack posting for prerelease versions (alpha, beta, rc, etc.)
   * Only stable versions will be posted to Slack
   * @default true
   */
  onlyStable?: boolean
  /**
   * Slack channel ID or name (e.g., "#releases" or "C1234567890")
   */
  channel: string
  /**
   * Custom message template
   * Available variables: {{projectName}}, {{version}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}
   */
  template?: string
  /**
   * Slack credentials (optional - falls back to environment variables)
   */
  credentials?: SlackCredentials
}

export interface SocialConfig {
  /**
   * Twitter configuration
   */
  twitter?: TwitterSocialConfig
  /**
   * Slack configuration
   */
  slack?: SlackSocialConfig
  /**
   * URL to full changelog (e.g., https://example.com/changelog)
   * This URL will be included in social media posts to allow users to view the complete changelog
   */
  changelogUrl?: string
  // Future social platforms can be added here:
  // linkedin?: LinkedInSocialConfig
  // discord?: DiscordSocialConfig
}

export interface TwitterOptions {
  /**
   * Release information
   */
  version: string
  /**
   * Project name
   */
  projectName: string
  /**
   * Changelog content
   */
  changelog: string
  /**
   * Release URL (GitHub/GitLab)
   */
  releaseUrl?: string
  /**
   * Full changelog URL (e.g., https://example.com/changelog)
   */
  changelogUrl?: string
  /**
   * Twitter credentials (all fields required)
   */
  credentials: {
    apiKey: string
    apiKeySecret: string
    accessToken: string
    accessTokenSecret: string
  }
  /**
   * Custom Twitter message template
   */
  template: string
  /**
   * Run without side effects
   * @default false
   */
  dryRun?: boolean
  /**
   * Maximum length of the tweet
   * @default 280
   */
  postMaxLength: number
}

export interface SlackOptions {
  /**
   * Release information
   */
  version: string
  /**
   * Project name
   */
  projectName: string
  /**
   * Changelog content
   */
  changelog: string
  /**
   * Release URL (GitHub/GitLab)
   */
  releaseUrl?: string
  /**
   * Full changelog URL (e.g., https://example.com/changelog)
   */
  changelogUrl?: string
  /**
   * Slack channel ID or name
   */
  channel: string
  /**
   * Slack token (required)
   */
  token: string
  /**
   * Custom message template
   */
  template?: string
  /**
   * Run without side effects
   * @default false
   */
  dryRun?: boolean
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
  /**
   * Twitter message template
   * Available variables: {{projectName}}, {{version}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}
   * @default '🚀 {{projectName}} {{version}} is out!\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}'
   */
  twitterMessage?: string
  /**
   * Slack message template (optional - if not provided, uses rich blocks format)
   * Available variables: {{projectName}}, {{version}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}
   * @default undefined
   */
  slackMessage?: string
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
export type HookStep = 'bump' | 'changelog' | 'commit-and-tag' | 'provider-release' | 'publish' | 'push' | 'release' | 'social' | 'twitter' | 'slack'

/**
 * API tokens configuration
 */
export interface TokensConfig {
  /**
   * registry token for publishing
   * Environment variables: NPM_TOKEN, RELIZY_NPM_TOKEN, NODE_AUTH_TOKEN
   */
  registry?: string
  /**
   * GitHub token for creating releases
   * Environment variables: GITHUB_TOKEN, GH_TOKEN, RELIZY_GITHUB_TOKEN
   */
  github?: string
  /**
   * GitLab token for creating releases
   * Environment variables: GITLAB_TOKEN, GITLAB_API_TOKEN, CI_JOB_TOKEN, RELIZY_GITLAB_TOKEN
   */
  gitlab?: string
  /**
   * Twitter API credentials for posting tweets
   * Environment variables: TWITTER_API_KEY, TWITTER_API_KEY_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
   * Or with RELIZY_ prefix: RELIZY_TWITTER_API_KEY, etc.
   */
  twitter?: {
    apiKey?: string
    apiKeySecret?: string
    accessToken?: string
    accessTokenSecret?: string
  }
  /**
   * Slack bot token for posting messages
   * Environment variables: SLACK_TOKEN, RELIZY_SLACK_TOKEN
   */
  slack?: string
}

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
export interface RelizyConfig extends Partial<Omit<IChangelogConfig, 'output' | 'templates' | 'publish' | 'types' | 'tokens'>> {
  types?: Record<string, {
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
   * Social media configuration
   */
  social?: SocialConfig
  /**
   * API tokens configuration
   */
  tokens?: TokensConfig
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
   * Global safety check. The safety check will verify if tokens or others required for release are set (depends on the release options)
   * @default true
   */
  safetyCheck?: boolean
}
