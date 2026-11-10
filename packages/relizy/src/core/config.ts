import type { LogLevel } from '@maz-ui/node'
import type { DeepPartial } from '@maz-ui/utils/ts-helpers/DeepPartial'
import type { ReleaseType } from 'semver'
import type { AIConfig, BumpConfig, ChangelogConfig, CommitlintConfig, MergePreviewConfig, MonorepoConfig, PrCommentConfig, PublishConfig, ReleaseConfig, RelizyConfig, SocialChangelog, SocialConfig, TeamsCardsMode } from '../types'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { formatJson } from '@maz-ui/utils/helpers/formatJson'
import { getEnvNpmToken, getGhCliToken, getRepoConfig, isInCI, redactSecrets, resolveRepoConfig } from '@relizy/core'

import { loadConfig, setupDotenv } from 'c12'
import { createDefu } from 'defu'
import { DEFAULT_RELEASE_COMMIT_MESSAGES } from './format'
import { getVersionGroupName, markVersionGroupConfig, validateVersionGroups } from './groups'
import { detectPackageManager, getNpmRegistry } from './npm-registry'

/**
 * @param cwd - Root of the project, where the package manager is detected
 */
export function getDefaultConfig(cwd = process.cwd()) {
  return {
    cwd,
    types: {
      feat: { title: '🚀 Enhancements', semver: 'minor' },
      perf: { title: '🔥 Performance', semver: 'patch' },
      fix: { title: '🩹 Fixes', semver: 'patch' },
      refactor: { title: '💅 Refactors', semver: 'patch' },
      docs: { title: '📖 Documentation', semver: 'patch' },
      build: { title: '📦 Build', semver: 'patch' },
      types: { title: '🌊 Types', semver: 'patch' },
      chore: { title: '🏡 Chore' },
      examples: { title: '🏀 Examples' },
      test: { title: '✅ Tests' },
      style: { title: '🎨 Styles' },
      ci: { title: '🤖 CI' },
    } as NonNullable<RelizyConfig['types']>,
    templates: {
      // commitMessage & commitBody are resolved dynamically in loadRelizyConfig based on monorepo.versionMode.
      commitMessage: undefined as string | undefined,
      commitBody: undefined as string | undefined,
      tagMessage: 'Bump version to {{newVersion}}',
      tagBody: 'v{{newVersion}}',
      emptyChangelogContent: 'No relevant changes for this release',
      twitterMessage: '📣 {{releaseTitle}}\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}',
      slackMessage: undefined, // Use rich blocks format by default (no template)
      changelogTitle: '{{oldVersion}}...{{newVersion}}',
    },
    excludeAuthors: [],
    noAuthors: false,
    bump: {
      type: 'release' satisfies ReleaseType,
      clean: true,
      dependencyTypes: ['dependencies'],
      yes: false,
      capZeroMajor: true,
      outOfRangePeers: 'bump',
      dependents: 'out-of-range',
    } as Required<Omit<BumpConfig, 'preid'>>,
    changelog: {
      rootChangelog: true,
      includeCommitBody: true,
    } as Required<ChangelogConfig>,
    monorepo: {
      privatePackages: 'ignore',
    } as MonorepoConfig,
    publish: {
      args: [] as string[],
      // registry is intentionally left undefined: it is resolved later from the
      // user's npm config / .npmrc (see resolveConfig) so a custom registry
      // (e.g. a corporate proxy) is honored instead of forcing the public one.
      safetyCheck: true,
      safetyCheckTimeout: 15000,
      // Annotated as `boolean` (not the inferred `false` literal) so the resolved
      // config type stays assignable to true when overridden by config/CLI.
      skipExistingVersions: false as boolean,
      checkWorkspaceDependencies: true as boolean,
      packageManager: detectPackageManager(cwd),
    } satisfies PublishConfig,
    tokens: {
      registry: getEnvNpmToken(),
      gitlab:
        process.env.RELIZY_GITLAB_TOKEN
        || process.env.GITLAB_TOKEN
        || process.env.GITLAB_API_TOKEN
        || process.env.CI_JOB_TOKEN,
      github:
        process.env.RELIZY_GITHUB_TOKEN
        || process.env.GITHUB_TOKEN
        || process.env.GH_TOKEN,
      twitter: {
        apiKey:
          process.env.RELIZY_TWITTER_API_KEY
          || process.env.TWITTER_API_KEY,
        apiKeySecret:
          process.env.RELIZY_TWITTER_API_KEY_SECRET
          || process.env.TWITTER_API_KEY_SECRET,
        accessToken:
          process.env.RELIZY_TWITTER_ACCESS_TOKEN
          || process.env.TWITTER_ACCESS_TOKEN,
        accessTokenSecret:
          process.env.RELIZY_TWITTER_ACCESS_TOKEN_SECRET
          || process.env.TWITTER_ACCESS_TOKEN_SECRET,
      },
      slack:
        process.env.RELIZY_SLACK_TOKEN
        || process.env.SLACK_TOKEN,
      ai: {
        'claude-code': {
          apiKey:
            process.env.RELIZY_ANTHROPIC_API_KEY
            || process.env.ANTHROPIC_API_KEY,
          oauthToken:
            process.env.RELIZY_CLAUDE_CODE_OAUTH_TOKEN
            || process.env.CLAUDE_CODE_OAUTH_TOKEN,
        },
      },
    },
    scopeMap: {},
    release: {
      commit: true,
      publish: true,
      changelog: true,
      push: true,
      clean: true,
      providerRelease: true,
      noVerify: false,
      gitTag: true,
      social: true,
      prComment: true,
      report: { github: true },
    } as Required<Omit<ReleaseConfig, 'report'>> & Pick<ReleaseConfig, 'report'>,
    commitlint: {
      packages: [],
      scopes: [],
      rules: {},
      customRules: {},
      ignores: [],
      defaultIgnores: true,
      title: false,
      changelogLinter: 'auto',
    } as Required<Omit<CommitlintConfig, 'helpUrl'>> & Pick<CommitlintConfig, 'helpUrl'>,
    social: {
      twitter: {
        enabled: false,
        onlyStable: true,
        postMaxLength: 280,
      } satisfies SocialConfig['twitter'],
      slack: {
        enabled: false,
        onlyStable: true,
        changelog: 'summary' as SocialChangelog,
        noAuthors: false,
        noPackages: false,
      } satisfies Omit<SocialConfig['slack'], 'channel'>,
      teams: {
        enabled: false,
        onlyStable: true,
        cards: 'version' as TeamsCardsMode,
        changelog: 'none' as SocialChangelog,
        locale: 'en-US',
      } satisfies SocialConfig['teams'],
    },
    prComment: {
      mode: 'update',
    } as Required<PrCommentConfig>,
    mergePreview: {
      comment: true,
      check: true,
      commitlint: 'auto',
      squash: 'auto',
    } as Required<MergePreviewConfig>,
    ai: {
      provider: 'claude-code',
      language: 'en',
      fallback: 'raw',
      onlyStable: true,
      providers: {
        'claude-code': {
          model: 'haiku',
        },
      },
      providerRelease: { enabled: false },
      social: {
        twitter: { enabled: false },
        slack: { enabled: false },
        teams: { enabled: false },
      },
    } as AIConfig & Required<Pick<AIConfig, 'language'>>,
    logLevel: 'default' as LogLevel,
    safetyCheck: true,
    detectRewrittenTags: true,
  }
}

/**
 * Resolves default commit templates based on the monorepo `versionMode`.
 * - `independent` (no user override): title = `chore(release): bump {{packageCount}} packages`, body = `{{packageList}}`.
 * - Other modes (no user override): title = `chore(release): bump version to {{newVersion}}`, no body.
 * - Version groups (`monorepo.groups`): left unset, they depend on the groups that bump (see `createCommitAndTags`).
 * If the user set `templates.commitMessage` or `templates.commitBody`, their values are preserved.
 */
function resolveTemplateDefaults(config: ResolvedConfig): void {
  const templates = config.templates ?? (config.templates = {} as typeof config.templates)

  if (config.monorepo?.groups) {
    return
  }

  const isIndependent = config.monorepo?.versionMode === 'independent'

  if (templates.commitMessage === undefined) {
    templates.commitMessage = isIndependent
      ? DEFAULT_RELEASE_COMMIT_MESSAGES.packages
      : DEFAULT_RELEASE_COMMIT_MESSAGES.version

    if (isIndependent && templates.commitBody === undefined) {
      templates.commitBody = '{{packageList}}'
    }
  }
}

/**
 * A config option that stops the config from loading: removed in relizy 2 and
 * that cannot be ignored silently, or with a value relizy cannot work with
 */
export class ConfigOptionError extends Error {
  constructor(readonly option: string, message: string) {
    super(message)
    this.name = 'ConfigOptionError'
  }
}

/**
 * Options removed in relizy 2 that cannot be ignored silently: the packages
 * they left out would be released
 */
function assertNoRemovedOptions(config: ResolvedConfig): void {
  if ((config.monorepo as { ignorePackageNames?: unknown } | undefined)?.ignorePackageNames !== undefined) {
    throw new ConfigOptionError('monorepo.ignorePackageNames', 'monorepo.ignorePackageNames is removed: list the directories of these packages in monorepo.ignored (path globs, as monorepo.packages). See https://relizy.dev/guide/migration-v2#removed-ignorepackagenames')
  }
}

/**
 * The version of a repository tag is read back between the text before and the
 * text after `{{newVersion}}` in `templates.tagBody`: a template that repeats it
 * would create tags relizy cannot find again
 */
function assertValidTagBody(config: ResolvedConfig): void {
  const tagBody = config.templates?.tagBody

  if (typeof tagBody === 'string' && tagBody.split('{{newVersion}}').length > 2) {
    throw new ConfigOptionError('templates.tagBody', `templates.tagBody must contain {{newVersion}} only once, to read the version back from the tags: "${tagBody}"`)
  }
}

function setupLogger(logLevel?: LogLevel) {
  if (logLevel) {
    logger.setLevel(logLevel)
    logger.debug(`Log level set to: ${logLevel}`)
  }
}

async function resolveConfig(
  config: ResolvedConfig,
  cwd: string,
) {
  if (!config.repo) {
    // Undefined without a `repository` field nor an `origin` remote (a local repository)
    const resolvedRepoConfig = await resolveRepoConfig(cwd)

    if (resolvedRepoConfig) {
      config.repo = resolvedRepoConfig
    }
  }

  if (typeof config.repo === 'string') {
    config.repo = getRepoConfig(config.repo)
  }

  // When the user did not set a registry, resolve the effective one from their
  // npm config / .npmrc so a custom registry (e.g. a proxy) is respected. With
  // `registries`, only the declared registries are used: the .npmrc one is the
  // fallback of a package none of them covers (see resolveRegistryTargetsForPackage).
  if (config.publish && !config.publish.registry && !config.publish.registries?.length) {
    config.publish.registry = getNpmRegistry(cwd)
  }

  // A local run without GITHUB_TOKEN: the token of the GitHub CLI, when it is logged in
  if (config.tokens && !config.tokens.github && config.repo?.provider === 'github' && !isInCI()) {
    config.tokens.github = getGhCliToken(config.repo.domain)
    if (config.tokens.github) {
      logger.debug('GitHub token: the one of the GitHub CLI (gh auth token)')
    }
  }

  return config
}

/**
 * Merge configs, the first one winning, as `defu` does, except that an array
 * replaces the array of the next configs instead of being concatenated with
 * it: `bump.dependencyTypes: ['peerDependencies']` is not completed with the
 * default `dependencies`, and a resolved config merged again is not duplicated.
 */
const replaceArrays = createDefu((object, key, value) => {
  if (Array.isArray(value)) {
    (object as Record<PropertyKey, unknown>)[key] = value
    return true
  }
})

export function mergeConfig<T>(...configs: Array<T | null | undefined>): T {
  return replaceArrays({}, ...configs.filter(config => config != null) as Record<PropertyKey, unknown>[]) as T
}

/**
 * Merge user types with defaults: each user-defined entry replaces the default entirely.
 * This prevents defu's deep merge from adding default sub-properties
 * the user intentionally omitted (e.g. `docs: { title: '...' }` without `semver`).
 */
function mergeTypes<T extends Record<string, unknown>>(
  userTypes: T | undefined,
  defaultTypes: T,
): T {
  if (!userTypes) {
    return { ...defaultTypes }
  }

  return {
    ...defaultTypes,
    ...userTypes,
  }
}

/**
 * Options of the config file, each one optional (a mapped type, not
 * `DeepPartial<RelizyConfig>`, so that the API docs keep its name)
 */
export type RelizyConfigOverrides = { [Key in keyof RelizyConfig]?: DeepPartial<RelizyConfig[Key]> }

export interface LoadRelizyConfigOptions {
  /** Config already resolved (by `loadRelizyConfig()`), merged under the overrides without loading the config file again */
  baseConfig?: ResolvedRelizyConfig
  /** Options applied over the config file */
  overrides?: RelizyConfigOverrides
  /**
   * Name of the config, as `--config`: `relizy.standalone` loads `relizy.standalone.config.ts`
   * @default 'relizy'
   */
  configFile?: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * A copy of the plain objects of a config (the arrays, the functions and the
 * other values are kept as is), so that a command changing its config does
 * not change the config it was given
 */
function copyPlainObjects<T>(value: T): T {
  if (!isPlainObject(value)) {
    return value
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    copyPlainObjects(entry),
  ])) as T
}

/** The top-level options the config files set, before the defaults: by resolved config */
const userConfigKeys = new WeakMap<ResolvedRelizyConfig, Set<string>>()

/**
 * True when a config file sets the top-level option `key` (`commitlint`), the
 * defaults left out: every option has a value once the config is resolved
 */
export function isSetInUserConfig(config: ResolvedRelizyConfig, key: keyof RelizyConfig): boolean {
  return userConfigKeys.get(config)?.has(key) ?? false
}

/**
 * A base config is already resolved: the overrides are applied to it without
 * loading the config file and the `.env` file again (a command run by
 * `release` gets its config). A config derived for a version group (see
 * `resolveVersionGroups`) stays one, a reload would bring `monorepo.groups`
 * back into it.
 */
function applyOverridesToBaseConfig(baseConfig: ResolvedRelizyConfig, overrides?: RelizyConfigOverrides): ResolvedRelizyConfig {
  const config = mergeConfig(overrides, copyPlainObjects(baseConfig)) as ResolvedRelizyConfig
  setupLogger(overrides?.logLevel || config.logLevel)
  const userKeys = userConfigKeys.get(baseConfig)
  if (userKeys) {
    userConfigKeys.set(config, userKeys)
  }

  const groupName = getVersionGroupName(baseConfig)

  return groupName
    ? markVersionGroupConfig(config, groupName)
    : config
}

export async function loadRelizyConfig(options?: LoadRelizyConfigOptions): Promise<ResolvedRelizyConfig> {
  if (options?.baseConfig) {
    return applyOverridesToBaseConfig(options.baseConfig, options.overrides)
  }

  const cwd = options?.overrides?.cwd ?? process.cwd()

  await setupDotenv({ cwd })

  const configFile = options?.configFile ?? 'relizy'

  const defaultConfig = getDefaultConfig(cwd)

  // Extract types from defaults to handle them separately
  const { types: defaultTypes, ...defaultsWithoutTypes } = defaultConfig

  const results = await loadConfig<ResolvedConfig>({
    dotenv: true,
    cwd,
    name: configFile,
    packageJson: true,
    defaults: defaultsWithoutTypes as ResolvedConfig,
    overrides: mergeConfig(options?.overrides) as ResolvedConfig,
    merger: mergeConfig,
  })

  // Merge types: user entries replace defaults entirely (no deep merge)
  results.config.types = mergeTypes(
    results.config.types,
    defaultTypes,
  )

  if (typeof results._configFile !== 'string') {
    logger.debug(`No config file found with name "${configFile}"`)

    if (options?.configFile) {
      logger.error(`No config file found with name "${configFile}"`)
      throw new Error(`No config file found with name "${configFile}"`)
    }
  }

  setupLogger(options?.overrides?.logLevel || results.config.logLevel)

  assertNoRemovedOptions(results.config)
  assertValidTagBody(results.config)
  validateVersionGroups(results.config as ResolvedRelizyConfig)

  logger.verbose('User config:', formatJson(results.config.changelog))

  resolveTemplateDefaults(results.config)

  const resolvedConfig = await resolveConfig(results.config, cwd)

  logger.debug('Resolved config:', formatJson(redactSecrets(resolvedConfig)))

  userConfigKeys.set(resolvedConfig as ResolvedRelizyConfig, new Set((results.layers ?? []).flatMap(layer => Object.keys(layer.config ?? {}))))

  return resolvedConfig as ResolvedRelizyConfig
}

export type ResolvedConfig = RelizyConfig & ReturnType<typeof getDefaultConfig>
export type ResolvedRelizyConfig = ResolvedConfig & {
  output: string
}

export function defineConfig(config: RelizyConfig) {
  return config
}
