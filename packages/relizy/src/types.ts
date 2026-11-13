import type { BumpReleaseType, CommitlintBuiltInRules, CommitlintChangelogLinter, CommitlintCommit, CommitlintCustomRuleOutcome, CommitlintRuleConfig, CommitlintRuleLevel, CommitlintRuleName, CommitlintRulesConfig, CommitlintCustomRule as CoreCommitlintCustomRule, CommitlintCustomRuleContext as CoreCommitlintCustomRuleContext, GitCommit, GitCommitAuthor, GitProvider, PackageBase, PackageManager, PrivatePackages, RawGitCommit, ReadPackage, Reference, RegistryTarget, RepoConfig, SemverBumpType } from '@relizy/core'
import type { CallSettings, LanguageModel } from 'ai'
import type { ReleaseOverview, ReleaseReport, RelizyConfigOverrides, ResolvedRelizyConfig, RootPackage } from './core'
import type { RelizyEventListener } from './core/events'

export type VersionMode = 'unified' | 'independent' | 'selective'

/**
 * Log level of relizy (the `LogLevel` of `@maz-ui/node`)
 */
export type RelizyLogLevel = 'silent' | 'error' | 'warning' | 'normal' | 'default' | 'debug' | 'trace' | 'verbose'

/**
 * COMMIT TYPES, declared in `@relizy/core`
 */
export type { CommitlintBuiltInRules, CommitlintChangelogLinter, CommitlintCommit, CommitlintCustomRuleOutcome, CommitlintRuleConfig, CommitlintRuleLevel, CommitlintRuleName, CommitlintRulesConfig, GitCommit, GitCommitAuthor, RawGitCommit, Reference, SemverBumpType }

/**
 * PACKAGE, REPOSITORY AND REGISTRY TYPES, declared in `@relizy/core`
 */
export type { BumpReleaseType, GitProvider, PackageBase, PackageManager, PrivatePackages, ReadPackage, RegistryTarget, RepoConfig }

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
  /**
   * Result of each version group that bumped, when `monorepo.groups` is set.
   * The other fields then aggregate them: `bumpedPackages` lists the packages
   * of every group, `newVersion`, `oldVersion`, `fromTag` and `rootPackage`
   * come from the `unified`/`selective` group (if it bumped).
   */
  groups?: GroupBumpResult[]
}

export interface GroupBumpResult extends Omit<BumpResultTruthy, 'groups'> {
  /**
   * Name of the version group
   */
  name: string
  /**
   * Title of the version group (`title`, else `name`)
   */
  title: string
  /**
   * Version mode of the version group
   */
  versionMode: VersionMode
}
export interface BumpResultFalsy {
  /**
   * Bumped
   */
  bumped: false
}
export type BumpResult = BumpResultTruthy | BumpResultFalsy

/**
 * A package of the bump plan, as `onConfirm` receives it
 */
export interface ConfirmPlanPackage {
  name: string
  /**
   * Directory of the package, relative to the project (`.` for the root)
   */
  path: string
  /**
   * A private package is versioned, never published
   */
  private: boolean
  oldVersion: string
  newVersion: string
  /**
   * The git tag the release creates for it: its own tag in an `independent` set, the one of the
   * repository otherwise. None when the run creates no tag (`relizy bump`, `release.gitTag: false`, canary)
   */
  tag?: string
  /**
   * Name of its version group, with `monorepo.groups`
   */
  group?: string
  /**
   * Why it is bumped: its commits, a bumped dependency, the graduation of its prerelease
   */
  reason?: 'commits' | 'dependency' | 'graduation'
}

/**
 * The versions a bump is about to write, computed with nothing written yet: what `onConfirm` validates
 */
export interface ConfirmPlan {
  /**
   * The command run: `release`, or `bump`
   */
  command: 'release' | 'bump'
  /**
   * Nothing will be written, whatever the answer
   */
  dryRun: boolean
  /**
   * The profile applied, none without one
   */
  profile?: string
  /**
   * A canary release: published under its own dist-tag, never committed
   */
  canary: boolean
  /**
   * Every package the run bumps, every version group together
   */
  packages: ConfirmPlanPackage[]
}

/**
 * What the registry asks a one-time password for, as `onOtp` receives it
 */
export interface OtpRequest {
  /**
   * The registry asking for it (`https://registry.npmjs.org/`)
   */
  registry: string
  /**
   * The package being published
   */
  packageName?: string
}

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
  /**
   * The post, when the platform gives it (Twitter)
   */
  url?: string
  /**
   * Why nothing was posted on the platform (`prerelease` with `onlyStable`, `nothing to announce`)
   */
  skipped?: string
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

export type PrCommentMode = 'append' | 'update'

export interface MergePreviewConfig {
  /**
   * Post the merge preview as a comment of the pull request, updated at each
   * run (`relizy merge-preview --no-comment` disables it)
   * @default true
   */
  comment?: boolean
  /**
   * Set the commit status `relizy/merge-preview` on the last commit of the
   * pull request: failed when the release of the merge would fail, to require
   * it in the protection of the branch (`--no-check` disables it)
   * @default true
   */
  check?: boolean
  /**
   * Lint the commits of the pull request (and the commit of its squash merge)
   * with `relizy commitlint`: `auto` when the project uses it, a `commitlint`
   * option in its config or a commit-msg hook running `relizy commitlint`
   * @default 'auto'
   */
  commitlint?: 'auto' | boolean
  /**
   * Whether the merge squashes the commits of the pull request into one, its
   * title: `auto` reads it from GitHub (auto-merge, merge methods of the
   * repository) or GitLab (squash option of the merge request), and computes
   * both when only the merge will tell
   * @default 'auto'
   */
  squash?: 'auto' | boolean
}

export interface PrCommentConfig {
  /**
   * PR comment mode
   * @default 'update'
   */
  mode?: PrCommentMode
}

export type PrCommentStatus = 'success' | 'no-release' | 'failed'

export interface ReleaseContext {
  /**
   * Release status
   */
  status: PrCommentStatus
  /**
   * Bump result (available when status is 'success')
   */
  bumpResult?: BumpResultTruthy
  /**
   * Git tags created during release
   */
  tags?: string[]
  /**
   * Error message (available when status is 'failed')
   */
  error?: string
  /**
   * The report of the release so far (`relizy release`): the comment is its
   * summary, as the summary of the terminal and of the GitHub Actions run
   */
  report?: ReleaseReport
  /**
   * The commit the release started from, before its release commit: when the
   * branch has no open pull request (a release run after a merge), the pull
   * request of this commit is commented
   */
  sha?: string
}

export interface MonorepoConfig {
  /**
   * Version mode for the monorepo. Required unless `groups` is set.
   */
  versionMode?: VersionMode
  /**
   * Glob pattern matching for packages to bump. Required unless `groups` is set.
   */
  packages?: string[]
  /**
   * Version groups released together in a single run, each with its own
   * version mode (e.g. a `selective` group for most packages and an
   * `independent` group for packages with their own version line). Replaces
   * `versionMode` and `packages`, which cannot be set with it.
   *
   * Every package belongs to one group. When a package is matched by several
   * groups, the group listing its exact path (no glob) wins; any other overlap
   * is an error. At most one group can use the `unified` or `selective` mode:
   * it owns the root `package.json` version and the repository tags.
   */
  groups?: VersionGroup[]
  /**
   * Glob patterns (relative to `cwd`, POSIX separators) of package directories
   * to ignore - matched the same way as `packages`. Ignored packages are
   * excluded from bump, changelog, publish, provider-release and pr-comment.
   *
   * In `unified`/`selective` mode, the root version bump and the root changelog
   * only count the commits of the released packages: a commit changing only
   * ignored packages, private packages left out by `privatePackages` or files
   * outside every package (CI, scripts) does not bump the repository.
   * @default []
   */
  ignored?: string[]
  /**
   * What relizy does with the private packages of the workspace (`"private": true`
   * in their package.json):
   * - `ignore`: they are left out of the release
   * - `release`: they are released as the other packages (bump, changelog, tag,
   *   GitHub/GitLab release, PR comment), but never published to the registry
   *
   * A project without workspace packages (a private app) is released, private or not.
   * @default 'ignore'
   */
  privatePackages?: PrivatePackages
  /**
   * Package directories moved or renamed, as `old path: new path` (relative to
   * `cwd`, POSIX separators, no glob). The commits that changed the old
   * directory belong to the package, so its changelog and its bump keep the
   * commits made before the move.
   *
   * Relizy already detects the moves whose `package.json` git sees as renamed
   * (`git mv`) and that keep their package name: this option is for the moves
   * it cannot see, e.g. a `package.json` rewritten or a package renamed in the
   * commit of the move, or a commit moving more files than the rename detection
   * of git handles (`diff.renameLimit`). Chains
   * are followed (`a: b` then `b: c`). The entries can be removed once a
   * release includes the move.
   * @default {}
   */
  movedPackages?: Record<string, string>
}

export interface VersionGroup {
  /**
   * Name of the group, used in logs and to target it with `--group <name>`.
   */
  name: string
  /**
   * Name of the group in the outputs of a release: bump confirmation, social
   * posts, PR comment and release summary.
   * @default name
   */
  title?: string
  /**
   * Version mode of the packages of this group.
   */
  versionMode: VersionMode
  /**
   * Glob patterns (relative to `cwd`) of the package directories of this group.
   */
  packages: string[]
  /**
   * Glob patterns of package directories to ignore in this group, on top of
   * `monorepo.ignored`.
   * @default []
   */
  ignored?: string[]
  /**
   * Bump options of this group, overriding the global `bump` ones.
   */
  bump?: Pick<BumpConfig, 'capZeroMajor' | 'dependencyTypes' | 'dependents'>
  /**
   * Changelog options of this group, overriding the global `changelog` ones.
   */
  changelog?: Pick<ChangelogConfig, 'rootChangelog' | 'includeCommitBody'>
  /**
   * Release steps of this group, overriding the global `release` ones:
   * `providerRelease: false` creates no provider release for its packages,
   * `social: false` leaves the group out of the social posts.
   */
  release?: Pick<ReleaseConfig, 'providerRelease' | 'social'>
  /**
   * AI options of this group, overriding the global `ai` ones, e.g.
   * `{ providerRelease: { enabled: false } }` to create the provider releases
   * of the group without AI.
   */
  ai?: Pick<AIConfig, 'providerRelease'>
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
  type?: BumpReleaseType
  /**
   * Prerelease identifier (e.g. 'beta', 'alpha')
   */
  preid?: string
  /**
   * Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix), as `--suffix`
   */
  suffix?: string
  /**
   * Check if there are any changes to commit before bumping.
   * @default true
   */
  clean?: boolean
  /**
   * Dependency fields whose internal dependencies bump the package (a patch):
   * when its published range rejects their new version, or on every bump of
   * them, see `dependents`.
   *
   * `peerDependencies` is not included by default: a package is bumped only when
   * the range of its peer dependency rejects the new version, see `outOfRangePeers`.
   * @default ['dependencies']
   */
  dependencyTypes?: ('dependencies' | 'devDependencies' | 'peerDependencies')[]
  /**
   * When a package is bumped because of an internal dependency listed in one of
   * the `dependencyTypes` fields:
   * - `out-of-range`: only when the range it was published with rejects the new
   *   version of the dependency (`workspace:*` on every bump, `workspace:^` on a
   *   major, a minor in `0.x` or a prerelease). A specifier that is not a semver
   *   range (`catalog:`, `link:`, `npm:`...) counts as out of range.
   * - `always`: on every bump of the dependency, e.g. for a package that
   *   bundles its dependency.
   * @default 'out-of-range'
   */
  dependents?: 'out-of-range' | 'always'
  /**
   * Skip confirmation prompt about bumping packages
   * @default false
   */
  yes?: boolean
  /**
   * Cap commit-detected `major` bumps to `minor` while the current version is
   * in the `0.x.y` range (semver §4, initial development), so a breaking change
   * does not graduate a `0.x` package to `1.0.0` automatically.
   *
   * Set to `false` to opt out: a breaking commit then bumps `0.x.y` straight to
   * `1.0.0`. This only affects **commit-based** detection; explicit CLI release
   * types (`--major`, `--premajor`, …) are never capped. Once the package
   * reaches `1.x`, this option is a no-op.
   * @default true
   */
  capZeroMajor?: boolean
  /**
   * What to do with a package that is not bumped while the range of one of its
   * peer dependencies, as published, does not accept the new version of that
   * dependency: `workspace:*` is published as the exact version, so any new
   * version is out of its range; `workspace:^` only on a major, or on a
   * prerelease (npm rejects `6.20.0-beta.0` for `^6.19.1`). Its consumers would
   * get peer dependency errors (npm) or warnings (pnpm).
   *
   * - `bump`: bump the package, so it is released with an up-to-date range: a
   *   patch, or a major when the dependency makes a breaking change. The packages
   *   outside of the release (e.g. not in the targeted `--group`) are reported
   *   with a warning.
   * - `warn`: only warn before publishing.
   * - `error`: fail the release before publishing.
   *
   * Whatever this option, a package released while its peer dependency makes a
   * breaking change its published range rejects is bumped as for a breaking
   * commit (`capZeroMajor` applies). In `unified`/`selective` mode, a peer
   * dependency of another version group gives that bump to the root version.
   *
   * Independent of `dependencyTypes`, which bumps the dependents on every bump
   * of their dependencies (or only out of range, see `dependents`).
   * @default 'bump'
   */
  outOfRangePeers?: 'bump' | 'warn' | 'error'
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
  logLevel?: RelizyLogLevel
  /**
   * Bump all packages even if there are no commits
   * @default false
   */
  force?: boolean
  /**
   * Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`), or the path of the
   * config file: absolute, or relative to the project with its extension (`/configs/relizy.config.ts`)
   * @default 'relizy'
   */
  configName?: string
  /**
   * Release profile to apply (`profiles` of the config), as `--profile`: its options
   * come after the config file and before the options of this run
   */
  profile?: string
  /**
   * Called with each event of the run (steps started, done, failed or skipped, progress, links,
   * logs, the end): the same events as `RELIZY_REPORTER=json`, for a program following the run.
   * A listener that throws does not stop the run.
   */
  onProgress?: RelizyEventListener
  /**
   * Validates the bump plan instead of the prompt of the terminal, once the versions are computed and
   * before anything is written: `false` cancels the run as a refused prompt (a `RelizyCancelError`,
   * nothing written). Unused with `yes`. For an application asking in its own interface
   */
  onConfirm?: (plan: ConfirmPlan) => boolean | Promise<boolean>
  /**
   * Publish a canary release from the current commit
   * @default false
   */
  canary?: boolean
  /**
   * Override of `monorepo.privatePackages`: `release` bumps the private packages too
   */
  privatePackages?: PrivatePackages
  /**
   * Only process these version groups (`monorepo.groups`), by name.
   * @default all groups
   */
  groups?: string[]
}

export interface ChangelogConfig {
  /**
   * Command formatting the changelogs once written, run from the root: `{{files}}` is
   * replaced by their paths (e.g. `eslint --fix {{files}}`). Without it, the formatter
   * of the root `package.json` (Biome, Prettier, oxfmt, dprint, else ESLint) formats
   * the changelogs written; `false` formats nothing.
   * @default the formatter detected
   */
  formatCmd?: string | false
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
  logLevel?: RelizyLogLevel
  /**
   * Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`), or the path of the
   * config file: absolute, or relative to the project with its extension (`/configs/relizy.config.ts`)
   * @default 'relizy'
   */
  configName?: string
  /**
   * Release profile to apply (`profiles` of the config), as `--profile`: its options
   * come after the config file and before the options of this run
   */
  profile?: string
  /**
   * Called with each event of the run (steps started, done, failed or skipped, progress, links,
   * logs, the end): the same events as `RELIZY_REPORTER=json`, for a program following the run.
   * A listener that throws does not stop the run.
   */
  onProgress?: RelizyEventListener
  /**
   * Generate changelog for all packages even if there are no commits
   * @default false
   */
  force: boolean
  /**
   * Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)
   */
  suffix?: string
  /**
   * Override of `monorepo.privatePackages`: `release` generates the changelogs of the private packages too
   */
  privatePackages?: PrivatePackages
  /**
   * Only process these version groups (`monorepo.groups`), by name.
   * @default all groups
   */
  groups?: string[]
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
   * Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`), or the path of the
   * config file: absolute, or relative to the project with its extension (`/configs/relizy.config.ts`)
   * @default 'relizy'
   */
  configName?: string
  /**
   * Release profile to apply (`profiles` of the config), as `--profile`: its options
   * come after the config file and before the options of this run
   */
  profile?: string
  /**
   * Called with each event of the run (steps started, done, failed or skipped, progress, links,
   * logs, the end): the same events as `RELIZY_REPORTER=json`, for a program following the run.
   * A listener that throws does not stop the run.
   */
  onProgress?: RelizyEventListener
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
  logLevel?: RelizyLogLevel
  /**
   * Run without side effects
   * @default false
   */
  dryRun?: boolean
  /**
   * Check the token and the provider before creating the releases (`false` skips it, as `--no-safety-check`)
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
  /**
   * Override AI configuration for this run
   * true = force-enable AI, false = force-disable AI, undefined = use config
   */
  ai?: boolean
  /**
   * Only process these version groups (`monorepo.groups`), by name.
   * @default all groups
   */
  groups?: string[]
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
   * Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`), or the path of the
   * config file: absolute, or relative to the project with its extension (`/configs/relizy.config.ts`)
   * @default 'relizy'
   */
  configName?: string
  /**
   * Release profile to apply (`profiles` of the config), as `--profile`: its options
   * come after the config file and before the options of this run
   */
  profile?: string
  /**
   * Called with each event of the run (steps started, done, failed or skipped, progress, links,
   * logs, the end): the same events as `RELIZY_REPORTER=json`, for a program following the run.
   * A listener that throws does not stop the run.
   */
  onProgress?: RelizyEventListener
  /**
   * Bump result (contains release information)
   */
  bumpResult?: BumpResultTruthy
  /**
   * Set log level
   */
  logLevel?: RelizyLogLevel
  /**
   * Run without side effects
   * @default false
   */
  dryRun?: boolean
  /**
   * Check the credentials of the enabled platforms before posting (`false` skips it, as `--no-safety-check`)
   * @default true
   */
  safetyCheck?: boolean
  /**
   * Override AI configuration for this run
   * true = force-enable AI, false = force-disable AI, undefined = use config
   */
  ai?: boolean
  /**
   * Override `social.slack.changelog` for this run
   */
  slackFormat?: SocialChangelog
  /**
   * Prerelease suffix, forwarded to package discovery in independent mode
   * when no bump result is available (standalone `social` runs).
   */
  suffix?: string
  /**
   * Force package discovery to include all packages (independent standalone runs).
   * @default false
   */
  force?: boolean
  /**
   * Only process these version groups (`monorepo.groups`), by name.
   * @default all groups
   */
  groups?: string[]
}

export interface PublishConfig {
  /**
   * Extra arguments of the publish command of every package and registry,
   * after the ones of relizy (e.g. `['--provenance']`)
   * @default []
   */
  args?: string[]
  /**
   * Package manager (e.g. `pnpm`, `npm`, `yarn` or `bun`)
   */
  packageManager?: PackageManager
  /**
   * NPM registry URL (e.g. `https://registry.npmjs.org/`). Without it, the
   * registry of the npm config (`.npmrc`), unless `registries` is set: the
   * packages then go only to the declared registries
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
   * Command to build your packages before publishing (e.g. `pnpm build`)
   */
  buildCmd?: string
  /**
   * Authenticate to each registry the packages need (`whoami`) before publishing
   * @default true
   */
  safetyCheck?: boolean
  /**
   * Maximum time in milliseconds for the registry authentication safety check
   * before it is aborted. Prevents the release from hanging indefinitely when
   * the registry (or a proxy) never answers.
   * @default 15000
   */
  safetyCheckTimeout?: number
  /**
   * Additional registries to publish to, on top of `registry` (if set).
   * Entries without `packageFilter` apply to every package (mirroring);
   * entries with `packageFilter` only apply to packages matching one of the
   * glob patterns. Without `registry`, only these registries are used: a
   * package that no entry covers goes to the registry of the npm config.
   */
  registries?: RegistryTarget[]
  /**
   * Skip a package (per registry) instead of failing when its version already
   * exists on the registry. Makes re-running a release idempotent: a retried
   * job whose version is already published (e.g. a canary rerun on the same
   * commit, or a partially completed publish) succeeds and only publishes what
   * is missing, rather than crashing on the registry's "cannot overwrite"
   * error. When disabled (the default), that situation still fails, but with a
   * clear error message instead of the raw registry error.
   * @default false
   */
  skipExistingVersions?: boolean
  /**
   * Before publishing, check the internal dependencies declared with the
   * `workspace:` protocol (`workspace:*`, `workspace:^`, `workspace:~`) in
   * `dependencies`, `peerDependencies` and `optionalDependencies`: the version
   * the package manager will write must be published by this run or already be
   * on the registry. Fails when the registry confirms the version is missing
   * (the published package could not be installed), warns when the registry
   * cannot be queried.
   * @default true
   */
  checkWorkspaceDependencies?: boolean
}

export interface PublishOptions extends PublishConfig {
  /**
   * Registry token (npm, pnpm and bun, injected via `.npmrc`), instead of
   * `tokens.registry`. Yarn is not supported (it uses `.yarnrc.yml`).
   */
  token?: string
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
  logLevel?: RelizyLogLevel
  /**
   * Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`), or the path of the
   * config file: absolute, or relative to the project with its extension (`/configs/relizy.config.ts`)
   * @default 'relizy'
   */
  configName?: string
  /**
   * Release profile to apply (`profiles` of the config), as `--profile`: its options
   * come after the config file and before the options of this run
   */
  profile?: string
  /**
   * Called with each event of the run (steps started, done, failed or skipped, progress, links,
   * logs, the end): the same events as `RELIZY_REPORTER=json`, for a program following the run.
   * A listener that throws does not stop the run.
   */
  onProgress?: RelizyEventListener
  /**
   * Gives the one-time password the registry asks for, instead of the prompt of the terminal:
   * asked once per registry, then reused for the next packages. An empty password (or none) cancels
   * the publish (a `RelizyCancelError`; the packages published before stay published), an error thrown
   * by it fails the publish. For an application asking in its own interface
   */
  onOtp?: (request: OtpRequest) => string | Promise<string>
  /**
   * Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)
   */
  suffix?: string
  /**
   * Bump even if there are no commits
   * @default false
   */
  force?: boolean
  /**
   * Only process these version groups (`monorepo.groups`), by name.
   * @default all groups
   */
  groups?: string[]
}

export interface ReleaseReportConfig {
  /**
   * In GitHub Actions, write the outputs of the step (`released`, `status`,
   * `version`, `tags`, `packages`, `branch`, `commit`, `dist_tags`, `urls`,
   * `install`, `failed_steps`, `report`, `summary`) and the summary of the run
   * @default true
   */
  github?: boolean
  /**
   * File to write the report to, as JSON (relative to `cwd`)
   */
  json?: string
  /**
   * File to write the outputs to, as dotenv (`RELIZY_RELEASED=true`...),
   * for the `artifacts:reports:dotenv` of GitLab CI (relative to `cwd`)
   */
  dotenv?: string
  /**
   * File to write the summary of the release to, as markdown (the summary of
   * a GitHub Actions run), e.g. for an artifact of GitLab CI (relative to `cwd`)
   */
  markdown?: string
}

export interface ReleaseConfig {
  /**
   * Publish a canary release from the current commit, as `--canary`: a prerelease
   * version (`bump.preid`, `canary` by default) with the short sha of the commit,
   * published under the `canary` npm tag (`publish.tag`), without commit, tag,
   * push, changelog, provider release nor social post.
   * @default false
   */
  canary?: boolean
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
   * @default false
   */
  noVerify?: boolean
  /**
   * Check that the working directory is clean before the release (with
   * `bump.clean`), a confirmation is asked otherwise
   * @default true
   */
  clean?: boolean
  /**
   * Create tag
   * @default true
   */
  gitTag?: boolean
  /**
   * Post release announcements to social media platforms (the platforms
   * enabled in `social`)
   * @default true
   */
  social?: boolean
  /**
   * Post a comment with the outcome of the release on the pull request
   * @default true
   */
  prComment?: boolean
  /**
   * Report of the release, to run something only when a release happens:
   * the outputs and the summary of GitHub Actions, a JSON file, a dotenv file
   * (GitLab CI). Written in dry-run too, where `released` is `false`.
   * @default { github: true }
   */
  report?: ReleaseReportConfig
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
  logLevel?: RelizyLogLevel
  /**
   * @default 'relizy'
   */
  configName?: string
  /**
   * Release profile to apply (`profiles` of the config), as `--profile`: its options
   * come after the config file and before the options of this run
   */
  profile?: string
  /**
   * Called with each event of the run (steps started, done, failed or skipped, progress, links,
   * logs, the end): the same events as `RELIZY_REPORTER=json`, for a program following the run.
   * A listener that throws does not stop the run.
   */
  onProgress?: RelizyEventListener
  /**
   * Validates the bump plan instead of the prompt of the terminal, once the versions are computed and
   * before anything is written: `false` cancels the run as a refused prompt (a `RelizyCancelError`,
   * nothing written). Unused with `yes`. For an application asking in its own interface
   */
  onConfirm?: (plan: ConfirmPlan) => boolean | Promise<boolean>
  /**
   * Gives the one-time password the registry asks for, instead of the prompt of the terminal:
   * asked once per registry, then reused for the next packages. An empty password (or none) cancels
   * the publish (a `RelizyCancelError`; the packages published before stay published), an error thrown
   * by it fails the publish. For an application asking in its own interface
   */
  onOtp?: (request: OtpRequest) => string | Promise<string>
  /**
   * Config already resolved by `loadRelizyConfig()`: used as is instead of loading the config file
   * (the profile, the `overrides` and the options of the call still apply over it)
   */
  config?: ResolvedRelizyConfig
  /**
   * Options applied over the config file (or over `config`), under the options of the call:
   * a local overlay without writing a file. The hooks of the overlay run after those of the config.
   */
  overrides?: RelizyConfigOverrides
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
   * Run the safety checks before writing anything: tokens, registry access, branch up to date (`false` skips them, as `--no-safety-check`)
   * @default true
   */
  safetyCheck?: boolean
  /**
   * NPM token (e.g. "123456")
   */
  publishToken?: string
  /**
   * Override PR/MR number for PR comment features
   */
  prNumber?: number
  /**
   * Override of `monorepo.privatePackages`: `release` releases the private packages too
   */
  privatePackages?: PrivatePackages
  /**
   * Override AI configuration for this run
   * true = force-enable AI, false = force-disable AI, undefined = use config
   */
  ai?: boolean
  /**
   * Override `social.slack.changelog` for this run
   */
  slackFormat?: SocialChangelog
  /**
   * Only process these version groups (`monorepo.groups`), by name.
   * @default all groups
   */
  groups?: string[]
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
   * Available variables: {{releaseTitle}}, {{projectName}}, {{newVersion}}, {{packageList}}, {{packageCount}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}} (see `SocialTemplateVariables`)
   * @default '📣 {{releaseTitle}}\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}'
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
  /**
   * Versions never announced in the tweet
   */
  exclude?: SocialExclude
}

export interface SlackCredentials {
  /**
   * Slack Bot Token or User OAuth Token (starts with `xoxb-`).
   * Required scopes: chat:write (and chat:write.public for public channels without bot invite).
   * Env fallback: SLACK_TOKEN, RELIZY_SLACK_TOKEN.
   * Ignored when social.slack.webhookUrl is set (webhook takes priority).
   */
  token?: string
}

/**
 * The changelog of a post:
 * - `full`: the commit bodies and the PR/issue links included.
 * - `summary`: the commit titles only.
 * - `none` (or `false`): no changelog, the links of the post lead to it.
 */
export type SocialChangelog = 'full' | 'summary' | 'none' | false

/**
 * How the Slack message renders its changelog: `summary` in mrkdwn sections,
 * `full` as rich text blocks
 */
export type SlackChangelogFormat = 'summary' | 'full'

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
   * Slack channel ID or name (e.g., "#releases" or "C1234567890").
   * Required when using token-based authentication.
   * Ignored (with warning) when webhookUrl is set - the channel is baked into the webhook URL.
   */
  channel?: string
  /**
   * Slack Incoming Webhook URL. When set, takes priority over token-based auth.
   * Env fallback: SLACK_WEBHOOK_URL, RELIZY_SLACK_WEBHOOK_URL.
   * See: https://api.slack.com/messaging/webhooks
   */
  webhookUrl?: string
  /**
   * Custom message template
   * Available variables: {{releaseTitle}}, {{projectName}}, {{newVersion}}, {{packageList}}, {{packageCount}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}, {{contributors}}, {{packages}} (see `SocialTemplateVariables`)
   */
  template?: string
  /**
   * Slack credentials (optional - falls back to environment variables)
   */
  credentials?: SlackCredentials
  /**
   * The changelog of the Slack message.
   * - `full`: commit bodies and PR/issue links included, rendered as rich text blocks
   *   (one per changelog section). Commit bodies follow `changelog.includeCommitBody`.
   * - `summary`: commit titles only, in a single section capped at `postMaxLength`.
   * - `none` (or `false`): no changelog.
   * Can be overridden with the `--slack-format` CLI flag.
   * @default 'summary'
   */
  changelog?: SocialChangelog
  /**
   * Maximum length (in characters) of the changelog rendered inside the Slack message.
   * When exceeded, `summary` drops the last commits, `full` cuts the changelog where the limit
   * is reached (even inside a commit body) with an ellipsis; the commits left out entirely are
   * announced with an "… and N more changes" line.
   * Defaults to 2500 in `summary` format (Slack's section limit is 3000) and to no limit
   * in `full` format, where the message is only bounded by Slack's 50 blocks.
   */
  postMaxLength?: number
  /**
   * Hide the contributors block in Slack messages.
   * If config.noAuthors is true globally, contributors are always hidden regardless of this setting.
   * @default false
   */
  noAuthors?: boolean
  /**
   * Hide the packages block (list of bumped packages with their before → after versions).
   * @default false
   */
  noPackages?: boolean
  /**
   * The versions to announce and their content (title, message, links).
   * Without it, every version is announced; with it, only the versions
   * matching an entry.
   */
  announcements?: SocialAnnouncement[]
  /**
   * Versions never announced, even when an announcement matches them
   */
  exclude?: SocialExclude
}

/**
 * A link of an announcement: a button of a Teams card, a link of a Slack
 * section. The `title` and the `url` accept the variables of the announcement
 * (see `SocialAnnouncementVariables`), e.g.
 * `{ title: '🎨 Storybook', url: 'https://{{shortName}}.example.com' }`.
 * A link whose URL is empty is left out.
 */
export interface SocialLink {
  title: string
  url: string
}

/**
 * The content of the announcement of a version. The texts accept the
 * variables of the announcement (see `SocialAnnouncementVariables`).
 */
export interface SocialAnnouncementContent {
  /**
   * Title of the version: of its Teams card (or section), of its Slack section
   * (or header, when the message announces a single version)
   */
  title?: string
  /**
   * Text under the title, in markdown (bold, italic, links, lists)
   */
  message?: string
  /**
   * URL of the changelog link of the version; `false` removes the link
   */
  changelogUrl?: string | false
  /**
   * Links added after the release notes and the changelog
   */
  links?: SocialLink[]
}

/**
 * An announcement of `social.teams.announcements` or
 * `social.slack.announcements`: the content of the versions of a version
 * group, or of the packages matching a glob.
 * - `{ group }`: the root version of a `unified`/`selective` group, each
 *   package of an `independent` group.
 * - `{ package }`: the packages of an `independent` group (or without
 *   version groups) whose name matches the glob (`@scope/*`); the version of
 *   a project without monorepo is announced under its name. Its fields
 *   override the ones of its group entry.
 */
export type SocialAnnouncement = SocialAnnouncementContent & ({ group: string, package?: never } | { package: string, group?: never })

/**
 * Versions never announced by a platform
 */
export interface SocialExclude {
  /**
   * Names of the version groups (`monorepo.groups`)
   */
  groups?: string[]
  /**
   * Package names or globs (`@scope/internal-*`), matched against the
   * packages of the `independent` groups and the name of the project
   */
  packages?: string[]
}

/**
 * Variables of the texts and links of an announcement
 */
export interface SocialAnnouncementVariables {
  /**
   * The package name, the project name (the title of the group with version
   * groups) for a `unified`/`selective` version
   */
  name: string
  /**
   * `name` without its scope (`@scope/ui` gives `ui`)
   */
  shortName: string
  newVersion: string
  tag: string
  projectName: string
  /**
   * Title of the version group, empty without version groups
   */
  groupTitle: string
  /**
   * GitHub/GitLab release of the version
   */
  releaseUrl: string
  /**
   * Changelog of the version
   */
  changelogUrl: string
}

/**
 * - `version`: one card per version released (the root version, each package
 *   of an `independent` group).
 * - `release`: one card for the release, with a section per version.
 */
export type TeamsCardsMode = 'version' | 'release'

export interface TeamsSocialConfig extends SocialAnnouncementContent {
  /**
   * Enable the Teams cards
   * @default false
   */
  enabled?: boolean
  /**
   * Skip the prerelease versions (alpha, beta, rc, etc.)
   * @default true
   */
  onlyStable?: boolean
  /**
   * URL of the Teams workflow ("When a Teams webhook request is received"
   * trigger). It holds a secret (`sig`): prefer the environment.
   * Env fallback: RELIZY_TEAMS_WEBHOOK_URL, TEAMS_WEBHOOK_URL, or the URL in
   * base64 in RELIZY_TEAMS_WEBHOOK_URL_B64, TEAMS_WEBHOOK_URL_B64 (a masked
   * GitLab variable refuses the characters of the URL).
   */
  webhookUrl?: string
  /**
   * One card per version, or one card for the release
   * @default 'version'
   */
  cards?: TeamsCardsMode
  /**
   * The changelog in the card: `full` (the commit bodies included), `summary`
   * (the commit titles, rewritten with `ai.social.teams`), or `none` (or
   * `false`), the buttons linking to it. Cut between two changes to fit in the
   * 28 KB of a card.
   * @default 'none'
   */
  changelog?: SocialChangelog
  /**
   * Text of the badge above the title; `false` removes it
   * @default 'New release' ('Prerelease' for a prerelease)
   */
  badge?: string | false
  /**
   * Locale of the date of the card (BCP 47, e.g. `fr-FR`)
   * @default 'en-US'
   */
  locale?: string
  /**
   * The versions to announce and their content. Without it, every version is
   * announced with the content of `social.teams`; with it, only the versions
   * matching an entry.
   */
  announcements?: SocialAnnouncement[]
  /**
   * Versions never announced, even when an announcement matches them
   */
  exclude?: SocialExclude
}

export type AIProviderName = 'claude-code' | 'ai-sdk'

export interface ClaudeCodeProviderOptions {
  /**
   * Anthropic API key.
   * Fallback env: `RELIZY_ANTHROPIC_API_KEY`, `ANTHROPIC_API_KEY`.
   */
  apiKey?: string
  /**
   * Claude Code OAuth token.
   * Fallback env: `RELIZY_CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`.
   */
  oauthToken?: string
  /**
   * Model id or alias (e.g. `haiku`, `sonnet`, `opus`, or a versioned id).
   * @default 'haiku'
   */
  model?: string
}

export interface AiSdkProviderOptions {
  /**
   * Language model: an instance from a provider package (e.g. `openai('gpt-5-mini')`
   * from `@ai-sdk/openai`), or a model id of the Vercel AI Gateway (e.g. `'openai/gpt-5-mini'`).
   * @see https://ai-sdk.dev/providers/ai-sdk-providers
   */
  model: LanguageModel
  /**
   * Reasoning effort, for the models that support it.
   * Not sent when unset: the default of the provider applies.
   */
  reasoning?: CallSettings['reasoning']
}

export type AIPromptTarget = 'providerRelease' | 'twitter' | 'slack' | 'teams'
export type AISystemPromptOverrides = Partial<Record<AIPromptTarget, string>>

export interface AIExtraGuidelines extends Partial<Record<AIPromptTarget, string>> {
  /**
   * Directives appended to every target, before the target-specific ones
   */
  global?: string
}

export interface AITargetConfig {
  /**
   * Enable AI for this target
   * @default false
   */
  enabled?: boolean
  /**
   * Rewrite only the stable versions: a prerelease keeps its raw changelog,
   * without an AI call. Overrides `ai.onlyStable` for this target.
   * @default ai.onlyStable
   */
  onlyStable?: boolean
}

export interface AISocialConfig {
  /**
   * Twitter-specific AI activation
   */
  twitter?: AITargetConfig
  /**
   * Slack-specific AI activation
   */
  slack?: AITargetConfig
  /**
   * Teams-specific AI activation (with `social.teams.changelog: 'summary'`)
   */
  teams?: AITargetConfig
}

export interface AIConfig {
  /**
   * AI provider name
   * @default 'claude-code'
   */
  provider?: AIProviderName
  /**
   * Provider-specific options, keyed by provider name.
   */
  providers?: {
    'claude-code'?: ClaudeCodeProviderOptions
    'ai-sdk'?: AiSdkProviderOptions
  }
  /**
   * Output language (ISO 639-1 code or plain English name).
   * @default 'en'
   */
  language?: string
  /**
   * Behavior when the provider call fails.
   * - `raw`: fall back to the unmodified changelog body.
   * - `fail`: re-throw the error.
   * @default 'raw'
   */
  fallback?: 'raw' | 'fail'
  /**
   * Extra directives appended to the built-in system prompts.
   * A string applies to every target; an object adds directives per target,
   * appended after the `global` ones.
   * @example 'Always use emojis in the changelog'
   * @example { global: 'Keep package names in English.', slack: 'Mention the owning team.' }
   */
  extraGuidelines?: string | AIExtraGuidelines
  /**
   * Full replacement of the built-in system prompts.
   * When set, the extraGuidelines and base prompts are ignored for that target.
   */
  systemPromptOverrides?: AISystemPromptOverrides
  /**
   * Rewrite only the stable versions: the prereleases (beta, canary...) keep
   * their raw changelog, without an AI call. The `onlyStable` of a target overrides it.
   * @default true
   */
  onlyStable?: boolean
  /**
   * Enable AI rewriting for GitHub/GitLab release notes.
   */
  providerRelease?: AITargetConfig
  /**
   * Enable AI rewriting for social media posts.
   */
  social?: AISocialConfig
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
   * Microsoft Teams configuration
   */
  teams?: TeamsSocialConfig
  /**
   * URL to full changelog (e.g., https://example.com/changelog)
   * This URL will be included in social media posts to allow users to view the complete changelog
   */
  changelogUrl?: string
  // Future social platforms can be added here:
  // linkedin?: LinkedInSocialConfig
  // discord?: DiscordSocialConfig
}

/**
 * Variables of the social templates (`templates.twitterMessage`, `templates.slackMessage`)
 */
export interface SocialTemplateVariables {
  /**
   * `projectName` of the config, else the name of the root `package.json`
   */
  projectName: string
  /**
   * `<name> <version> is out!` when a single version line is released (the
   * root version, or a single package of an `independent` group),
   * `New releases of <projectName>` otherwise
   */
  releaseTitle: string
  /**
   * The version released, empty when several version lines are released
   */
  newVersion: string
  /**
   * Comma-separated `name@version` of the released packages
   */
  packageList: string
  /**
   * Number of released packages
   */
  packageCount: string
  /**
   * Release URL (GitHub/GitLab) of the release, or of its only version line
   */
  releaseUrl?: string
  /**
   * Full changelog URL (`social.changelogUrl`)
   */
  changelogUrl?: string
}

/**
 * A section of a tweet announcing several versions: a `unified`/`selective`
 * group (its version line and highlights), or an `independent` group (its
 * packages, each with its highlights).
 */
export interface TweetSection {
  /**
   * `<title> <version>` of a `unified`/`selective` group, the title of an
   * `independent` group (none without version groups)
   */
  title?: string
  /**
   * Highlights of a `unified`/`selective` group, one bullet each
   */
  highlights?: string[]
  /**
   * Packages of an `independent` group: `<name> <version>`, followed by its first highlight
   */
  packages?: { label: string, highlights: string[] }[]
}

export interface TwitterOptions {
  /**
   * Variables of the template
   */
  variables: SocialTemplateVariables
  /**
   * Changelog of a single version (markdown), or the sections of a release of several versions
   */
  changelog: string | TweetSection[]
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

/**
 * A section of a Slack message announcing several versions: a
 * `unified`/`selective` group (its changelog), or an `independent` group (its
 * packages, each with its changelog).
 */
export interface SlackReleaseSection {
  /**
   * `<title> <version>` of a `unified`/`selective` group, the title of an
   * `independent` group (none without version groups)
   */
  title?: string
  /**
   * Message of the announcement of a `unified`/`selective` group (markdown),
   * shown under its title
   */
  message?: string
  /**
   * Links of the announcement of a `unified`/`selective` group, shown under its message
   */
  links?: SocialLink[]
  /**
   * Changelog of a `unified`/`selective` group (markdown)
   */
  changelog?: string
  /**
   * Packages of an `independent` group, with their changelog (markdown), and
   * the title (replacing the package name), message and links of their announcement
   */
  packages?: { name: string, title?: string, oldVersion?: string, newVersion: string, message?: string, links?: SocialLink[], changelog: string }[]
}

export interface SlackOptions {
  /**
   * Variables of the template, and of the header of the rich blocks format
   */
  variables: SocialTemplateVariables
  /**
   * Changelog of a single version (markdown), or the sections of a release of several versions
   */
  changelog: string | SlackReleaseSection[]
  /**
   * Slack channel ID or name. Required when using token-based auth.
   */
  channel?: string
  /**
   * Slack Bot Token. Ignored if webhookUrl is set.
   */
  token?: string
  /**
   * Slack Incoming Webhook URL. Takes priority over token.
   */
  webhookUrl?: string
  /**
   * Custom message template
   */
  template?: string
  /**
   * Maximum chars of the changelog rendered in the message.
   * Defaults to 2500 in `summary` format and to no limit in `full` format.
   */
  postMaxLength?: number
  /**
   * Changelog rendering of the message
   * @default 'summary'
   */
  changelogFormat?: SlackChangelogFormat
  /**
   * Contributor names (plain strings, no email/handle). Empty array or undefined → no contributors block.
   */
  contributors?: string[]
  /**
   * Packages bumped in this release. Empty array or undefined → no packages block.
   */
  packages?: SlackPackageEntry[]
  /**
   * Announcement of a single version (`social.slack.announcements`): its
   * message, shown before the changelog, and its links, replacing the buttons
   * of the rich blocks format
   */
  announcement?: { message?: string, links: SocialLink[] }
  /**
   * Run without side effects
   * @default false
   */
  dryRun?: boolean
}

/**
 * A bumped-package entry in a Slack message (derived from PackageBumpEntry in src/core/packages.ts).
 * Duplicated here to avoid a core→types back-import; kept in sync by design.
 */
export interface SlackPackageEntry {
  name: string
  oldVersion?: string
  newVersion?: string
  version: string
  hasTransition: boolean
}

export interface TemplatesConfig {
  /**
   * Commit message template (title).
   *
   * Default in `unified`/`selective` modes: `'chore(release): bump version to {{newVersion}}'`.
   * Default in `independent` mode (when not customized): `'chore(release): bump {{packageCount}} packages'`.
   *
   * Available variables:
   * - `{{newVersion}}` - in `independent` mode, comma-separated list of bumped `name@version`; otherwise the new version.
   * - `{{packageCount}}` - number of bumped packages.
   * - `{{packageNames}}` - comma-separated list of bumped package names.
   * - `{{packageList}}` - comma-separated list of bumped `name@version`.
   * - `{{rootVersion}}` - version from the root `package.json`.
   */
  commitMessage?: string
  /**
   * Commit message body template. When defined, it is passed as the commit body.
   *
   * Default in `unified`/`selective` modes: `undefined` (no body).
   * Default in `independent` mode (when `commitMessage` and `commitBody` are not customized): `'{{packageList}}'`.
   *
   * Same variables as `commitMessage`.
   */
  commitBody?: string
  /**
   * Message of the annotated tags. Available variables: {{newVersion}}
   * @default 'Bump version to {{newVersion}}'
   */
  tagMessage?: string
  /**
   * Name of the repository tag (`unified` and `selective` modes, standalone
   * projects), also used to find the previous release. The packages of an
   * `independent` mode are tagged `<name>@<version>`. Available variables: {{newVersion}}
   * @default 'v{{newVersion}}'
   */
  tagBody?: string
  /**
   * Empty changelog content
   * @default 'No relevant changes for this release'
   */
  emptyChangelogContent?: string
  /**
   * Twitter message template
   * Available variables: {{releaseTitle}}, {{projectName}}, {{newVersion}}, {{packageList}}, {{packageCount}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}} (see `SocialTemplateVariables`)
   * @default '📣 {{releaseTitle}}\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}'
   */
  twitterMessage?: string
  /**
   * Slack message template (optional - if not provided, uses rich blocks format)
   * Available variables: {{releaseTitle}}, {{projectName}}, {{newVersion}}, {{packageList}}, {{packageCount}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}, {{contributors}}, {{packages}} (see `SocialTemplateVariables`)
   * @default undefined
   */
  slackMessage?: string
  /**
   * Changelog section title template
   * Available variables: {{oldVersion}}, {{newVersion}}, {{date}}
   * @default '{{oldVersion}}...{{newVersion}}'
   */
  changelogTitle?: string
}

export type HookType = 'before' | 'success' | 'error'
export type HookStep = 'bump' | 'changelog' | 'commit-and-tag' | 'provider-release' | 'publish' | 'push' | 'release' | 'social' | 'twitter' | 'slack' | 'teams'

/**
 * API tokens configuration
 */
export interface TokensConfig {
  /**
   * Registry token for publishing
   * Environment variables, in this order: RELIZY_NPM_TOKEN, NPM_TOKEN, NODE_AUTH_TOKEN
   */
  registry?: string
  /**
   * GitHub token for creating releases
   * Environment variables, in this order: RELIZY_GITHUB_TOKEN, GITHUB_TOKEN, GH_TOKEN
   */
  github?: string
  /**
   * GitLab token for creating releases
   * Environment variables, in this order: RELIZY_GITLAB_TOKEN, GITLAB_TOKEN, GITLAB_API_TOKEN, CI_JOB_TOKEN
   */
  gitlab?: string
  /**
   * Twitter API credentials for posting tweets
   * Environment variables: RELIZY_TWITTER_API_KEY, then TWITTER_API_KEY, and the same for
   * API_KEY_SECRET, ACCESS_TOKEN and ACCESS_TOKEN_SECRET
   */
  twitter?: {
    apiKey?: string
    apiKeySecret?: string
    accessToken?: string
    accessTokenSecret?: string
  }
  /**
   * Slack bot token for posting messages
   * Environment variables, in this order: RELIZY_SLACK_TOKEN, SLACK_TOKEN
   */
  slack?: string
  /**
   * AI provider credentials
   */
  ai?: {
    'claude-code'?: {
      apiKey?: string
      oauthToken?: string
    }
  }
}

/**
 * Third parameter of the function hooks of the steps, when the release is
 * known (in `relizy release`, and in the commands given a bump result)
 */
export interface HookContext {
  /**
   * Result of the bump of the release
   */
  bumpResult: BumpResultTruthy
  /**
   * The packages and versions of the release, by version group (in the
   * `twitter` and `slack` hooks, what the post announces)
   */
  release: ReleaseOverview
}

/**
 * Hooks configuration
 * Useful to run custom scripts before, after a step or on error
 */
export type HookConfig = {
  [K in `${HookType}:${HookStep}`]?: string | ((config: ResolvedRelizyConfig, dryRun: boolean, context?: HookContext) => any)
} & {
  'generate:changelog'?: (config: ResolvedRelizyConfig, dryRun: boolean, params: {
    commits: GitCommit[]
    changelog: string
  }) => string | void | null | undefined | Promise<string | void | null | undefined>
}

/**
 * The context of a custom commitlint rule
 */
export type CommitlintCustomRuleContext = CoreCommitlintCustomRuleContext<ResolvedRelizyConfig>

/**
 * A rule written as a function. Returns `true` when the commit is valid, an
 * error message (or `false`) otherwise, or a commitlint-style `[valid, message?]`
 * tuple so `commitlint-plugin-function-rules` rules can be copied as is. It
 * receives the resolved relizy config in its context.
 */
export type CommitlintCustomRule = CoreCommitlintCustomRule<ResolvedRelizyConfig>

export interface CommitlintConfig {
  /**
   * Glob patterns of directories to treat as workspace packages for the scopes,
   * in addition to `monorepo.packages`, e.g. apps that are never released.
   * @example ['apps/*']
   */
  packages?: string[]
  /**
   * Scopes allowed in addition to the workspace packages (short name, full name
   * or folder) and the `scopeMap` keys. In standalone mode, scopes are free
   * unless this list is set.
   * @example ['ci', 'deps', 'release']
   */
  scopes?: string[]
  /**
   * Level and value of the built-in and custom rules.
   * @example { 'header-max-length': ['error', 200], 'scope-required': ['error', 'when-bumping'] }
   */
  rules?: CommitlintRulesConfig
  /**
   * Rules written as functions, keyed by name. Their level is set in `rules`
   * and defaults to `error`.
   */
  customRules?: Record<string, CommitlintCustomRule>
  /**
   * Messages to ignore, in addition to the default ones: a regular expression
   * tested against the header, or a function receiving the raw message.
   */
  ignores?: Array<RegExp | ((message: string) => boolean)>
  /**
   * Ignore merge commits, `fixup!`, `squash!` and `amend!` commits, and the
   * release commits of relizy.
   * @default true
   */
  defaultIgnores?: boolean
  /**
   * In the CI of a pull/merge request, also lint its title, which becomes the
   * commit message of a squash merge. Overridden by `--title` and `--no-title`.
   * @default false
   */
  title?: boolean
  /**
   * Tool checking the changelog entry of a commit, as written in the
   * changelogs (`body-changelog-lint`): the whole entry with ESLint, its code
   * blocks with oxc.
   * @default 'auto'
   */
  changelogLinter?: CommitlintChangelogLinter
  /**
   * URL printed with the errors, e.g. the commit guidelines of the team.
   */
  helpUrl?: string
}

/**
 * Relizy configuration
 * @see https://relizy.dev/config/overview
 */
/**
 * A named way of releasing (`beta`, `canary`, `latest`...): config options applied over the
 * config file when it is selected, with `--profile <name>` or the `profile` option.
 *
 * The precedence is: defaults, config file, profile, then the options of the run (the
 * CLI flags, the options of the API).
 */
export interface RelizyProfile {
  /**
   * What the profile is for, shown by `relizy` consumers that list the profiles
   */
  description?: string
  /**
   * Bump options of the profile, e.g. `{ type: 'prerelease', preid: 'beta' }`
   */
  bump?: BumpConfig
  /**
   * Changelog options of the profile
   */
  changelog?: ChangelogConfig
  /**
   * Publish options of the profile, e.g. `{ tag: 'beta' }`
   */
  publish?: PublishConfig
  /**
   * Release options of the profile, e.g. `{ canary: true }` or `{ social: false }`
   */
  release?: ReleaseConfig
  /**
   * Social media options of the profile
   */
  social?: SocialConfig
  /**
   * PR comment options of the profile
   */
  prComment?: PrCommentConfig
  /**
   * AI options of the profile
   */
  ai?: AIConfig
  /**
   * Safety check of the profile
   */
  safetyCheck?: boolean
}

export type OnRewrittenTag = 'prompt' | 'ephemeral' | 'rebind' | 'error'

export interface RelizyConfig {
  /**
   * Project name
   * Useful for tweet and slack posts
   */
  projectName?: string

  /**
   * Commit types: the title of their section in the changelog and the bump
   * they trigger (`semver`: `major`, `minor` or `patch`, none to only list
   * them in the changelog). `false` leaves the commits of the type out of the
   * changelog and of the bump.
   */
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
   * Renames the scopes of the commits in the changelog (`{ ui: 'components' }`).
   * Its keys are also allowed scopes for `relizy commitlint`.
   * @default {}
   */
  scopeMap?: Record<string, string>
  /**
   * Authors (names or emails) left out of the contributors of the changelog,
   * e.g. `['dependabot[bot]']`.
   * @default []
   */
  excludeAuthors?: string[]
  /**
   * Do not list the contributors in the changelog.
   * @default false
   */
  noAuthors?: boolean
  /**
   * Do not show the emails of the contributors in the changelog.
   */
  hideAuthorEmail?: boolean
  /**
   * Sign the release tags with GPG (`git tag -s`).
   */
  signTags?: boolean
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
   * PR comment configuration
   */
  prComment?: PrCommentConfig
  /**
   * Merge preview of a pull request (`relizy merge-preview`): what
   * its merge releases, posted before the merge
   */
  mergePreview?: MergePreviewConfig
  /**
   * API tokens configuration
   */
  tokens?: TokensConfig
  /**
   * AI-powered changelog and release notes configuration
   */
  ai?: AIConfig
  /**
   * Hooks config
   */
  hooks?: HookConfig
  /**
   * Named ways of releasing (`beta`, `canary`, `latest`...), selected with
   * `relizy release --profile <name>` or the `profile` option of the API. A profile
   * sets config options (`bump`, `publish`, `release`...) over the config file,
   * the flags of the command still win over it.
   * @example { beta: { description: 'Prerelease for testers', bump: { type: 'prerelease', preid: 'beta' }, publish: { tag: 'beta' } } }
   */
  profiles?: Record<string, RelizyProfile>
  /**
   * Commit message linter (`relizy commitlint`) config
   * @see https://relizy.dev/commitlint/
   */
  commitlint?: CommitlintConfig
  /**
   * Set log level
   * @default 'default'
   */
  logLevel?: RelizyLogLevel
  /**
   * Global safety check. The safety check will verify if tokens or others required for release are set (depends on the release options)
   * @default true
   */
  safetyCheck?: boolean
  /**
   * Detect when the resolved `from` tag points to a commit that is no longer
   * reachable from `to` (typically because the history was rebased after the
   * tag was created). When enabled, relizy explains the situation and either
   * prompts or auto-corrects, avoiding bloated changelogs and over-bumping.
   * @default true
   */
  detectRewrittenTags?: boolean
  /**
   * Strategy applied when a rewritten/orphaned `from` tag is detected.
   * Defaults to `prompt` interactively, or `ephemeral` when non-interactive
   * (`--yes` / no TTY / CI).
   * - `prompt`: interactive selection.
   * - `ephemeral`: use the reachable equivalent commit for this run only.
   * - `rebind`: move the local tag onto the equivalent commit (no push).
   * - `error`: throw and stop.
   */
  onRewrittenTag?: OnRewrittenTag
}
