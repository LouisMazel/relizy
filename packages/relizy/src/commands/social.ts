import type { ChatPostMessageResponse } from '@slack/web-api'
import type { TweetV2PostTweetResult } from 'twitter-api-v2'
import type { PackageBumpEntry, ReleaseLine, ReleaseOverview, ResolvedRelizyConfig, TeamsCard, TeamsVersion } from '../core'
import type { AIReleaseContext, AISocialPlatform } from '../core/ai'
import type { BumpResultTruthy, GitCommit, GroupBumpResult, HookContext, SlackChangelogFormat, SlackOptions, SlackReleaseSection, SocialLink, SocialNetworkResult, SocialOptions, SocialResult, SocialTemplateVariables, TweetSection } from '../types'
import { relative } from 'node:path'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { collectContributorNames, filterOutPrivatePackages, isBumpedPackage, isPrerelease, withGitCache } from '@relizy/core'
import { assertVersionGroupsOption, checkTeamsWebhookUrl, executeHook, extractChangelogHighlights, fillAnnouncementText, fillSocialTemplate, generateChangelog, getAnnouncementLinks, getAnnouncementVariables, getHookContext, getKnownReleaseVersions, getPackageCommits, getPackagesOrBumpedPackages, getReleaseLines, getReleaseOverview, getReleaseTag, getReleaseTargets, getReleaseTitle, getReleaseUrl, getRootPackage, getSlackToken, getSlackWebhookUrl, getSocialChangelog, getSocialTemplateVariables, getTeamsCardSection, getTeamsWebhookUrl, getTweetLength, getTwitterCredentials, getVersionGroupTitle, hasVersionGroups, isExcludedLine, isPrereleaseOnlyRelease, isStepLeftOutByEveryGroup, keepReleaseLines, loadRelizyConfig, postReleaseToSlack, postReleaseToTeams, postReleaseToTwitter, readPackageJson, resolveAnnouncement, resolveSlackPostMaxLength, resolveTags, resolveTeamsAnnouncements, withoutPrivatePackages } from '../core'
import { aiSafetyCheck, applyAIOverride, generateAISocialChangelog, generateAISocialReleases, isAIRewritingVersion, isAIRunInRelease, isAISocialEnabled } from '../core/ai'
import { runWithEvents } from '../core/events'
import { reportProgress } from '../core/progress'
import { runCommand } from './run-command'

type SocialNetworkResponse<T> = { success: true, response?: T, skipped?: string } | { success: false, error: string }

function computeTwitterChangelogBudget({
  template,
  variables,
  postMaxLength,
}: {
  template: string
  variables: SocialTemplateVariables
  postMaxLength: number
}): number {
  const overhead = fillSocialTemplate(template, variables, { changelog: '' })

  return Math.max(0, postMaxLength - getTweetLength(overhead))
}

/**
 * Whether a social platform posts the releases
 */
export function isAnySocialPlatformEnabled(config: ResolvedRelizyConfig): boolean {
  return Boolean(config.social?.twitter?.enabled || config.social?.slack?.enabled || config.social?.teams?.enabled)
}

/**
 * True when the platform can post in the release: enabled, and not left out
 * by its `onlyStable` when every version is a prerelease
 */
function isPostedInRelease(config: ResolvedRelizyConfig, platform: AISocialPlatform, versions?: string[]): boolean {
  if (!config.social?.[platform]?.enabled) {
    return false
  }

  // As the posts: `onlyStable` is on by default for Slack and Teams
  const onlyStable = platform === 'twitter'
    ? !!config.social.twitter.onlyStable
    : config.social[platform]?.onlyStable ?? true

  return !onlyStable || !isPrereleaseOnlyRelease(config, versions)
}

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export async function socialSafetyCheck({ config, versions }: {
  config: ResolvedRelizyConfig
  /**
   * The versions announced, when known before the run (`getKnownReleaseVersions`)
   */
  versions?: string[]
}) {
  try {
    const socialMediaDisabled = !config.release.social && !isAnySocialPlatformEnabled(config)
    if (!config.safetyCheck || socialMediaDisabled) {
      logger.debug('Safety check disabled or social disabled')
      return
    }

    if (isStepLeftOutByEveryGroup(config, 'social')) {
      logger.debug('Every version group is left out of the social posts (release.social: false)')
      return
    }

    logger.debug('Start checking social config')

    // A platform that posts nothing (prerelease with `onlyStable`) is not checked
    const twitterConfig = config.social?.twitter
    if (isPostedInRelease(config, 'twitter', versions)) {
      const credentials = getTwitterCredentials({
        socialCredentials: twitterConfig.credentials,
        tokenCredentials: config.tokens?.twitter,
      })

      if (!credentials) {
        logger.fail('Twitter credentials not found')
        throw new Error('Twitter credentials not found')
      }

      // check if twitter-api-v2 is installed
      try {
        await import('twitter-api-v2')
      }
      catch {
        logger.fail('twitter-api-v2 is not installed, please install it')
        throw new Error('twitter-api-v2 is not installed')
      }
    }

    // Check Slack configuration
    const slackConfig = config.social?.slack
    if (isPostedInRelease(config, 'slack', versions)) {
      const webhookUrl = getSlackWebhookUrl({ socialWebhookUrl: slackConfig.webhookUrl })
      const token = getSlackToken({
        socialCredentials: slackConfig.credentials,
        tokenCredential: config.tokens?.slack,
      })

      if (webhookUrl) {
        // Webhook mode - priority. @slack/web-api is not required.
        if (slackConfig.channel) {
          logger.warn('social.slack.channel is ignored when webhookUrl is set (channel is baked into the webhook URL).')
        }
        if (token) {
          logger.warn('Slack token is ignored when webhookUrl is set (webhook takes priority).')
        }
      }
      else if (token) {
        // Token mode - check @slack/web-api and require channel
        try {
          await import('@slack/web-api')
        }
        catch {
          logger.fail('@slack/web-api is not installed, please install it')
          throw new Error('@slack/web-api is not installed')
        }

        if (!slackConfig.channel) {
          logger.fail('Slack is enabled but no channel is configured.')
          logger.log('Set the channel in social.slack.channel (e.g., "#releases" or "C1234567890") or switch to webhookUrl for a simpler setup.')

          throw new Error('Slack channel not found')
        }
      }
      else {
        // Neither webhook nor token
        logger.fail('Slack is enabled but no credentials are configured.')
        logger.log('Provide ONE of the following:')
        logger.log('  (a) social.slack.webhookUrl (or SLACK_WEBHOOK_URL / RELIZY_SLACK_WEBHOOK_URL env var) - simpler setup, channel baked in')
        logger.log('  (b) social.slack.credentials.token (or SLACK_TOKEN / RELIZY_SLACK_TOKEN env var) + social.slack.channel - requires bot invite')

        throw new Error('Slack credentials not found')
      }
    }

    // Check Teams configuration
    if (isPostedInRelease(config, 'teams', versions)) {
      const webhookUrl = getTeamsWebhookUrl({ socialWebhookUrl: config.social.teams.webhookUrl })

      if (!webhookUrl) {
        logger.fail('Teams is enabled but the URL of its workflow is not configured.')
        logger.log('Set RELIZY_TEAMS_WEBHOOK_URL (or RELIZY_TEAMS_WEBHOOK_URL_B64, the URL in base64) in the CI, or social.teams.webhookUrl.')
        throw new Error('Teams webhook URL not found')
      }

      const problem = checkTeamsWebhookUrl(webhookUrl)
      if (problem) {
        logger.fail(problem)
        throw new Error(problem)
      }
    }

    // No AI call for a platform that posts nothing, nor for prereleases with the `onlyStable` of the AI
    if ((['twitter', 'slack', 'teams'] as const).some(platform => isPostedInRelease(config, platform, versions) && isAISocialEnabled(config, platform) && isAIRunInRelease(config, platform, versions))) {
      await aiSafetyCheck({ config })
    }

    logger.info('Social config checked successfully')
  }
  catch (error) {
    logger.error('Error during social safety check:', getErrorMessage(error))
    throw new Error(`Error during social safety check: ${getErrorMessage(error)}`, { cause: error })
  }
}

async function handleTwitterPost({
  config,
  changelog,
  dryRun,
  variables,
  prerelease,
  notAnnounced,
  hookContext,
}: {
  config: ResolvedRelizyConfig
  changelog: string | TweetSection[]
  dryRun: boolean
  variables: SocialTemplateVariables
  hookContext?: HookContext
  /**
   * True when every version of the release is a prerelease
   */
  prerelease: boolean
  /**
   * True when `social.twitter.exclude` leaves out every version
   */
  notAnnounced: boolean
}): Promise<SocialNetworkResponse<TweetV2PostTweetResult>> {
  // Check if Twitter is enabled specifically
  const twitterConfig = config.social?.twitter
  if (!twitterConfig?.enabled) {
    logger.debug('Twitter posting is disabled in configuration')
    return { success: true, response: undefined }
  }

  logger.debug('Twitter posting is enabled')

  try {
    const credentials = getTwitterCredentials({
      socialCredentials: twitterConfig.credentials,
      tokenCredentials: config.tokens?.twitter,
    })

    if (!credentials) {
      return { success: false, error: 'Twitter credentials not found' }
    }

    logger.debug('Credentials found ✓')
    logger.debug('Preparing tweet for release')

    // Check if this is a prerelease and if we should skip it
    if (twitterConfig.onlyStable && prerelease) {
      logger.info(`Skipping Twitter post for prerelease ${variables.newVersion || variables.packageList} (social.twitter.onlyStable is enabled)`)
      return { success: true, skipped: 'prerelease' }
    }

    if (notAnnounced) {
      logger.info('No version to announce on Twitter (social.twitter.exclude)')
      return { success: true, skipped: 'nothing to announce' }
    }

    try {
      await executeHook('before:twitter', config, dryRun, hookContext)
      logger.debug(`Release URL: ${variables.releaseUrl || 'none'}`)
      logger.debug(`Changelog URL: ${variables.changelogUrl || 'none'}`)
      reportProgress('Posting on Twitter')
      const response = await postReleaseToTwitter({
        template: config.social.twitter.template || config.templates.twitterMessage,
        variables,
        changelog,
        credentials,
        dryRun,
        postMaxLength: config.social.twitter.postMaxLength,
      })

      await executeHook('success:twitter', config, dryRun, hookContext)

      return { success: true, response }
    }
    catch (error) {
      await executeHook('error:twitter', config, dryRun, hookContext)
      logger.error('Error posting to Twitter:', error)
      const errorMessage = error instanceof Error
        ? error.message
        : String(error)
      return { success: false, error: `Error posting to Twitter: ${errorMessage}` }
    }
  }
  catch (error) {
    logger.error('Error during Twitter posting:', error)
    const errorMessage = error instanceof Error
      ? error.message
      : String(error)
    return { success: false, error: `Error during Twitter posting: ${errorMessage}` }
  }
}

// eslint-disable-next-line complexity
async function handleSlackPost({
  config,
  changelog,
  dryRun,
  variables,
  commits,
  packages: releasedPackages,
  prerelease,
  notAnnounced,
  announcement,
  hookContext,
}: {
  config: ResolvedRelizyConfig
  changelog: string | SlackReleaseSection[]
  dryRun: boolean
  variables: SocialTemplateVariables
  commits: GitCommit[]
  /**
   * Packages of the release, listed after the changelog
   */
  packages: PackageBumpEntry[]
  hookContext?: HookContext
  /**
   * True when every version of the release is a prerelease
   */
  prerelease: boolean
  /**
   * True when `social.slack.announcements` and `exclude` leave out every version
   */
  notAnnounced: boolean
  /**
   * Announcement of a single version
   */
  announcement?: SlackOptions['announcement']
}): Promise<SocialNetworkResponse<ChatPostMessageResponse | { ok: true, transport: 'webhook' } | undefined>> {
  // Check if Slack is enabled specifically
  const slackConfig = config.social?.slack
  if (!slackConfig?.enabled) {
    logger.debug('Slack posting is disabled in configuration')
    return { success: true, response: undefined }
  }

  logger.debug('Slack posting is enabled')

  try {
    const webhookUrl = getSlackWebhookUrl({ socialWebhookUrl: slackConfig.webhookUrl })
    const token = getSlackToken({
      socialCredentials: slackConfig.credentials,
      tokenCredential: config.tokens?.slack,
    })

    if (!webhookUrl && !token) {
      logger.warn('Neither Slack webhookUrl nor token is configured. Set SLACK_WEBHOOK_URL / SLACK_TOKEN or configure social.slack.webhookUrl / credentials.token.')
      logger.info('Skipping Slack post')
      return { success: false, error: 'Slack credentials not found' }
    }

    if (!webhookUrl && !slackConfig.channel) {
      logger.warn('Slack channel not configured (required in token mode). Set it in social.slack.channel.')
      logger.info('Skipping Slack post')
      return { success: false, error: 'Slack channel not configured' }
    }

    const slackMode = webhookUrl
      ? 'webhook mode'
      : `token mode, channel: ${slackConfig.channel}`
    logger.debug(`Slack: ${slackMode}`)
    logger.debug(`Preparing Slack message for release: ${variables.releaseTitle}`)

    // Check if this is a prerelease and if we should skip it
    if ((slackConfig.onlyStable ?? true) && prerelease) {
      logger.info(`Skipping Slack post for prerelease ${variables.newVersion || variables.packageList} (social.slack.onlyStable is enabled)`)
      return { success: true, skipped: 'prerelease' }
    }

    if (notAnnounced) {
      logger.info('No version to announce on Slack (social.slack.announcements, social.slack.exclude)')
      return { success: true, skipped: 'nothing to announce' }
    }

    reportProgress('Posting on Slack')

    try {
      await executeHook('before:slack', config, dryRun, hookContext)

      logger.debug(`Release URL: ${variables.releaseUrl || 'none'}`)
      logger.debug(`Changelog URL: ${variables.changelogUrl || 'none'}`)

      const template = slackConfig.template || config.templates.slackMessage

      // Resolve contributors: global noAuthors is the gate, slack-specific can further restrict
      const shouldHideContributors
        = config.noAuthors === true
          || slackConfig.noAuthors === true
      const contributors = shouldHideContributors
        ? []
        : collectContributorNames({ commits, noAuthors: config.noAuthors, excludeAuthors: config.excludeAuthors })
      logger.debug(`Contributors: ${contributors.length}`)

      // Resolve bumped packages (list shown between changelog and contributors)
      const packages = slackConfig.noPackages === true
        ? []
        : releasedPackages
      logger.debug(`Packages: ${packages.length}`)

      const response = await postReleaseToSlack({
        variables,
        changelog,
        channel: slackConfig.channel,
        token: token ?? undefined,
        webhookUrl: webhookUrl ?? undefined,
        template,
        contributors,
        packages,
        postMaxLength: slackConfig.postMaxLength,
        changelogFormat: getSlackChangelogFormat(config),
        announcement,
        dryRun,
      })

      await executeHook('success:slack', config, dryRun, hookContext)

      return { success: true, response }
    }
    catch (error) {
      await executeHook('error:slack', config, dryRun, hookContext)
      logger.error('Error posting to Slack:', error)

      const errorMessage = error instanceof Error
        ? error.message
        : String(error)
      return { success: false, error: `Error posting to Slack: ${errorMessage}` }
    }
  }
  catch (error) {
    logger.error('Error during Slack posting:', error)

    const errorMessage = error instanceof Error
      ? error.message
      : String(error)
    return { success: false, error: `Error during Slack posting: ${errorMessage}` }
  }
}

/**
 * What a group (or the config without version groups) announces: the bump
 * result of its versions, and the changelog of each version.
 */
interface CollectedRelease {
  released: BumpResultTruthy
  /**
   * Changelogs of the versions: by package name in `independent` mode, under
   * `ROOT_VERSION` for the root version
   */
  changelogs: Map<string, { minified: string, rich: string }>
  commits: GitCommit[]
  /**
   * Tag of the root version, as resolved for the post (`--to`)
   */
  rootTag?: string
}

const ROOT_VERSION = ''

/**
 * How the Slack message renders its changelog: rich text with `changelog: 'full'`
 */
function getSlackChangelogFormat(config: ResolvedRelizyConfig): SlackChangelogFormat {
  return getSocialChangelog(config.social?.slack?.changelog, 'summary') === 'full'
    ? 'full'
    : 'summary'
}

/**
 * A version announced by a post, with its changelog
 */
interface AnnouncedVersion {
  line: ReleaseLine
  minified: string
  rich: string
  /**
   * Directory of its `CHANGELOG.md`, relative to the root of the repository
   * (`''` for the root), undefined when relizy writes none
   */
  changelogDir?: string
}

function addCommits(commitsByHash: Map<string, GitCommit>, commits: GitCommit[]) {
  for (const commit of commits) {
    commitsByHash.set(commit.shortHash || commit.message, commit)
  }
}

/**
 * The packages of an `independent` release, each with its changelog resolved
 * against its own `packagename@version` tags. The root package is never tagged
 * in this mode, so it must never be used here.
 */
async function collectIndependentRelease({ config, options, bumpResult, dryRun }: {
  config: ResolvedRelizyConfig
  options: Partial<SocialOptions>
  bumpResult: BumpResultTruthy | undefined
  dryRun: boolean
}): Promise<CollectedRelease> {
  const packages = filterOutPrivatePackages(await getPackagesOrBumpedPackages({
    config,
    bumpResult,
    suffix: options.suffix ?? config.bump.suffix,
    force: options.force ?? false,
    dryRun,
  }))
  const changelogs: CollectedRelease['changelogs'] = new Map()
  const commitsByHash = new Map<string, GitCommit>()

  for (const pkg of packages) {
    const newVersion = (isBumpedPackage(pkg) && pkg.newVersion) || pkg.version
    // `pkg.fromTag` is the previous `packagename@x` tag resolved at bump time
    // (or the NEW_PACKAGE_MARKER for a brand-new package).
    const from = config.from || pkg.fromTag

    if (!from) {
      logger.warn(`No from tag found for ${pkg.name}, skipping its changelog`)
      continue
    }

    const generate = (minify: boolean) => generateChangelog({
      pkg: { ...pkg, fromTag: from },
      config,
      dryRun,
      newVersion,
      include: {
        title: false,
        compareLink: false,
        body: true,
        contributors: false,
      },
      minify,
    })

    changelogs.set(pkg.name, { minified: await generate(true), rich: await generate(false) })

    // `to` is HEAD because the release tags do not exist yet at this stage of the release flow
    addCommits(commitsByHash, await getPackageCommits({
      pkg,
      from,
      to: 'HEAD',
      config,
      changelog: true,
      dryRun,
    }))
  }

  return {
    released: {
      bumped: true,
      bumpedPackages: packages.map(pkg => ({
        ...pkg,
        oldVersion: (isBumpedPackage(pkg) && pkg.oldVersion) || pkg.version,
        newVersion: (isBumpedPackage(pkg) && pkg.newVersion) || pkg.version,
      })),
    },
    changelogs,
    commits: [
      ...commitsByHash.values(),
    ],
  }
}

/**
 * The root version of a `unified`/`selective` release, with its changelog
 */
async function collectRootRelease({ config, bumpResult, dryRun }: {
  config: ResolvedRelizyConfig
  bumpResult: BumpResultTruthy | undefined
  dryRun: boolean
}): Promise<CollectedRelease> {
  const rootPackageRead = readPackageJson(config.cwd)

  if (!rootPackageRead) {
    throw new Error('Failed to read root package.json')
  }

  const newVersion = bumpResult?.newVersion || rootPackageRead.version
  const { from, to } = await resolveTags<'social'>({
    config,
    step: 'social',
    newVersion,
    pkg: rootPackageRead,
  })
  const fromTag = bumpResult?.fromTag || from
  const rootPackage = bumpResult?.rootPackage || await getRootPackage({
    config,
    force: false,
    suffix: undefined,
    changelog: true,
    from: fromTag,
    to,
    dryRun,
  })

  const generate = (minify: boolean) => generateChangelog({
    pkg: { ...rootPackage, fromTag },
    config,
    dryRun,
    newVersion,
    include: {
      title: false,
      compareLink: false,
      body: true,
      contributors: false,
    },
    minify,
  })

  return {
    released: {
      bumped: true,
      newVersion,
      fromTag,
      bumpedPackages: bumpResult?.bumpedPackages ?? [],
    },
    changelogs: new Map([
      [
        ROOT_VERSION,
        { minified: await generate(true), rich: await generate(false) },
      ],
    ]),
    // With `changelog: true`, the authors of title-only commits (e.g. `docs:`) are credited too.
    // `to` resolves to the future release tag (created later in the release flow), so `git log` uses HEAD
    commits: await getPackageCommits({
      pkg: rootPackage,
      from: fromTag,
      to: 'HEAD',
      config,
      changelog: true,
      dryRun,
    }),
    rootTag: to,
  }
}

function collectRelease({ config, options, bumpResult, dryRun }: {
  config: ResolvedRelizyConfig
  options: Partial<SocialOptions>
  bumpResult: BumpResultTruthy | undefined
  dryRun: boolean
}): Promise<CollectedRelease> {
  return config.monorepo?.versionMode === 'independent'
    ? collectIndependentRelease({ config, options, bumpResult, dryRun })
    : collectRootRelease({ config, bumpResult, dryRun })
}

/**
 * Directory of the `CHANGELOG.md` of a version, relative to the root of the
 * repository: the package directory in `independent` mode, the root otherwise
 * (unless `changelog.rootChangelog` is off in a monorepo)
 */
function getChangelogDir({ config, line, released }: { config: ResolvedRelizyConfig, line: ReleaseLine, released: BumpResultTruthy }): string | undefined {
  if (config.release.changelog === false) {
    return undefined
  }

  if (line.group.versionMode === 'independent') {
    const pkg = released.bumpedPackages.find(({ name }) => name === line.name)

    return pkg?.path
      ? relative(config.cwd, pkg.path).split('\\').join('/')
      : undefined
  }

  return config.monorepo && config.changelog?.rootChangelog === false
    ? undefined
    : ''
}

/**
 * What the post announces, with the config without version groups, or with
 * the version groups that bumped and are not left out of the posts
 * (`release.social: false`).
 */
async function collectAnnouncedRelease({ config, options, dryRun }: {
  config: ResolvedRelizyConfig
  options: Partial<SocialOptions>
  dryRun: boolean
}): Promise<{ overview: ReleaseOverview, versions: AnnouncedVersion[], commits: GitCommit[], rootTag?: string }> {
  const collected: { name?: string, release: CollectedRelease, config: ResolvedRelizyConfig }[] = []

  const groups: GroupBumpResult[] = []
  const targets = getReleaseTargets({
    config,
    bumpResult: options.bumpResult,
    only: options.groups,
    nothing: 'nothing to post',
    leftOut: groupConfig => groupConfig.release.social === false
      ? 'left out of the social posts (release.social: false)'
      : undefined,
  })

  for (const { group, config: targetConfig, bumpResult: targetBumpResult } of targets) {
    const release = await collectRelease({
      config: targetConfig,
      options,
      bumpResult: targetBumpResult,
      dryRun,
    })
    collected.push({ name: group?.name, release, config: targetConfig })

    if (group) {
      groups.push({
        ...release.released,
        name: group.name,
        title: getVersionGroupTitle(group),
        versionMode: group.versionMode,
      })
    }
  }

  // Without version groups, the single release collected
  const bumpResult: BumpResultTruthy = hasVersionGroups(config)
    ? {
        bumped: true,
        bumpedPackages: groups.flatMap(group => group.bumpedPackages),
        groups,
      }
    : collected[0]!.release.released

  const overview = withoutPrivatePackages(getReleaseOverview({ config, bumpResult }))
  const commitsByHash = new Map<string, GitCommit>()

  for (const { release } of collected) {
    addCommits(commitsByHash, release.commits)
  }

  const versions = getReleaseLines(overview).map((line) => {
    const target = collected.find(({ name }) => name === line.group.name)
    const changelog = target?.release.changelogs.get(line.group.versionMode === 'independent'
      ? line.name
      : ROOT_VERSION)

    return {
      line,
      minified: changelog?.minified.trim() ?? '',
      rich: changelog?.rich.trim() ?? '',
      changelogDir: target && getChangelogDir({ config: target.config, line, released: target.release.released }),
    }
  })

  return {
    overview,
    versions,
    commits: [
      ...commitsByHash.values(),
    ],
    rootTag: collected.find(({ release }) => release.rootTag)?.release.rootTag,
  }
}

/**
 * What a platform posts: the versions it announces (`isAnnounced`), without
 * the prereleases with `onlyStable`, and the variables of its template.
 */
function getPlatformPost({ config, overview, versions, rootTag, onlyStable, isAnnounced }: {
  config: ResolvedRelizyConfig
  overview: ReleaseOverview
  versions: AnnouncedVersion[]
  rootTag?: string
  onlyStable: boolean
  isAnnounced: (line: ReleaseLine) => boolean
}) {
  const announcedVersions = versions.filter(version => isAnnounced(version.line))
  const isPosted = (line: ReleaseLine) => isAnnounced(line) && (!onlyStable || !isPrerelease(line.version))
  const postedOverview = keepReleaseLines(overview, isPosted)
  const postedVersions = versions.filter(version => isPosted(version.line))
  const rootGroup = postedOverview.groups.find(group => group.versionMode !== 'independent')
  const releaseTag = getReleaseTag(postedOverview)
  // The root version is linked to the tag resolved for the post (`--to`)
  const tag = rootTag && releaseTag && releaseTag === rootGroup?.tag
    ? rootTag
    : releaseTag

  return {
    versions: postedVersions,
    overview: postedOverview,
    // Nothing stable to announce: the platform skips the post
    prerelease: announcedVersions.length > 0 && postedVersions.length === 0,
    // Nothing the platform announces
    notAnnounced: announcedVersions.length === 0,
    variables: getSocialTemplateVariables({
      overview: postedVersions.length > 0
        ? postedOverview
        : overview,
      releaseUrl: tag
        ? getReleaseUrl(config, tag)
        : undefined,
      changelogUrl: config.social?.changelogUrl,
    }),
  }
}

/**
 * Title of a version in a post announcing several versions: the title of its
 * group (the project without version groups) for the root version, the
 * package name otherwise
 */
function getVersionTitle(line: ReleaseLine, hasGroups: boolean): string {
  if (line.group.versionMode === 'independent') {
    return `${line.name} ${line.version}`
  }

  return `${hasGroups ? line.group.title : line.name} ${line.version}`
}

function parseHighlights(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/^\s*[-•*]\s+/, '').trim())
    .filter(Boolean)
}

/**
 * The sections of a tweet announcing several versions, one per group
 */
function getTweetSections({ overview, versions, highlights, hasGroups }: {
  overview: ReleaseOverview
  versions: AnnouncedVersion[]
  highlights: Map<AnnouncedVersion, string[]>
  hasGroups: boolean
}): TweetSection[] {
  return overview.groups.map((group) => {
    const groupVersions = versions.filter(version => version.line.group.name === group.name && version.line.group.versionMode === group.versionMode)

    if (group.versionMode !== 'independent') {
      const [version] = groupVersions

      return {
        title: version && getVersionTitle(version.line, hasGroups),
        highlights: version
          ? highlights.get(version) ?? []
          : [],
      }
    }

    return {
      title: hasGroups ? group.title : undefined,
      packages: groupVersions.map(version => ({
        label: getVersionTitle(version.line, hasGroups),
        highlights: highlights.get(version) ?? [],
      })),
    }
  })
}

/**
 * The sections of a Slack message announcing several versions, one per group.
 * The title of an announcement replaces the name of its version.
 */
function getSlackSections({ overview, versions, changelogs, announcements, hasGroups }: {
  overview: ReleaseOverview
  versions: AnnouncedVersion[]
  changelogs: Map<AnnouncedVersion, string>
  announcements: Map<AnnouncedVersion, SlackAnnouncement>
  hasGroups: boolean
}): SlackReleaseSection[] {
  return overview.groups.map((group) => {
    const groupVersions = versions.filter(version => version.line.group.name === group.name && version.line.group.versionMode === group.versionMode)

    if (group.versionMode !== 'independent') {
      const [version] = groupVersions
      const announcement = version && announcements.get(version)

      return {
        title: version && (announcement?.title
          ? `${announcement.title} ${version.line.version}`
          : getVersionTitle(version.line, hasGroups)),
        ...(announcement && { message: announcement.message, links: announcement.links }),
        changelog: version
          ? changelogs.get(version) ?? ''
          : '',
      }
    }

    return {
      title: hasGroups ? group.title : undefined,
      packages: groupVersions.map((version) => {
        const pkg = group.packages.find(({ name }) => name === version.line.name)
        const announcement = announcements.get(version)

        return {
          name: version.line.name,
          ...(announcement && { title: announcement.title, message: announcement.message, links: announcement.links }),
          oldVersion: pkg?.oldVersion,
          newVersion: version.line.version,
          changelog: changelogs.get(version) ?? '',
        }
      }),
    }
  })
}

function toAIContext(version: AnnouncedVersion): AIReleaseContext {
  return { project: version.line.name, version: version.line.version }
}

/**
 * The versions of a post that the AI rewrites: none when the AI of the
 * platform is off, and no prerelease with `onlyStable` (of the platform, else `ai.onlyStable`)
 */
function getAIRewrittenVersions(config: ResolvedRelizyConfig, platform: AISocialPlatform, versions: AnnouncedVersion[]): Set<AnnouncedVersion> {
  if (!isAISocialEnabled(config, platform)) {
    return new Set()
  }

  const rewritten = versions.filter(version => version.minified.trim() && isAIRewritingVersion(config, platform, version.line.version))
  if (rewritten.length < versions.filter(version => version.minified.trim()).length) {
    logger.info(`Skipping the AI for the prereleases on ${platform} (onlyStable of the AI)`)
  }

  return new Set(rewritten)
}

/**
 * The changelog of the tweet: the changelog of its version, or the sections
 * of its versions. With AI, rewritten in a single call.
 */
async function getTweetChangelog({ config, versions, overview, variables, hasGroups, dryRun }: {
  config: ResolvedRelizyConfig
  versions: AnnouncedVersion[]
  overview: ReleaseOverview
  variables: SocialTemplateVariables
  hasGroups: boolean
  dryRun: boolean
}): Promise<string | TweetSection[]> {
  const rewrites = getAIRewrittenVersions(config, 'twitter', versions)
  const useAI = rewrites.size > 0
  const maxLength = computeTwitterChangelogBudget({
    template: config.social.twitter.template || config.templates.twitterMessage,
    variables,
    postMaxLength: config.social.twitter.postMaxLength,
  })

  if (versions.length === 1) {
    const [version] = versions

    if (!useAI) {
      return version!.minified
    }

    return await generateAISocialChangelog({
      config,
      rawBody: version!.rich,
      fallbackBody: version!.minified,
      platform: 'twitter',
      maxLength,
      context: toAIContext(version!),
      dryRun,
    })
  }

  const rewritten = useAI
    ? await generateAISocialReleases({
        config,
        platform: 'twitter',
        maxLength,
        dryRun,
        releases: versions.flatMap((version, index) => rewrites.has(version)
          ? [
              {
                id: String(index + 1),
                title: getVersionTitle(version.line, hasGroups),
                body: version.rich,
                highlights: version.line.group.versionMode === 'independent'
                  ? 1
                  : 3,
              },
            ]
          : []),
      })
    : new Map<string, string>()

  const highlights = new Map(versions.map((version, index) => {
    const aiHighlights = rewritten.get(String(index + 1))

    return [
      version,
      aiHighlights
        ? parseHighlights(aiHighlights)
        : extractChangelogHighlights(version.minified),
    ]
  }))

  return getTweetSections({
    overview,
    versions,
    highlights,
    hasGroups,
  })
}

/**
 * The changelog of the Slack message: the changelog of its version, or the
 * sections of its versions. With AI, rewritten in a single call.
 */
async function getSlackChangelog({ config, versions, overview, announcements, hasGroups, dryRun }: {
  config: ResolvedRelizyConfig
  versions: AnnouncedVersion[]
  overview: ReleaseOverview
  announcements: Map<AnnouncedVersion, SlackAnnouncement>
  hasGroups: boolean
  dryRun: boolean
}): Promise<string | SlackReleaseSection[]> {
  const changelog = getSocialChangelog(config.social?.slack?.changelog, 'summary')
  const changelogFormat = getSlackChangelogFormat(config)
  const getBody = (version: AnnouncedVersion) => changelog === 'none'
    ? ''
    : changelog === 'full'
      ? version.rich
      : version.minified
  const rewrites = getAIRewrittenVersions(config, 'slack', versions)
  const useAI = rewrites.size > 0
  const maxLength = resolveSlackPostMaxLength({ changelogFormat, postMaxLength: config.social.slack.postMaxLength })

  if (versions.length === 1) {
    const [version] = versions

    if (!useAI) {
      return getBody(version!)
    }

    return await generateAISocialChangelog({
      config,
      rawBody: version!.rich,
      fallbackBody: getBody(version!),
      platform: 'slack',
      maxLength,
      context: toAIContext(version!),
      dryRun,
    })
  }

  const rewritten = useAI
    ? await generateAISocialReleases({
        config,
        platform: 'slack',
        maxLength,
        dryRun,
        releases: versions.flatMap((version, index) => rewrites.has(version)
          ? [
              {
                id: String(index + 1),
                title: getVersionTitle(version.line, hasGroups),
                body: version.rich,
              },
            ]
          : []),
      })
    : new Map<string, string>()

  const changelogs = new Map(versions.map((version, index) => [version, rewritten.get(String(index + 1)) ?? getBody(version)]))

  return getSlackSections({
    overview,
    versions,
    changelogs,
    announcements,
    hasGroups,
  })
}

/** Budget of the changelog of a version in a Teams card */
const TEAMS_CHANGELOG_MAX_LENGTH = 1500

/**
 * The changelog of each version of the Teams cards: the full changelog with
 * `changelog: 'full'`, the titles of its commits with `'summary'`, or
 * rewritten by the AI in a single call
 */
async function getTeamsChangelogs({ config, versions, hasGroups, dryRun }: {
  config: ResolvedRelizyConfig
  versions: AnnouncedVersion[]
  hasGroups: boolean
  dryRun: boolean
}): Promise<Map<AnnouncedVersion, string>> {
  const changelog = getSocialChangelog(config.social.teams.changelog, 'none')

  if (changelog === 'full') {
    return new Map(versions.map(version => [version, version.rich]))
  }

  if (changelog !== 'summary') {
    return new Map()
  }

  const raw = new Map(versions.map(version => [version, version.minified]))

  const rewrites = getAIRewrittenVersions(config, 'teams', versions)
  if (rewrites.size === 0) {
    return raw
  }

  if (versions.length === 1) {
    const [version] = versions

    return new Map([
      [version!, await generateAISocialChangelog({
        config,
        rawBody: version!.rich,
        fallbackBody: version!.minified,
        platform: 'teams',
        maxLength: TEAMS_CHANGELOG_MAX_LENGTH,
        context: toAIContext(version!),
        dryRun,
      })],
    ])
  }

  const rewritten = await generateAISocialReleases({
    config,
    platform: 'teams',
    maxLength: TEAMS_CHANGELOG_MAX_LENGTH,
    dryRun,
    releases: versions.flatMap((version, index) => rewrites.has(version)
      ? [
          {
            id: String(index + 1),
            title: getVersionTitle(version.line, hasGroups),
            body: version.rich,
          },
        ]
      : []),
  })

  return new Map(versions.map((version, index) => [version, rewritten.get(String(index + 1)) ?? version.minified]))
}

/**
 * The name of a version in an announcement (`{{name}}`): the package name, the
 * project name (the title of its group with version groups) for the root version
 */
function getAnnouncedName(line: ReleaseLine, hasGroups: boolean): string {
  return line.group.versionMode !== 'independent' && hasGroups
    ? line.group.title
    : line.name
}

/**
 * The tag of a version: the root version is linked to the tag resolved for
 * the post (`--to`)
 */
function getAnnouncedTag(line: ReleaseLine, rootTag: string | undefined): string {
  return line.group.versionMode !== 'independent' && rootTag
    ? rootTag
    : line.tag
}

/**
 * The announcement of a version on Slack, with its variables replaced
 */
interface SlackAnnouncement {
  title?: string
  message?: string
  links: SocialLink[]
}

/**
 * The announcements of the versions of the Slack message: only with
 * `social.slack.announcements`, the other messages are unchanged
 */
function getSlackAnnouncements({ config, versions, projectName, rootTag, hasGroups }: {
  config: ResolvedRelizyConfig
  versions: AnnouncedVersion[]
  projectName: string
  rootTag?: string
  hasGroups: boolean
}): Map<AnnouncedVersion, SlackAnnouncement> {
  const slackConfig = config.social.slack
  const announcements = new Map<AnnouncedVersion, SlackAnnouncement>()

  if (!slackConfig.announcements) {
    return announcements
  }

  for (const version of versions) {
    const content = resolveAnnouncement(version.line, slackConfig)

    if (!content) {
      continue
    }

    const variables = getAnnouncementVariables({
      config,
      version: {
        line: version.line,
        name: getAnnouncedName(version.line, hasGroups),
        changelogDir: version.changelogDir,
      },
      content,
      projectName,
      releaseUrl: getReleaseUrl(config, getAnnouncedTag(version.line, rootTag)),
    })

    announcements.set(version, {
      title: content.title
        ? fillAnnouncementText(content.title, variables) || undefined
        : undefined,
      message: content.message
        ? fillAnnouncementText(content.message, variables) || undefined
        : undefined,
      links: getAnnouncementLinks(content, variables),
    })
  }

  return announcements
}

/**
 * The Teams cards of a release: one per version announced, or one for the
 * release with `cards: 'release'`
 */
async function getTeamsCards({ config, versions, overview, rootTag, hasGroups, dryRun }: {
  config: ResolvedRelizyConfig
  versions: AnnouncedVersion[]
  overview: ReleaseOverview
  rootTag?: string
  hasGroups: boolean
  dryRun: boolean
}): Promise<TeamsCard[]> {
  const teamsConfig = config.social.teams
  const byLine = new Map(versions.map(version => [version.line, version]))
  const candidates: TeamsVersion[] = versions.map(version => ({
    line: version.line,
    name: getAnnouncedName(version.line, hasGroups),
    changelogDir: version.changelogDir,
    changelog: '',
  }))
  const announced = resolveTeamsAnnouncements(teamsConfig, candidates)
  const changelogs = await getTeamsChangelogs({
    config,
    versions: announced.map(({ version }) => byLine.get(version.line)!),
    hasGroups,
    dryRun,
  })

  const sections = announced.map(({ version, content }) => {
    const tag = getAnnouncedTag(version.line, rootTag)
    const withChangelog = {
      version: { ...version, changelog: changelogs.get(byLine.get(version.line)!) ?? '' },
      content,
    }
    const variables = getAnnouncementVariables({
      config,
      version: withChangelog.version,
      content,
      projectName: overview.projectName,
      releaseUrl: getReleaseUrl(config, tag),
    })

    return getTeamsCardSection({ announced: withChangelog, variables })
  })

  if (sections.length === 0) {
    return []
  }

  return teamsConfig.cards === 'release'
    ? [
        {
          sections,
          title: getReleaseTitle(overview),
        },
      ]
    : sections.map(section => ({
        sections: [section],
      }))
}

async function handleTeamsPost({ config, versions, overview, rootTag, hasGroups, prerelease, dryRun, hookContext }: {
  config: ResolvedRelizyConfig
  versions: AnnouncedVersion[]
  overview: ReleaseOverview
  rootTag?: string
  hasGroups: boolean
  /**
   * True when every version of the release is a prerelease
   */
  prerelease: boolean
  dryRun: boolean
  hookContext?: HookContext
}): Promise<SocialNetworkResponse<{ posted: number }>> {
  const teamsConfig = config.social?.teams
  if (!teamsConfig?.enabled) {
    logger.debug('Teams posting is disabled in configuration')
    return { success: true, response: undefined }
  }

  const webhookUrl = getTeamsWebhookUrl({ socialWebhookUrl: teamsConfig.webhookUrl })
  if (!webhookUrl) {
    logger.warn('The URL of the Teams workflow is not configured. Set RELIZY_TEAMS_WEBHOOK_URL (or RELIZY_TEAMS_WEBHOOK_URL_B64) or social.teams.webhookUrl.')
    return { success: false, error: 'Teams webhook URL not found' }
  }

  if (prerelease) {
    logger.info('Skipping the Teams cards of the prereleases (social.teams.onlyStable is enabled)')
    return { success: true, skipped: 'prerelease' }
  }

  try {
    const cards = await getTeamsCards({
      config,
      versions,
      overview,
      rootTag,
      hasGroups,
      dryRun,
    })

    if (cards.length === 0) {
      logger.info('No version to announce on Teams (social.teams.announcements, social.teams.exclude)')
      return { success: true, skipped: 'nothing to announce' }
    }

    reportProgress('Posting on Teams')
    await executeHook('before:teams', config, dryRun, hookContext)

    try {
      const response = await postReleaseToTeams({
        cards,
        webhookUrl,
        badge: teamsConfig.badge,
        locale: teamsConfig.locale,
        dryRun,
      })
      await executeHook('success:teams', config, dryRun, hookContext)

      return { success: true, response }
    }
    catch (error) {
      await executeHook('error:teams', config, dryRun, hookContext)
      throw error
    }
  }
  catch (error) {
    logger.error('Error posting to Teams:', error)
    return { success: false, error: `Error posting to Teams: ${getErrorMessage(error)}` }
  }
}

function toSlackPackages(overview: ReleaseOverview): PackageBumpEntry[] {
  return overview.groups.flatMap(group => group.packages).map(pkg => ({
    name: pkg.name,
    oldVersion: pkg.oldVersion,
    newVersion: pkg.newVersion,
    version: pkg.newVersion,
    hasTransition: pkg.oldVersion !== pkg.newVersion,
  }))
}

export function social(options: Partial<SocialOptions> = {}): Promise<SocialResult> {
  // One git cache for the run: the same refs and ranges are read for each package and each step
  return runWithEvents(options.onProgress, () => withGitCache(() => runSocial(options)))
}

function runSocial(options: Partial<SocialOptions> = {}): Promise<SocialResult> {
  return runCommand<SocialResult>({
    name: 'social',
    label: 'Social media',
    errorMessage: 'Error during social media posting!',
    hook: 'social',
    options,
    loadConfig: async () => {
      const config = await loadRelizyConfig({
        configFile: options.configName,
        profile: options.profile,
        baseConfig: options.config,
        overrides: {
          from: options.from,
          to: options.to,
          logLevel: options.logLevel,
          safetyCheck: options.safetyCheck,
        },
      })

      applyAIOverride(config, options.ai)

      if (options.slackFormat) {
        config.social.slack = { ...config.social.slack, changelog: options.slackFormat }
      }

      return config
    },
    check: config => assertVersionGroupsOption({ config, groups: options.groups }),
    // The release goes on without its posts: the error is in the result
    recover: error => ({
      results: [
        {
          platform: 'unknown',
          success: false,
          error: error instanceof Error
            ? error.message
            : String(error),
        },
      ],
      hasErrors: true,
    }),
    run: async ({ config, dryRun, ui }) => {
      logger.debug(`Version mode: ${config.monorepo?.versionMode || (hasVersionGroups(config)
        ? 'version groups'
        : 'standalone')}`)

      const result = await ui.step({
        name: 'social',
        running: 'Posting the release',
        done: describeSocialResult,
        failed: result => result.hasErrors,
        run: () => postRelease({ config, options, dryRun }),
      })

      const posted = result.results.filter(({ success, skipped }) => success && !skipped)
      ui.complete(posted.length === 0
        ? {
            message: describeSocialResult(result),
            ...(result.hasErrors
              ? { failed: true }
              : { nothing: true }),
          }
        : {
            message: `${dryRun ? 'Simulated posts on' : 'Posted on'} ${posted.map(({ platform }) => platform).join(', ')}`,
            links: posted.flatMap(({ url }) => url
              ? [
                  { label: 'Tweet', url },
                ]
              : []),
          })

      return result
    },
  })
}

/**
 * What the posts did: `Posted on twitter, slack skipped (prerelease)`
 */
export function describeSocialResult(result: SocialResult): string {
  const posted = result.results.filter(({ success, skipped }) => success && !skipped).map(({ platform }) => platform)
  const failed = result.results.filter(({ success }) => !success).map(({ platform }) => platform)

  return [
    posted.length > 0
      ? `Posted on ${posted.join(', ')}`
      : '',
    ...describeSkippedPosts(result),
    failed.length > 0
      ? `${failed.join(', ')} failed`
      : '',
  ].filter(Boolean).join(', ') || 'Nothing posted'
}

/**
 * The platforms that posted nothing, with why: `twitter skipped (prerelease)`
 */
function describeSkippedPosts(result: SocialResult): string[] {
  return result.results.filter(({ skipped }) => skipped).map(({ platform, skipped }) => `${platform} skipped (${skipped})`)
}

function toNetworkResult(platform: string, response: SocialNetworkResponse<unknown>): SocialNetworkResult {
  if (!response.success) {
    return { platform, success: false, error: response.error }
  }

  if (response.skipped) {
    return { platform, success: true, skipped: response.skipped }
  }

  const tweetId = platform === 'twitter'
    ? (response.response as TweetV2PostTweetResult | undefined)?.data?.id
    : undefined
  return {
    platform,
    success: true,
    ...(tweetId
      ? { url: `https://x.com/i/web/status/${tweetId}` }
      : {}),
  }
}

/**
 * Post the release on the enabled platforms
 */
// eslint-disable-next-line complexity
async function postRelease({ config, options, dryRun }: {
  config: ResolvedRelizyConfig
  options: Partial<SocialOptions>
  dryRun: boolean
}): Promise<SocialResult> {
  // Safety check
  await socialSafetyCheck({
    config,
    versions: getKnownReleaseVersions({ config, bumpResult: options.bumpResult }),
  })

  if (!config.release.social && !isAnySocialPlatformEnabled(config)) {
    logger.warn('Social media posting is disabled in configuration.')
    logger.info('Enable it with release.social: true and social.twitter.enabled, social.slack.enabled or social.teams.enabled')
    return { results: [], hasErrors: false }
  }

  await executeHook('before:social', config, dryRun, getHookContext(config, options.bumpResult))

  const hasGroups = hasVersionGroups(config)
  const { overview, versions, commits, rootTag } = await collectAnnouncedRelease({ config, options, dryRun })

  // The hooks get what the posts announce
  const getPostHookContext = (release: ReleaseOverview) => options.bumpResult
    ? { bumpResult: options.bumpResult, release }
    : undefined

  if (versions.length === 0) {
    logger.info('No version to announce on social media')
    await executeHook('success:social', config, dryRun, getPostHookContext(overview))
    return { results: [], hasErrors: false }
  }

  const twitterPost = getPlatformPost({
    config,
    overview,
    versions,
    rootTag,
    onlyStable: !!config.social.twitter.onlyStable,
    isAnnounced: line => !isExcludedLine(line, config.social.twitter.exclude),
  })
  const slackPost = getPlatformPost({
    config,
    overview,
    versions,
    rootTag,
    onlyStable: config.social.slack.onlyStable ?? true,
    isAnnounced: line => resolveAnnouncement(line, config.social.slack) !== undefined,
  })
  const teamsPost = getPlatformPost({
    config,
    overview,
    versions,
    rootTag,
    onlyStable: config.social.teams?.onlyStable ?? true,
    isAnnounced: () => true,
  })
  const slackAnnouncements = getSlackAnnouncements({
    config,
    versions: slackPost.versions,
    projectName: overview.projectName,
    rootTag,
    hasGroups,
  })
  // The announcement of a single version: its title in the header, its message and its links
  const slackSingleAnnouncement = slackPost.versions.length === 1
    ? slackAnnouncements.get(slackPost.versions[0]!)
    : undefined
  const slackVariables = slackSingleAnnouncement?.title
    ? { ...slackPost.variables, releaseTitle: `${slackSingleAnnouncement.title} ${slackPost.versions[0]!.line.version} is out!` }
    : slackPost.variables

  const twitterResponse = await handleTwitterPost({
    config,
    changelog: config.social?.twitter?.enabled && twitterPost.versions.length > 0
      ? await getTweetChangelog({
          config,
          versions: twitterPost.versions,
          overview: twitterPost.overview,
          variables: twitterPost.variables,
          hasGroups,
          dryRun,
        })
      : '',
    dryRun,
    variables: twitterPost.variables,
    prerelease: twitterPost.prerelease,
    notAnnounced: twitterPost.notAnnounced,
    hookContext: getPostHookContext(twitterPost.overview),
  })

  const slackResponse = await handleSlackPost({
    config,
    changelog: config.social?.slack?.enabled && slackPost.versions.length > 0
      ? await getSlackChangelog({
          config,
          versions: slackPost.versions,
          overview: slackPost.overview,
          announcements: slackAnnouncements,
          hasGroups,
          dryRun,
        })
      : '',
    dryRun,
    variables: slackVariables,
    commits,
    packages: toSlackPackages(slackPost.overview),
    prerelease: slackPost.prerelease,
    notAnnounced: slackPost.notAnnounced,
    announcement: slackSingleAnnouncement && { message: slackSingleAnnouncement.message, links: slackSingleAnnouncement.links },
    hookContext: getPostHookContext(slackPost.overview),
  })

  const teamsResponse = await handleTeamsPost({
    config,
    versions: teamsPost.versions,
    overview: teamsPost.overview,
    rootTag,
    hasGroups,
    prerelease: teamsPost.prerelease,
    dryRun,
    hookContext: getPostHookContext(teamsPost.overview),
  })

  // The results of the enabled platforms
  const results: SocialNetworkResult[] = ([
    ['twitter', config.social?.twitter?.enabled, twitterResponse],
    ['slack', config.social?.slack?.enabled, slackResponse],
    ['teams', config.social?.teams?.enabled, teamsResponse],
  ] as const)
    .filter(([, enabled]) => enabled)
    .map(([platform, , response]) => toNetworkResult(platform, response))

  const hasErrors = results.some(r => !r.success)

  if (hasErrors) {
    await executeHook('error:social', config, dryRun, getPostHookContext(overview))
    logger.warn('Some social media posts failed')
  }
  else {
    logger.success('Social media posts completed!')
    await executeHook('success:social', config, dryRun, getPostHookContext(overview))
  }

  return { results, hasErrors }
}
