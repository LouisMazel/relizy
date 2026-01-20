import type { LogLevel } from '@maz-ui/node'
import type { DeepPartial } from '@maz-ui/utils'
import type { ReleaseType } from 'semver'
import type { BumpConfig, ChangelogConfig, GitProvider, ReleaseConfig, RelizyConfig, SocialConfig } from '../types'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { formatJson } from '@maz-ui/utils'

import { loadConfig, setupDotenv } from 'c12'
import { getRepoConfig, resolveRepoConfig } from 'changelogen'
import { defu } from 'defu'

export function getDefaultConfig() {
  return {
    cwd: process.cwd(),
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
      commitMessage: 'chore(release): bump version to {{newVersion}}',
      tagMessage: 'Bump version to {{newVersion}}',
      tagBody: 'v{{newVersion}}',
      emptyChangelogContent: 'No relevant changes for this release',
      twitterMessage: '🚀 {{projectName}} {{version}} is out!\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}',
      slackMessage: undefined, // Use rich blocks format by default (no template)
    },
    excludeAuthors: [],
    noAuthors: false,
    bump: {
      type: 'release' satisfies ReleaseType,
      clean: true,
      dependencyTypes: ['dependencies'],
      yes: false,
    } as Required<Omit<BumpConfig, 'preid'>>,
    changelog: {
      rootChangelog: true,
      includeCommitBody: true,
    } as Required<ChangelogConfig>,
    publish: {
      private: false,
      args: [],
      token: process.env.RELIZY_NPM_TOKEN || process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN,
      registry: 'https://registry.npmjs.org/',
      safetyCheck: true,
    },
    tokens: {
      registry: process.env.RELIZY_NPM_TOKEN || process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN,
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
    } as Required<ReleaseConfig>,
    social: {
      twitter: {
        enabled: false,
        onlyStable: true,
        postMaxLength: 280,
      } satisfies SocialConfig['twitter'],
      slack: {
        enabled: false,
        onlyStable: true,
      } satisfies Omit<SocialConfig['slack'], 'channel'>,
    },
    logLevel: 'default' as LogLevel,
    safetyCheck: true,
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
    const resolvedRepoConfig = await resolveRepoConfig(cwd)
    config.repo = {
      ...resolvedRepoConfig,
      provider: resolvedRepoConfig.provider as GitProvider,
    }
  }

  if (typeof config.repo === 'string') {
    const resolvedRepoConfig = getRepoConfig(config.repo)
    config.repo = {
      ...resolvedRepoConfig,
      provider: resolvedRepoConfig.provider as GitProvider,
    }
  }

  return config
}

export async function loadRelizyConfig(options?: {
  baseConfig?: ResolvedRelizyConfig
  overrides?: DeepPartial<RelizyConfig>
  configFile?: string
}) {
  const cwd = options?.overrides?.cwd ?? process.cwd()

  await setupDotenv({ cwd })

  const configFile = options?.configFile ?? 'relizy'

  const defaultConfig = getDefaultConfig()

  const overridesConfig = defu(options?.overrides, options?.baseConfig)

  const results = await loadConfig<ResolvedConfig>({
    dotenv: true,
    cwd,
    name: configFile,
    packageJson: true,
    defaults: defaultConfig as ResolvedConfig,
    overrides: overridesConfig as ResolvedConfig,
  })

  if (typeof results._configFile !== 'string') {
    logger.debug(`No config file found with name "${configFile}"`)

    if (options?.configFile) {
      logger.error(`No config file found with name "${configFile}"`)
      process.exit(1)
    }
  }

  setupLogger(options?.overrides?.logLevel || results.config.logLevel)

  logger.verbose('User config:', formatJson(results.config.changelog))

  const resolvedConfig = await resolveConfig(results.config, cwd)

  logger.debug('Resolved config:', formatJson(resolvedConfig))

  return resolvedConfig as ResolvedRelizyConfig
}

export type ResolvedConfig = RelizyConfig & ReturnType<typeof getDefaultConfig>
export type ResolvedRelizyConfig = ResolvedConfig & {
  output: string
}

export function defineConfig(config: RelizyConfig) {
  return config
}
