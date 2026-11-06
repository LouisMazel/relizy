import type { BumpResultTruthy, GitCommit, PostedRelease, ProviderReleaseOptions } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { logger } from '@maz-ui/node'
import { formatJson } from '@maz-ui/utils/helpers/formatJson'
import { generateAIProviderReleaseBody, isAIProviderReleaseEnabled } from './ai'
import { generateChangelog } from './changelog'
import { loadRelizyConfig } from './config'
import { formatRepoTag } from './format'
import { getFirstCommit } from './git'
import { createGithubRelease } from './github-api'
import { reportProgress, showPreview } from './progress'
import { getPrivatePackagesMode, getRootPackage, readPackageJson } from './repo'
import { getIndependentTag, resolveTags } from './tags'
import { filterPrivatePackagesUnlessIncluded, getPackagesOrBumpedPackages, isBumpedPackage } from './utils'
import { extractVersionFromTag, isPrerelease } from './version'

async function publishIndependentRelease({
  pkg,
  config,
  dryRun,
  repoConfig,
}: {
  pkg: import('../types').PackageBase
  config: ResolvedRelizyConfig
  dryRun: boolean
  repoConfig: NonNullable<ResolvedRelizyConfig['repo']>
}): Promise<PostedRelease | undefined> {
  const newVersion = (isBumpedPackage(pkg) && pkg.newVersion) || pkg.version

  const from = config.from || pkg.fromTag
  const to = config.to || getIndependentTag({ version: newVersion, name: pkg.name })

  if (!from) {
    logger.warn(`No from tag found for ${pkg.name}, skipping release`)
    return undefined
  }

  const toTag = dryRun ? 'HEAD' : to
  logger.debug(`Processing ${pkg.name}: ${from} → ${toTag}`)

  reportProgress(`Writing the notes of ${to}`)

  // Pass `from` via `pkg.fromTag` so `generateChangelog` resolves the right
  // git range without us overriding `config.to` (which would otherwise leak
  // the not-yet-created future tag into `git log`).
  const releaseBody = await generateChangelog({
    pkg: { ...pkg, fromTag: from },
    config,
    dryRun,
    newVersion,
    include: { title: false, compareLink: true, body: true, contributors: true },
    transformBody: isAIProviderReleaseEnabled(config)
      ? body => generateAIProviderReleaseBody({ config, rawBody: body, label: to, context: { project: pkg.name, version: newVersion, previousVersion: extractVersionFromTag(from, pkg.name) || undefined }, dryRun })
      : undefined,
  })

  const release = {
    tag_name: to,
    name: to,
    body: releaseBody,
    prerelease: isPrerelease(newVersion),
  }

  logger.debug(`Creating release for ${to}${release.prerelease ? ' (prerelease)' : ''}`)

  if (dryRun) {
    logger.info(`[dry-run] Publish GitHub release for ${release.tag_name}`)
    showPreview({ title: `GitHub release ${release.tag_name}`, meta: release.prerelease ? ['Prerelease'] : [], content: releaseBody })
  }
  else {
    logger.debug(`Publishing release ${to} to GitHub...`)
    reportProgress(`Creating the GitHub release ${to}`)
    await createGithubRelease({ repo: repoConfig, tokens: config.tokens }, release)
  }

  return {
    name: pkg.name,
    tag: release.tag_name,
    version: newVersion,
    prerelease: release.prerelease,
  }
}

async function githubIndependentMode({
  config,
  dryRun,
  bumpResult,
  force,
  suffix,
}: {
  config: ResolvedRelizyConfig
  dryRun: boolean
  bumpResult: BumpResultTruthy | undefined
  force: boolean
  suffix: string | undefined
}): Promise<PostedRelease[]> {
  const repoConfig = config.repo

  if (!repoConfig) {
    throw new Error('No repository configuration found. Please check your changelog config.')
  }

  logger.debug(`GitHub token: ${config.tokens.github ? '✓ provided' : '✗ missing'}`)

  if (!config.tokens.github) {
    throw new Error('No GitHub token specified. Set GITHUB_TOKEN or GH_TOKEN environment variable.')
  }

  const packages = filterPrivatePackagesUnlessIncluded(await getPackagesOrBumpedPackages({
    config,
    bumpResult,
    suffix,
    force,
    dryRun,
  }), getPrivatePackagesMode(config))

  logger.info(`Creating ${packages.length} GitHub release(s)`)

  const postedReleases: PostedRelease[] = []

  for (const pkg of packages) {
    const posted = await publishIndependentRelease({ pkg, config, dryRun, repoConfig })
    if (posted) {
      postedReleases.push(posted)
    }
  }

  if (postedReleases.length === 0) {
    logger.warn('No releases created')
  }
  else {
    logger.success(`Releases ${postedReleases.map(r => r.tag).join(', ')} published to GitHub!`)
  }

  return postedReleases
}

async function githubUnified({
  config,
  dryRun,
  rootPackage,
  bumpResult,
}: {
  config: ResolvedRelizyConfig
  dryRun: boolean
  rootPackage: {
    name: string
    version: string
    path: string
    fromTag?: string
    commits: GitCommit[]
  }
  bumpResult: BumpResultTruthy | undefined
}) {
  const repoConfig = config.repo

  if (!repoConfig) {
    throw new Error('No repository configuration found. Please check your changelog config.')
  }

  logger.debug(`GitHub token: ${config.tokens.github ? '✓ provided' : '✗ missing'}`)

  if (!config.tokens.github) {
    throw new Error('No GitHub token specified. Set GITHUB_TOKEN or GH_TOKEN environment variable.')
  }

  const newVersion = bumpResult?.newVersion || rootPackage.version

  const to = config.to || formatRepoTag(config.templates.tagBody, newVersion)

  const firstCommit = getFirstCommit(config.cwd)
  const from = config.from || rootPackage.fromTag || firstCommit

  reportProgress(`Writing the notes of ${to}`)
  const releaseBody = await generateChangelog({
    pkg: { ...rootPackage, fromTag: from },
    config,
    dryRun,
    newVersion,
    include: { title: false, compareLink: true, body: true, contributors: true },
    transformBody: isAIProviderReleaseEnabled(config)
      ? body => generateAIProviderReleaseBody({ config, rawBody: body, label: to, context: { project: config.projectName || rootPackage.name, version: newVersion, previousVersion: extractVersionFromTag(from) || bumpResult?.oldVersion }, dryRun })
      : undefined,
  })

  const release = {
    tag_name: to,
    name: to,
    body: releaseBody,
    prerelease: isPrerelease(to),
  }

  logger.debug(`Creating release for ${to}${release.prerelease ? ' (prerelease)' : ''}`)
  logger.debug('Release details:', formatJson({
    tag_name: release.tag_name,
    name: release.name,
    prerelease: release.prerelease,
  }))

  if (dryRun) {
    logger.info('[dry-run] Publish GitHub release for', release.tag_name)
    showPreview({ title: `GitHub release ${release.tag_name}`, meta: release.prerelease ? ['Prerelease'] : [], content: releaseBody })
  }
  else {
    logger.debug('Publishing release to GitHub...')
    reportProgress(`Creating the GitHub release ${to}`)
    await createGithubRelease({ repo: repoConfig, tokens: config.tokens }, release)
  }

  logger.success(`Release ${to} published to GitHub!`)

  return [{
    name: to,
    tag: to,
    version: to,
    prerelease: release.prerelease,
  }] satisfies PostedRelease[]
}

export async function github(options: ProviderReleaseOptions) {
  logger.debug('Config:', options)
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
        tokens: {
          github: options.token,
        },
      },
    })

    if (config.monorepo?.versionMode === 'independent') {
      return await githubIndependentMode({
        config,
        dryRun,
        bumpResult: options.bumpResult,
        force: options.force ?? false,
        suffix: options.suffix,
      })
    }

    const rootPackageBase = readPackageJson(config.cwd)

    if (!rootPackageBase) {
      throw new Error('Failed to read root package.json')
    }

    const newVersion = options.bumpResult?.newVersion || rootPackageBase.version

    const { from, to } = await resolveTags<'provider-release'>({
      config,
      step: 'provider-release',
      newVersion,
      pkg: rootPackageBase,
    })

    const rootPackage = options.bumpResult?.rootPackage || await getRootPackage({
      config,
      force: options.force ?? false,
      suffix: options.suffix,
      changelog: true,
      from,
      to,
      dryRun,
    })

    return await githubUnified({
      config,
      dryRun,
      rootPackage,
      bumpResult: options.bumpResult,
    })
  }
  catch (error) {
    logger.error('Error publishing GitHub release:', error)
    throw error
  }
}
