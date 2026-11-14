/** A supported package manager: `npm`, `yarn`, `pnpm` or `bun` */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'
/** A supported git hosting provider: `github`, `gitlab` or `bitbucket` */
export type GitProvider = 'github' | 'gitlab' | 'bitbucket'

/** What to do with the private packages of a workspace: `ignore` them or `release` them */
export type PrivatePackages = 'ignore' | 'release'

/** Repository of a project: its provider, its domain and its `owner/name` */
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
   * Git provider (e.g. `github` or `gitlab`)
   * @default 'github'
   */
  provider?: GitProvider
}

/** A reference found in a commit: a hash, an issue or a pull request */
export interface Reference {
  /** `hash` for a commit, `issue`, `pull-request` for a pull or merge request */
  type: 'hash' | 'issue' | 'pull-request'
  /** The reference as written, e.g. `#12` for an issue or a pull request */
  value: string
}

/** A package of a workspace, read from its `package.json` */
export interface ReadPackage {
  /** The `name` of the `package.json` */
  name: string
  /** The current version, from the `package.json` */
  version: string
  /** Whether the package is private */
  private: boolean
  /** Absolute path of the directory of the package */
  path: string
}

/** A registry a package is published to, with its auth and its publish options */
export interface RegistryTarget {
  /**
   * Optional label used in logs to identify this registry (e.g. `nexus-internal`)
   */
  name?: string
  /**
   * Registry URL (e.g. `https://registry.npmjs.org/`, a Nexus or JFrog URL)
   */
  registry: string
  /**
   * Registry token - supported for npm, pnpm and bun (injected via `.npmrc`).
   * Yarn is not supported (it uses `.yarnrc.yml`); configure its auth yourself.
   */
  token?: string
  /**
   * Publish tag (e.g. `latest`)
   */
  tag?: string
  /**
   * Publish access level (e.g. `public` or `restricted`)
   */
  access?: 'public' | 'restricted'
  /**
   * OTP for this registry (e.g. `123456`)
   */
  otp?: string
  /**
   * Glob patterns of the package names this registry applies to: it routes
   * the published packages to this registry. Omitted or empty, it applies to
   * every published package (mirroring).
   */
  packageFilter?: string[]
  /**
   * When true, packages matched by this target are published ONLY to this
   * (and any other matching) registry - the default `publish.registry` is
   * skipped for them. Without this flag, `registries` is purely additive:
   * matched packages are published to this registry ON TOP OF the default one.
   * @default false
   */
  exclusive?: boolean
}

/**
 * Where the functions report what they do. Every method is optional, a function
 * without logger is silent. The messages come first; the details (an error, a
 * value) follow as extra arguments, as a console-like logger takes them.
 */
export interface CoreLogger {
  /** Detail useful when debugging */
  debug?: (message: string, ...details: unknown[]) => void
  /** Progress or result worth telling */
  info?: (message: string, ...details: unknown[]) => void
  /** A step that went well */
  success?: (message: string, ...details: unknown[]) => void
  /** Something wrong that does not stop the function */
  warn?: (message: string, ...details: unknown[]) => void
  /** A step that failed */
  fail?: (message: string, ...details: unknown[]) => void
  /** An error, taken as is (not a message) */
  error?: (error: unknown, ...details: unknown[]) => void
  /** Very detailed trace */
  verbose?: (message: string, ...details: unknown[]) => void
}

/** The author of a commit */
export interface GitCommitAuthor {
  /** Name of the author */
  name: string
  /** Email of the author */
  email: string
}

/** A commit read from `git log`, before any parsing (see `getGitDiff`) */
export interface RawGitCommit {
  /** The subject (first line) */
  message: string
  /** The body, followed by the `--name-status` list of the files of the commit */
  body: string
  /** The abbreviated commit hash */
  shortHash: string
  /** The full commit hash, read by `getGitDiff`: none for a commit built by hand (the simulated squash commit) */
  hash?: string
  /** The author of the commit */
  author: GitCommitAuthor
}

/** A conventional commit, as parsed by `parseCommits` */
export interface GitCommit extends RawGitCommit {
  /** The subject without its type, scope and references */
  description: string
  /** `feat`, `fix`... */
  type: string
  /** The scope after `scopeMap`, empty when there is none */
  scope: string
  /** The hash, the pull requests and the issues the commit refers to */
  references: Reference[]
  /** The author, then the `Co-authored-by` ones */
  authors: GitCommitAuthor[]
  /** `!` in the header, or `breaking change:` in the body */
  isBreaking: boolean
}

/** Bump a commit triggers, or a release asks for: a semver release type */
export type SemverBumpType = 'major' | 'premajor' | 'minor' | 'preminor' | 'patch' | 'prepatch' | 'prerelease'

/**
 * The commit types of a project: the title of their section in the changelog
 * and the bump they trigger. `false` leaves the commits of the type out.
 */
export type CommitTypes = Record<string, {
  /** The title of the section of the type in the changelog */
  title: string
  /** The bump the type triggers */
  semver?: SemverBumpType
} | false>

/**
 * Release type of a bump: a semver release type, or `release` to compute it
 * from the commits (the `ReleaseType` of semver)
 */
export type BumpReleaseType = SemverBumpType | 'release'

/**
 * A package of a workspace with what a release knows about it: the commits
 * since its previous release, its dependencies and, once planned, its new
 * version and why it is bumped
 */
export interface PackageBase extends ReadPackage {
  /** Tag (or commit) its commits are read from */
  fromTag: string
  /** Its commits since `fromTag` */
  commits: GitCommit[]
  /** Version after the bump */
  newVersion?: string
  /** The workspace packages it depends on */
  dependencies: string[]
  /** Reason for bumping */
  reason?: 'commits' | 'dependency' | 'graduation'
  /** The chain of dependencies that bumps it, for the packages bumped as dependents */
  dependencyChain?: string[]
  /**
   * Peer dependency making a breaking change (a new major, a new minor in `0.x`)
   * that the published range of the package rejects: the package is bumped as
   * for a breaking commit.
   */
  breakingPeerDependency?: string
  /**
   * Dependency whose new version the published range of this package rejects:
   * the package is bumped as a dependent for it
   */
  outOfRangeDependency?: {
    /** Name of the dependency */
    name: string
    /** Field of the `package.json` declaring the dependency */
    field: 'dependencies' | 'devDependencies' | 'peerDependencies'
    /** Range the package was published with, null when the specifier is not a semver range (`catalog:`, `link:`...) */
    range: string | null
    /** New version of the dependency */
    newVersion: string
  }
}
