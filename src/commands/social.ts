import type { ChatPostMessageResponse } from '@slack/web-api'
import type { TweetV2PostTweetResult } from 'twitter-api-v2'
import type { PackageBumpEntry, ReleaseLine, ReleaseOverview, ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, GitCommit, GroupBumpResult, SlackReleaseSection, SocialNetworkResult, SocialOptions, SocialResult, SocialTemplateVariables, TweetSection } from '../types'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { assertVersionGroupsOption, collectContributorNames, executeHook, extractChangelogHighlights, fillSocialTemplate, filterOutPrivatePackages, generateChangelog, getGroupBumpResult, getPackageCommits, getPackagesOrBumpedPackages, getReleaseLines, getReleaseOverview, getReleaseTag, getReleaseUrl, getRootPackage, getSlackToken, getSlackWebhookUrl, getSocialTemplateVariables, getTweetLength, getTwitterCredentials, getVersionGroupTitle, hasVersionGroups, isBumpedPackage, isPrerelease, isRelizyCancelError, keepReleaseLines, loadRelizyConfig, postReleaseToSlack, postReleaseToTwitter, readPackageJson, resolveSlackPostMaxLength, resolveTags, resolveVersionGroups, withoutPrivatePackages } from '../core'
import { aiSafetyCheck, applyAIOverride, generateAISocialChangelog, generateAISocialReleases, isAISocialEnabled } from '../core/ai'

type SocialNetworkResponse<T> = { success: true, response?: T } | { success: false, error: string }

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

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export async function socialSafetyCheck({ config }: { config: ResolvedRelizyConfig }) {
  try {
    const socialMediaDisabled = !config.release.social && !config.social.twitter.enabled && !config.social.slack.enabled
    if (!config.safetyCheck || socialMediaDisabled) {
      logger.debug('Safety check disabled or social disabled')
      return
    }

    logger.debug('Start checking social config')

    // Check Twitter configuration
    const twitterConfig = config.social?.twitter
    if (twitterConfig?.enabled) {
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
    if (slackConfig?.enabled) {
      const webhookUrl = getSlackWebhookUrl({ socialWebhookUrl: slackConfig.webhookUrl })
      const token = getSlackToken({
        socialCredentials: slackConfig.credentials,
        tokenCredential: config.tokens?.slack,
      })

      if (webhookUrl) {
        // Webhook mode — priority. @slack/web-api is not required.
        if (slackConfig.channel) {
          logger.warn('social.slack.channel is ignored when webhookUrl is set (channel is baked into the webhook URL).')
        }
        if (token) {
          logger.warn('Slack token is ignored when webhookUrl is set (webhook takes priority).')
        }
      }
      else if (token) {
        // Token mode — check @slack/web-api and require channel
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
        logger.log('  (a) social.slack.webhookUrl (or SLACK_WEBHOOK_URL / RELIZY_SLACK_WEBHOOK_URL env var) — simpler setup, channel baked in')
        logger.log('  (b) social.slack.credentials.token (or SLACK_TOKEN / RELIZY_SLACK_TOKEN env var) + social.slack.channel — requires bot invite')

        throw new Error('Slack credentials not found')
      }
    }

    if (isAISocialEnabled(config, 'twitter') || isAISocialEnabled(config, 'slack')) {
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
}: {
  config: ResolvedRelizyConfig
  changelog: string | TweetSection[]
  dryRun: boolean
  variables: SocialTemplateVariables
  /**
   * True when every version of the release is a prerelease
   */
  prerelease: boolean
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
      return { success: true, response: undefined }
    }

    await executeHook('before:twitter', config, dryRun)

    try {
      logger.debug(`Release URL: ${variables.releaseUrl || 'none'}`)
      logger.debug(`Changelog URL: ${variables.changelogUrl || 'none'}`)
      const response = await postReleaseToTwitter({
        template: config.social.twitter.template || config.templates.twitterMessage,
        variables,
        changelog,
        credentials,
        dryRun,
        postMaxLength: config.social.twitter.postMaxLength,
      })

      await executeHook('success:twitter', config, dryRun)

      return { success: true, response }
    }
    catch (error) {
      await executeHook('error:twitter', config, dryRun)
      logger.error('Error posting to Twitter:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: `Error posting to Twitter: ${errorMessage}` }
    }
  }
  catch (error) {
    logger.error('Error during Twitter posting:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
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
  /**
   * True when every version of the release is a prerelease
   */
  prerelease: boolean
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

    const slackMode = webhookUrl ? 'webhook mode' : `token mode, channel: ${slackConfig.channel}`
    logger.debug(`Slack: ${slackMode}`)
    logger.debug(`Preparing Slack message for release: ${variables.releaseTitle}`)

    // Check if this is a prerelease and if we should skip it
    if ((slackConfig.onlyStable ?? true) && prerelease) {
      logger.info(`Skipping Slack post for prerelease ${variables.newVersion || variables.packageList} (social.slack.onlyStable is enabled)`)
      return { success: true, response: undefined }
    }

    try {
      await executeHook('before:slack', config, dryRun)

      logger.debug(`Release URL: ${variables.releaseUrl || 'none'}`)
      logger.debug(`Changelog URL: ${variables.changelogUrl || 'none'}`)

      const template = slackConfig.template || config.templates.slackMessage

      // Resolve contributors: global noAuthors is the gate, slack-specific can further restrict
      const shouldHideContributors
        = config.noAuthors === true
          || slackConfig.noAuthors === true
      const contributors = shouldHideContributors
        ? []
        : collectContributorNames({ commits, config })
      logger.debug(`Contributors: ${contributors.length}`)

      // Resolve bumped packages (list shown between changelog and contributors)
      const packages = slackConfig.noPackages === true ? [] : releasedPackages
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
        changelogFormat: slackConfig.changelogFormat ?? 'summary',
        dryRun,
      })

      await executeHook('success:slack', config, dryRun)

      return { success: true, response }
    }
    catch (error) {
      await executeHook('error:slack', config, dryRun)
      logger.error('Error posting to Slack:', error)

      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: `Error posting to Slack: ${errorMessage}` }
    }
  }
  catch (error) {
    logger.error('Error during Slack posting:', error)

    const errorMessage = error instanceof Error ? error.message : String(error)
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
 * A version announced by a post, with its changelog
 */
interface AnnouncedVersion {
  line: ReleaseLine
  minified: string
  rich: string
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
    suffix: options.suffix,
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
      include: { title: false, compareLink: false, body: true, contributors: false },
      minify,
    })

    changelogs.set(pkg.name, { minified: await generate(true), rich: await generate(false) })

    // `to` is HEAD because the release tags do not exist yet at this stage of the release flow
    addCommits(commitsByHash, await getPackageCommits({ pkg, from, to: 'HEAD', config, changelog: true, dryRun }))
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
    commits: [...commitsByHash.values()],
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
  const { from, to } = await resolveTags<'social'>({ config, step: 'social', newVersion, pkg: rootPackageRead })
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
    include: { title: false, compareLink: false, body: true, contributors: false },
    minify,
  })

  return {
    released: { bumped: true, newVersion, fromTag, bumpedPackages: bumpResult?.bumpedPackages ?? [] },
    changelogs: new Map([[ROOT_VERSION, { minified: await generate(true), rich: await generate(false) }]]),
    // With `changelog: true`, the authors of title-only commits (e.g. `docs:`) are credited too.
    // `to` resolves to the future release tag (created later in the release flow), so `git log` uses HEAD
    commits: await getPackageCommits({ pkg: rootPackage, from: fromTag, to: 'HEAD', config, changelog: true, dryRun }),
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
 * What the post announces, with the config without version groups, or with
 * the version groups that bumped and are not left out of the posts
 * (`release.social: false`).
 */
async function collectAnnouncedRelease({ config, options, dryRun }: {
  config: ResolvedRelizyConfig
  options: Partial<SocialOptions>
  dryRun: boolean
}): Promise<{ overview: ReleaseOverview, versions: AnnouncedVersion[], commits: GitCommit[], rootTag?: string }> {
  const collected: { name?: string, release: CollectedRelease }[] = []
  let bumpResult: BumpResultTruthy

  if (hasVersionGroups(config)) {
    const groups: GroupBumpResult[] = []

    for (const { group, config: groupConfig } of resolveVersionGroups({ config, only: options.groups })) {
      const groupBumpResult = getGroupBumpResult(options.bumpResult, group.name)

      if (groupBumpResult === null) {
        logger.debug(`Version group "${group.name}" did not bump, nothing to post`)
        continue
      }

      if (groupConfig.release.social === false) {
        logger.info(`Version group "${group.name}" is left out of the social posts (release.social: false)`)
        continue
      }

      const release = await collectRelease({ config: groupConfig, options, bumpResult: groupBumpResult, dryRun })
      collected.push({ name: group.name, release })
      groups.push({ ...release.released, name: group.name, title: getVersionGroupTitle(group), versionMode: group.versionMode })
    }

    bumpResult = { bumped: true, bumpedPackages: groups.flatMap(group => group.bumpedPackages), groups }
  }
  else {
    const release = await collectRelease({ config, options, bumpResult: options.bumpResult, dryRun })
    collected.push({ release })
    bumpResult = release.released
  }

  const overview = withoutPrivatePackages(getReleaseOverview({ config, bumpResult }))
  const commitsByHash = new Map<string, GitCommit>()

  for (const { release } of collected) {
    addCommits(commitsByHash, release.commits)
  }

  const versions = getReleaseLines(overview).map((line) => {
    const release = collected.find(({ name }) => name === line.group.name)?.release
    const changelog = release?.changelogs.get(line.group.versionMode === 'independent' ? line.name : ROOT_VERSION)

    return { line, minified: changelog?.minified.trim() ?? '', rich: changelog?.rich.trim() ?? '' }
  })

  return {
    overview,
    versions,
    commits: [...commitsByHash.values()],
    rootTag: collected.find(({ release }) => release.rootTag)?.release.rootTag,
  }
}

/**
 * What a platform posts: the versions announced, without the prereleases with
 * `onlyStable`, and the variables of its template.
 */
function getPlatformPost({ config, overview, versions, rootTag, onlyStable }: {
  config: ResolvedRelizyConfig
  overview: ReleaseOverview
  versions: AnnouncedVersion[]
  rootTag?: string
  onlyStable: boolean
}) {
  const isPosted = (line: ReleaseLine) => !onlyStable || !isPrerelease(line.version)
  const postedOverview = keepReleaseLines(overview, isPosted)
  const postedVersions = versions.filter(version => isPosted(version.line))
  const rootGroup = postedOverview.groups.find(group => group.versionMode !== 'independent')
  const releaseTag = getReleaseTag(postedOverview)
  // The root version is linked to the tag resolved for the post (`--to`)
  const tag = rootTag && releaseTag && releaseTag === rootGroup?.tag ? rootTag : releaseTag

  return {
    versions: postedVersions,
    overview: postedOverview,
    // Nothing stable to announce: the platform skips the post
    prerelease: versions.length > 0 && postedVersions.length === 0,
    variables: getSocialTemplateVariables({
      overview: postedVersions.length > 0 ? postedOverview : overview,
      releaseUrl: tag ? getReleaseUrl(config, tag) : undefined,
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

      return { title: version && getVersionTitle(version.line, hasGroups), highlights: version ? highlights.get(version) ?? [] : [] }
    }

    return {
      title: hasGroups ? group.title : undefined,
      packages: groupVersions.map(version => ({ label: getVersionTitle(version.line, hasGroups), highlights: highlights.get(version) ?? [] })),
    }
  })
}

/**
 * The sections of a Slack message announcing several versions, one per group
 */
function getSlackSections({ overview, versions, changelogs, hasGroups }: {
  overview: ReleaseOverview
  versions: AnnouncedVersion[]
  changelogs: Map<AnnouncedVersion, string>
  hasGroups: boolean
}): SlackReleaseSection[] {
  return overview.groups.map((group) => {
    const groupVersions = versions.filter(version => version.line.group.name === group.name && version.line.group.versionMode === group.versionMode)

    if (group.versionMode !== 'independent') {
      const [version] = groupVersions

      return { title: version && getVersionTitle(version.line, hasGroups), changelog: version ? changelogs.get(version) ?? '' : '' }
    }

    return {
      title: hasGroups ? group.title : undefined,
      packages: groupVersions.map((version) => {
        const pkg = group.packages.find(({ name }) => name === version.line.name)

        return { name: version.line.name, oldVersion: pkg?.oldVersion, newVersion: version.line.version, changelog: changelogs.get(version) ?? '' }
      }),
    }
  })
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
  const useAI = isAISocialEnabled(config, 'twitter') && versions.some(version => version.minified.trim())
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

    const changelog = await generateAISocialChangelog({ config, rawBody: version!.rich, fallbackBody: version!.minified, platform: 'twitter', maxLength })
    if (dryRun) {
      logger.box('[dry-run] AI Twitter preview', `\n\n${changelog}`)
    }

    return changelog
  }

  const rewritten = useAI
    ? await generateAISocialReleases({
        config,
        platform: 'twitter',
        maxLength,
        releases: versions.map((version, index) => ({
          id: String(index + 1),
          title: getVersionTitle(version.line, hasGroups),
          body: version.rich,
          highlights: version.line.group.versionMode === 'independent' ? 1 : 3,
        })),
      })
    : new Map<string, string>()

  const highlights = new Map(versions.map((version, index) => {
    const aiHighlights = rewritten.get(String(index + 1))

    return [version, aiHighlights ? parseHighlights(aiHighlights) : extractChangelogHighlights(version.minified)]
  }))

  return getTweetSections({ overview, versions, highlights, hasGroups })
}

/**
 * The changelog of the Slack message: the changelog of its version, or the
 * sections of its versions. With AI, rewritten in a single call.
 */
async function getSlackChangelog({ config, versions, overview, hasGroups, dryRun }: {
  config: ResolvedRelizyConfig
  versions: AnnouncedVersion[]
  overview: ReleaseOverview
  hasGroups: boolean
  dryRun: boolean
}): Promise<string | SlackReleaseSection[]> {
  const changelogFormat = config.social?.slack?.changelogFormat ?? 'summary'
  const getBody = (version: AnnouncedVersion) => changelogFormat === 'full' ? version.rich : version.minified
  const useAI = isAISocialEnabled(config, 'slack') && versions.some(version => version.minified.trim())
  const maxLength = resolveSlackPostMaxLength({ changelogFormat, postMaxLength: config.social.slack.postMaxLength })

  if (versions.length === 1) {
    const [version] = versions

    if (!useAI) {
      return getBody(version!)
    }

    const changelog = await generateAISocialChangelog({ config, rawBody: version!.rich, fallbackBody: getBody(version!), platform: 'slack', maxLength })
    if (dryRun) {
      logger.box('[dry-run] AI Slack preview', changelog)
    }

    return changelog
  }

  const rewritten = useAI
    ? await generateAISocialReleases({
        config,
        platform: 'slack',
        maxLength,
        releases: versions.map((version, index) => ({ id: String(index + 1), title: getVersionTitle(version.line, hasGroups), body: version.rich })),
      })
    : new Map<string, string>()

  const changelogs = new Map(versions.map((version, index) => [version, rewritten.get(String(index + 1)) ?? getBody(version)]))

  return getSlackSections({ overview, versions, changelogs, hasGroups })
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

// eslint-disable-next-line complexity
export async function social(options: Partial<SocialOptions> = {}): Promise<SocialResult> {
  try {
    const dryRun = options.dryRun ?? false
    logger.debug(`Dry run: ${dryRun}`)

    const config = await loadRelizyConfig({
      configFile: options.configName,
      baseConfig: options.config,
      overrides: {
        from: options.from,
        to: options.to,
        logLevel: options.logLevel,
        safetyCheck: options.safetyCheck,
      },
    })

    assertVersionGroupsOption({ config, groups: options.groups })

    applyAIOverride(config, options.ai)

    if (options.slackFormat) {
      config.social.slack = { ...config.social.slack, changelogFormat: options.slackFormat }
    }

    logger.debug(`Version mode: ${config.monorepo?.versionMode || (hasVersionGroups(config) ? 'version groups' : 'standalone')}`)

    // Safety check
    await socialSafetyCheck({ config })

    if (!config.release.social && !config.social?.twitter?.enabled && !config.social?.slack?.enabled) {
      logger.warn('Social media posting is disabled in configuration.')
      logger.info('Enable it with release.social: true or social.twitter.enabled: true or social.slack.enabled: true')
      return { results: [], hasErrors: false }
    }

    await executeHook('before:social', config, dryRun)

    const hasGroups = hasVersionGroups(config)
    const { overview, versions, commits, rootTag } = await collectAnnouncedRelease({ config, options, dryRun })

    if (versions.length === 0) {
      logger.info('No version to announce on social media')
      await executeHook('success:social', config, dryRun)
      return { results: [], hasErrors: false }
    }

    const twitterPost = getPlatformPost({ config, overview, versions, rootTag, onlyStable: !!config.social.twitter.onlyStable })
    const slackPost = getPlatformPost({ config, overview, versions, rootTag, onlyStable: config.social.slack.onlyStable ?? true })

    const twitterResponse = await handleTwitterPost({
      config,
      changelog: config.social?.twitter?.enabled && !twitterPost.prerelease
        ? await getTweetChangelog({ config, versions: twitterPost.versions, overview: twitterPost.overview, variables: twitterPost.variables, hasGroups, dryRun })
        : '',
      dryRun,
      variables: twitterPost.variables,
      prerelease: twitterPost.prerelease,
    })

    const slackResponse = await handleSlackPost({
      config,
      changelog: config.social?.slack?.enabled && !slackPost.prerelease
        ? await getSlackChangelog({ config, versions: slackPost.versions, overview: slackPost.overview, hasGroups, dryRun })
        : '',
      dryRun,
      variables: slackPost.variables,
      commits,
      packages: toSlackPackages(slackPost.overview),
      prerelease: slackPost.prerelease,
    })

    // The results of the enabled platforms
    const results: SocialNetworkResult[] = ([
      ['twitter', config.social?.twitter?.enabled, twitterResponse],
      ['slack', config.social?.slack?.enabled, slackResponse],
    ] as const)
      .filter(([, enabled]) => enabled)
      .map(([platform, , response]) => ({
        platform,
        success: response.success,
        error: response.success ? undefined : response.error,
      }))

    const hasErrors = results.some(r => !r.success)

    if (hasErrors) {
      await executeHook('error:social', config, dryRun)
      logger.warn('Some social media posts failed')
    }
    else {
      logger.success('Social media posts completed!')
      await executeHook('success:social', config, dryRun)
    }

    return { results, hasErrors }
  }
  catch (error) {
    // Refused or cancelled prompt: nothing was written, it is not a failure
    if (isRelizyCancelError(error)) {
      throw error
    }

    logger.error('Error during social media posting:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      results: [{ platform: 'unknown', success: false, error: errorMessage }],
      hasErrors: true,
    }
  }
}
