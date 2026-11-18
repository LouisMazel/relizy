import type { BumpConfig, GitProvider, PackageManager, PrCommentMode, RelizyConfig, VersionMode } from '../types'
import type { ChangelogFormatter } from './changelog-format'
import type { ResolvedRelizyConfig } from './config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { detectGitProvider, getPackageManagerWorkspaces, getPackageManagerWorkspaceSources, GLOB_IGNORE } from '@relizy/core'
import fastGlob from 'fast-glob'
import * as semver from 'semver'
import { addAgentRulesCommand } from './agents'
import { findChangelogFormatter } from './changelog-format'
import { HOOK_INSTALL_COMMAND } from './commitlint'
import { getDefaultConfig } from './config'
import { DEFAULT_RELEASE_COMMIT_MESSAGES } from './format'
import { detectPackageManager } from './npm-registry'

/**
 * A package found by `relizy init`, released or not (apps, private packages...).
 */
export interface InitPackage {
  /** Name from the package.json */
  name: string
  /** Path relative to the repository root, POSIX separators */
  path: string
  /** Version from the package.json, unset for the apps without version */
  version?: string
  private: boolean
  /** `publishConfig.access` of the package.json */
  access?: 'public' | 'restricted'
  /** `publishConfig.registry` of the package.json */
  registry?: string
}

/**
 * A package glob of the workspace and the packages it matches.
 */
export interface InitWorkspace {
  /** Glob from the workspace config, e.g. `packages/*` */
  pattern: string
  packages: InitPackage[]
}

/**
 * Everything `relizy init` reads from the repository, to ask as few questions as possible.
 */
export interface ProjectDetection {
  cwd: string
  root: {
    name?: string
    version?: string
    private: boolean
    scripts: Record<string, string>
    /** relizy is in the dependencies of the root package.json */
    hasRelizy: boolean
    /** The formatter of the changelogs, from the dependencies of the root package.json */
    formatter?: ChangelogFormatter
    access?: 'public' | 'restricted'
    registry?: string
  }
  /** Package globs of the workspace matching at least one package */
  workspaces: InitWorkspace[]
  /** Files declaring the workspace, e.g. `pnpm-workspace.yaml` */
  workspaceFiles: string[]
  packageManager: PackageManager
  provider: GitProvider | null
  /** Config file already present for this config name, relative to `cwd` */
  existingConfigFile?: string
}

/**
 * - `publish`: version the packages and publish them to a registry
 * - `version`: only version the project (bump, changelog, tags, provider releases)
 */
export type InitGoal = 'publish' | 'version'

export type DependencyType = NonNullable<BumpConfig['dependencyTypes']>[number]

export type InitAITarget = 'providerRelease' | 'twitter' | 'slack' | 'teams'

/**
 * Answers of `relizy init`, detected values when a question is not asked.
 */
export interface InitAnswers {
  goal: InitGoal
  /** Package globs to release, empty in standalone mode */
  patterns: string[]
  /** Unset in standalone mode */
  versionMode?: VersionMode
  dependencyTypes: DependencyType[]
  capZeroMajor: boolean
  rootChangelog: boolean
  /** Commit types removed from the changelogs */
  hiddenTypes: string[]
  formatCmd?: string
  access?: 'public' | 'restricted'
  registry?: string
  buildCmd?: string
  twitter: boolean
  slack: boolean
  slackChannel?: string
  teams: boolean
  changelogUrl?: string
  prCommentMode: PrCommentMode
  ai: InitAITarget[]
  aiLanguage: string
}

const CONFIG_EXTENSIONS = [
  'ts',
  'mts',
  'cts',
  'js',
  'mjs',
  'cjs',
  'json',
  'jsonc',
  'json5',
  'yaml',
  'yml',
  'toml',
]
const PUBLIC_NPM_REGISTRY = 'https://registry.npmjs.org'

function readJson(path: string): Record<string, any> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed && typeof parsed === 'object'
      ? parsed
      : undefined
  }
  catch {
    return undefined
  }
}

function getAccess(json: Record<string, any>): 'public' | 'restricted' | undefined {
  const access = json.publishConfig?.access
  return access === 'public' || access === 'restricted'
    ? access
    : undefined
}

function getRegistry(json: Record<string, any>): string | undefined {
  const registry = json.publishConfig?.registry
  return typeof registry === 'string' && registry
    ? registry
    : undefined
}

function readInitPackage(cwd: string, path: string): InitPackage | undefined {
  const json = readJson(join(cwd, path, 'package.json'))
  if (!json || typeof json.name !== 'string' || !json.name) {
    return undefined
  }

  return {
    name: json.name,
    path,
    version: typeof json.version === 'string' && json.version
      ? json.version
      : undefined,
    private: json.private === true,
    access: getAccess(json),
    registry: getRegistry(json),
  }
}

function detectWorkspaces(cwd: string): InitWorkspace[] {
  const globs = getPackageManagerWorkspaces(cwd).map(pattern => pattern.replace(/^\.\//, ''))
  const negated = globs.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1))
  const seen = new Set<string>()

  return globs
    .filter(pattern => !pattern.startsWith('!'))
    .map((pattern) => {
      const directories = fastGlob.sync(pattern, {
        cwd,
        onlyDirectories: true,
        ignore: [
          ...GLOB_IGNORE,
          ...negated,
        ],
      })
      const packages = directories
        .map(directory => directory.replace(/\/$/, ''))
        .filter(directory => directory !== '' && directory !== '.' && !seen.has(directory))
        .sort()
        .flatMap((directory) => {
          const pkg = readInitPackage(cwd, directory)
          if (!pkg) {
            return []
          }
          seen.add(directory)
          return [pkg]
        })
      return { pattern, packages }
    })
    .filter(workspace => workspace.packages.length > 0)
}

function findExistingConfigFile(cwd: string, configName: string, rootJson: Record<string, any>): string | undefined {
  const file = CONFIG_EXTENSIONS.map(extension => `${configName}.config.${extension}`).find(name => existsSync(join(cwd, name)))
  if (file) {
    return file
  }
  return configName === 'relizy' && rootJson.relizy
    ? 'package.json'
    : undefined
}

/**
 * Read the repository: root package.json, workspace packages, package manager,
 * git provider and existing relizy config.
 */
export function detectProject({ cwd, configName = 'relizy' }: { cwd: string, configName?: string }): ProjectDetection {
  const rootJson = readJson(join(cwd, 'package.json'))
  if (!rootJson) {
    throw new Error(`No package.json found in ${cwd}, run relizy init at the root of the project`)
  }

  const dependencies = {
    ...rootJson.dependencies,
    ...rootJson.devDependencies,
  }

  return {
    cwd,
    root: {
      name: typeof rootJson.name === 'string' && rootJson.name
        ? rootJson.name
        : undefined,
      version: typeof rootJson.version === 'string' && rootJson.version
        ? rootJson.version
        : undefined,
      private: rootJson.private === true,
      scripts: rootJson.scripts && typeof rootJson.scripts === 'object'
        ? rootJson.scripts
        : {},
      hasRelizy: 'relizy' in dependencies,
      formatter: findChangelogFormatter(dependencies),
      access: getAccess(rootJson),
      registry: getRegistry(rootJson),
    },
    workspaces: detectWorkspaces(cwd),
    workspaceFiles: getPackageManagerWorkspaceSources(cwd).map(source => source.file),
    packageManager: detectPackageManager(cwd),
    provider: detectGitProvider(cwd),
    existingConfigFile: findExistingConfigFile(cwd, configName, rootJson),
  }
}

/** Released by relizy for this goal: private packages are only versioned, never published */
export function isReleasablePackage(pkg: InitPackage, goal: InitGoal): boolean {
  return pkg.version !== undefined && (goal === 'version' || !pkg.private)
}

/** Workspace globs containing versioned packages, the only ones relizy can release */
export function getCandidateWorkspaces(detection: ProjectDetection): InitWorkspace[] {
  return detection.workspaces.filter(workspace => workspace.packages.some(pkg => pkg.version !== undefined))
}

/** A monorepo for relizy: at least one workspace package has a version */
export function isMonorepoProject(detection: ProjectDetection): boolean {
  return getCandidateWorkspaces(detection).length > 0
}

/** Publish when a package can be published (versioned and not private) */
export function suggestGoal(detection: ProjectDetection): InitGoal {
  if (!isMonorepoProject(detection)) {
    return detection.root.private ? 'version' : 'publish'
  }
  return detection.workspaces.some(workspace => workspace.packages.some(pkg => isReleasablePackage(pkg, 'publish')))
    ? 'publish'
    : 'version'
}

/** Globs containing at least one package released for this goal */
export function suggestPatterns(detection: ProjectDetection, goal: InitGoal): string[] {
  const patterns = getCandidateWorkspaces(detection)
    .filter(workspace => workspace.packages.some(pkg => isReleasablePackage(pkg, goal)))
    .map(workspace => workspace.pattern)
  // Only private packages while publishing: still version them
  return patterns.length > 0
    ? patterns
    : getCandidateWorkspaces(detection).map(workspace => workspace.pattern)
}

/** Packages matched by the globs */
function getPackagesOfPatterns(detection: ProjectDetection, patterns: string[]): InitPackage[] {
  return detection.workspaces.filter(workspace => patterns.includes(workspace.pattern)).flatMap(workspace => workspace.packages)
}

/**
 * Packages released with these answers: in `publish` mode, the private ones
 * are only versioned when no package can be published.
 */
export function getReleasedPackages(detection: ProjectDetection, goal: InitGoal, patterns: string[]): InitPackage[] {
  const packages = getPackagesOfPatterns(detection, patterns)
  const released = packages.filter(pkg => isReleasablePackage(pkg, goal))
  return released.length > 0
    ? released
    : packages.filter(pkg => isReleasablePackage(pkg, 'version'))
}

/** Packages already on different versions are versioned independently */
export function suggestVersionMode(packages: InitPackage[]): VersionMode {
  return new Set(packages.map(pkg => pkg.version)).size > 1
    ? 'independent'
    : 'selective'
}

function getCommonValue<T>(values: (T | undefined)[]): T | undefined {
  const defined = [
    ...new Set(values.filter((value): value is T => value !== undefined)),
  ]
  return defined.length === 1
    ? defined[0]
    : undefined
}

/** Run a script of the root package.json with the package manager */
export function getRunCommand(packageManager: PackageManager, script: string): string {
  return `${packageManager} run ${script}`
}

/**
 * `publishConfig.access` and `publishConfig.registry` shared by the released
 * packages: npm already applies them, they are only the defaults of the questions.
 */
export function getDetectedPublishConfig(detection: ProjectDetection, { goal, patterns }: { goal: InitGoal, patterns: string[] }): { access?: 'public' | 'restricted', registry?: string } {
  const released = isMonorepoProject(detection)
    ? getReleasedPackages(detection, goal, patterns)
    : []
  const sources = released.length > 0
    ? released
    : [detection.root]
  return {
    access: getCommonValue(sources.map(pkg => pkg.access)),
    registry: getCommonValue(sources.map(pkg => pkg.registry)),
  }
}

/**
 * Detected answers, used for the questions that are not asked.
 */
export function getDefaultAnswers(detection: ProjectDetection, { goal, patterns }: { goal: InitGoal, patterns: string[] }): InitAnswers {
  const defaults = getDefaultConfig()

  return {
    goal,
    patterns,
    versionMode: isMonorepoProject(detection)
      ? suggestVersionMode(getReleasedPackages(detection, goal, patterns))
      : undefined,
    dependencyTypes: [...defaults.bump.dependencyTypes],
    capZeroMajor: defaults.bump.capZeroMajor,
    rootChangelog: defaults.changelog.rootChangelog,
    hiddenTypes: [],
    buildCmd: detection.root.scripts.build
      ? getRunCommand(detection.packageManager, 'build')
      : undefined,
    twitter: false,
    slack: false,
    teams: false,
    prCommentMode: defaults.prComment.mode,
    ai: [],
    aiLanguage: defaults.ai.language,
  }
}

/**
 * The answers of an existing config kept by `relizy init`: the steps after
 * the config (the secrets of the release workflow) follow what it releases
 */
export function getAnswersFromConfig(detection: ProjectDetection, config: ResolvedRelizyConfig): InitAnswers {
  const goal: InitGoal = config.release?.publish === false
    ? 'version'
    : 'publish'
  const socials = ['twitter', 'slack', 'teams'] as const

  return {
    ...getDefaultAnswers(detection, { goal, patterns: [] }),
    twitter: Boolean(config.social?.twitter?.enabled),
    slack: Boolean(config.social?.slack?.enabled),
    teams: Boolean(config.social?.teams?.enabled),
    ai: [
      ...(config.ai?.providerRelease?.enabled
        ? ['providerRelease' as const]
        : []),
      ...socials.filter(target => config.ai?.social?.[target]?.enabled),
    ],
  }
}

/**
 * `templates.commitMessage` of a resolved config, unless it is a default of
 * relizy
 */
export function getCustomCommitMessage(config: ResolvedRelizyConfig): string | undefined {
  const message = config.templates?.commitMessage
  return message && !Object.values(DEFAULT_RELEASE_COMMIT_MESSAGES).includes(message as never)
    ? message
    : undefined
}

export function isPublicNpmRegistry(registry: string): boolean {
  return registry === PUBLIC_NPM_REGISTRY || registry === `${PUBLIC_NPM_REGISTRY}/`
}

/** The provider releases and the PR comments only support GitHub and GitLab */
export function supportsProviderRelease(provider: GitProvider | null): boolean {
  return provider === 'github' || provider === 'gitlab'
}

/**
 * The relizy config of the answers, with only the values differing from the defaults.
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export function buildInitConfig(detection: ProjectDetection, answers: InitAnswers): RelizyConfig {
  // Only the values that differ from the defaults are written
  const defaults = getDefaultConfig()
  const config: RelizyConfig = {}
  const isMonorepo = isMonorepoProject(detection) && answers.patterns.length > 0

  if (isMonorepo) {
    const packages = getPackagesOfPatterns(detection, answers.patterns)
    // relizy needs a name and a version in every package it reads
    const ignored = packages.filter(pkg => pkg.version === undefined).map(pkg => pkg.path)
    const released = getReleasedPackages(detection, answers.goal, answers.patterns)

    config.monorepo = {
      versionMode: answers.versionMode ?? 'selective',
      packages: answers.patterns,
      ...(ignored.length > 0 && { ignored }),
      ...(released.some(pkg => pkg.private) && { privatePackages: 'release' as const }),
    }
  }

  if (answers.hiddenTypes.length > 0) {
    config.types = Object.fromEntries(answers.hiddenTypes.map(type => [type, false]))
  }

  const bump: BumpConfig = {
    ...(isMonorepo && answers.dependencyTypes.join() !== defaults.bump.dependencyTypes.join() && { dependencyTypes: answers.dependencyTypes }),
    ...(answers.capZeroMajor !== defaults.bump.capZeroMajor && { capZeroMajor: answers.capZeroMajor }),
  }
  if (Object.keys(bump).length > 0) {
    config.bump = bump
  }

  const changelog = {
    ...(isMonorepo && answers.rootChangelog !== defaults.changelog.rootChangelog && { rootChangelog: answers.rootChangelog }),
    ...(answers.formatCmd && { formatCmd: answers.formatCmd }),
  }
  if (Object.keys(changelog).length > 0) {
    config.changelog = changelog
  }

  if (answers.goal === 'publish') {
    const publish = {
      ...(answers.access && { access: answers.access }),
      ...(answers.registry && !isPublicNpmRegistry(answers.registry) && { registry: answers.registry }),
      ...(answers.buildCmd && { buildCmd: answers.buildCmd }),
    }
    if (Object.keys(publish).length > 0) {
      config.publish = publish
    }
  }

  const providerRelease = supportsProviderRelease(detection.provider)
  const release = {
    ...(answers.goal === 'version' && { publish: false }),
    ...(!providerRelease && { providerRelease: false, prComment: false }),
  }
  if (Object.keys(release).length > 0) {
    config.release = release
  }

  if (answers.twitter || answers.slack || answers.teams) {
    config.social = {
      ...(answers.twitter && {
        twitter: { enabled: true },
      }),
      ...(answers.slack && {
        slack: {
          enabled: true,
          ...(answers.slackChannel && { channel: answers.slackChannel }),
        },
      }),
      // The AI rewrites the changelog of the cards: they show it
      ...(answers.teams && {
        teams: {
          enabled: true,
          ...(answers.ai.includes('teams') && { changelog: 'summary' as const }),
        },
      }),
      ...(answers.changelogUrl && { changelogUrl: answers.changelogUrl }),
    }
  }

  if (providerRelease && answers.prCommentMode !== defaults.prComment.mode) {
    config.prComment = { mode: answers.prCommentMode }
  }

  if (answers.ai.length > 0) {
    const social = {
      ...(answers.ai.includes('twitter') && {
        twitter: { enabled: true },
      }),
      ...(answers.ai.includes('slack') && {
        slack: { enabled: true },
      }),
      ...(answers.ai.includes('teams') && {
        teams: { enabled: true },
      }),
    }
    config.ai = {
      ...(answers.aiLanguage && answers.aiLanguage !== defaults.ai.language && { language: answers.aiLanguage }),
      ...(answers.ai.includes('providerRelease') && {
        providerRelease: { enabled: true },
      }),
      ...(Object.keys(social).length > 0 && { social }),
    }
  }

  return config
}

/**
 * Fields relizy needs in the root package.json and that are missing: the
 * version is the highest one of the packages in `unified`/`selective` mode.
 */
export function getMissingRootFields(detection: ProjectDetection, answers: InitAnswers): { name?: string, version?: string } {
  const fields: { name?: string, version?: string } = {}

  if (!detection.root.name) {
    fields.name = basename(detection.cwd)
  }

  if (!detection.root.version) {
    const versions = answers.versionMode && answers.versionMode !== 'independent'
      ? getReleasedPackages(detection, answers.goal, answers.patterns).flatMap(pkg => pkg.version && semver.valid(pkg.version)
          ? [pkg.version]
          : [])
      : []
    fields.version = versions.sort(semver.rcompare)[0] ?? '0.0.0'
  }

  return fields
}

/** Scripts to add to the root package.json, the existing ones are kept */
export function getScriptsToAdd(detection: ProjectDetection): Record<string, string> {
  return detection.root.scripts.release
    ? {}
    : { release: 'relizy release' }
}

/**
 * The `prepare` script run at each install: `relizy commitlint --install` with `hook` (the commit-msg hook of `.git/hooks`, not versioned, written on each clone),
 * and `relizy mcp update` with `agents` (existing rules only: nothing is created, and the MCP config of the user is never touched).
 * An existing `prepare` script is extended, or left as is when it already runs these commands (`relizy mcp init` for the rules).
 */
export function getPrepareScript(detection: ProjectDetection, { agents = true, hook = false }: { agents?: boolean, hook?: boolean } = {}): Record<string, string> {
  const existing = detection.root.scripts.prepare
  let prepare = existing
  if (hook && !prepare?.includes(HOOK_INSTALL_COMMAND)) {
    prepare = prepare
      ? `${prepare} && ${HOOK_INSTALL_COMMAND}`
      : HOOK_INSTALL_COMMAND
  }
  if (agents) {
    prepare = addAgentRulesCommand(prepare) ?? prepare
  }

  return prepare && prepare !== existing
    ? { prepare }
    : {}
}

/**
 * Add fields and scripts to the root package.json, keeping its indentation
 * and the order of its fields.
 */
export function updateRootPackageJson({ cwd, fields = {}, scripts = {} }: {
  cwd: string
  fields?: { name?: string, version?: string }
  scripts?: Record<string, string>
}): void {
  const path = join(cwd, 'package.json')
  const content = readFileSync(path, 'utf8')
  const indent = /^([ \t]+)"/m.exec(content)?.[1] ?? '  '
  const json: Record<string, any> = JSON.parse(content)

  // A missing name goes first and a missing version after the name, as written by the package managers
  const updated: Record<string, any> = {}
  const addMissing = (key: 'name' | 'version') => {
    if (!(key in json) && fields[key] !== undefined) {
      updated[key] = fields[key]
    }
  }
  if (!('name' in json)) {
    addMissing('name')
    addMissing('version')
  }
  for (const [key, value] of Object.entries(json)) {
    updated[key] = key === 'name' || key === 'version'
      ? fields[key] ?? value
      : value
    if (key === 'name') {
      addMissing('version')
    }
  }
  if (Object.keys(scripts).length > 0) {
    updated.scripts = {
      ...json.scripts,
      ...scripts,
    }
  }

  writeFileSync(path, `${JSON.stringify(updated, null, indent)}\n`)
}

/** Command installing relizy as a dev dependency of the root package */
/** The command adding relizy to the devDependencies of the root package.json, at `version` when given */
export function getInstallCommand(detection: ProjectDetection, version?: string): string {
  const relizy = version
    ? `relizy@^${version}`
    : 'relizy'

  switch (detection.packageManager) {
    case 'pnpm':
      return existsSync(join(detection.cwd, 'pnpm-workspace.yaml'))
        ? `pnpm add -D -w ${relizy}`
        : `pnpm add -D ${relizy}`
    case 'yarn':
      return `yarn add -D ${relizy}`
    case 'bun':
      return `bun add -d ${relizy}`
    default:
      return `npm install -D ${relizy}`
  }
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/\n/g, '\\n')}'`
}

function serialize(value: unknown, depth: number): string {
  if (typeof value === 'string') {
    return quote(value)
  }

  if (Array.isArray(value)) {
    const items = value.map(item => serialize(item, depth + 1))
    const inline = `[${items.join(', ')}]`
    if (inline.length <= 60 && !inline.includes('\n')) {
      return inline
    }
    const padding = '  '.repeat(depth + 1)
    const lines = items.map(item => `${padding}${item},`)
    return `[\n${lines.join('\n')}\n${'  '.repeat(depth)}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return '{}'
    }
    const padding = '  '.repeat(depth + 1)
    const lines = entries.map(([key, item]) => `${padding}${/^[a-z_$][\w$]*$/i.test(key)
      ? key
      : quote(key)}: ${serialize(item, depth + 1)},`)
    return `{\n${lines.join('\n')}\n${'  '.repeat(depth)}}`
  }

  return String(value)
}

/**
 * Content of the `relizy.config.ts` file.
 */
export function renderConfigFile(config: RelizyConfig): string {
  return [
    `import { defineConfig } from 'relizy'`,
    '',
    '// All the options: https://relizy.dev/config/overview',
    `export default defineConfig(${serialize(config, 0)})`,
    '',
  ].join('\n')
}
