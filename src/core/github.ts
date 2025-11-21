import type { GitCommit } from 'changelogen'
import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, PostedRelease, ProviderReleaseOptions } from '../types'
import { logger } from '@maz-ui/node'
import { formatJson } from '@maz-ui/utils'
import { createGithubRelease } from 'changelogen'
import { generateChangelog, getIndependentTag, getPackagesOrBumpedPackages, getRootPackage, isBumpedPackage, isPrerelease, loadRelizyConfig, readPackageJson, resolveTags } from '../core'

// eslint-disable-next-line sonarjs/cognitive-complexity
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

  logger.debug(`GitHub token: ${config.tokens.github || config.repo?.token ? '✓ provided' : '✗ missing'}`)

  if (!config.tokens.github && !config.repo?.token) {
    throw new Error('No GitHub token specified. Set GITHUB_TOKEN or GH_TOKEN environment variable.')
  }

  const packages = await getPackagesOrBumpedPackages({
    config,
    bumpResult,
    suffix,
    force,
  })

  logger.info(`Creating ${packages.length} GitHub release(s)`)

  const postedReleases: PostedRelease[] = []

  for (const pkg of packages) {
    const newVersion = (isBumpedPackage(pkg) && pkg.newVersion) || pkg.version

    const from = config.from || pkg.fromTag
    const to = config.to || getIndependentTag({ version: newVersion, name: pkg.name })

    if (!from) {
      logger.warn(`No from tag found for ${pkg.name}, skipping release`)
      continue
    }

    const toTag = dryRun ? 'HEAD' : to

    logger.debug(`Processing ${pkg.name}: ${from} → ${toTag}`)

    const changelog = await generateChangelog({
      pkg,
      config,
      dryRun,
      newVersion,
    })

    const releaseBody = changelog.split('\n').slice(2).join('\n')

    const release = {
      tag_name: to,
      name: to,
      body: releaseBody,
      prerelease: isPrerelease(newVersion),
    }

    logger.debug(`Creating release for ${to}${release.prerelease ? ' (prerelease)' : ''}`)

    if (dryRun) {
      logger.info(`[dry-run] Publish GitHub release for ${to}`)
      postedReleases.push({
        name: pkg.name,
        tag: release.tag_name,
        version: newVersion,
        prerelease: release.prerelease,
      })
    }
    else {
      logger.debug(`Publishing release ${to} to GitHub...`)

      await createGithubRelease({
        ...config,
        from,
        to,
        repo: repoConfig,
      }, release)

      postedReleases.push({
        name: pkg.name,
        tag: release.tag_name,
        version: newVersion,
        prerelease: release.prerelease,
      })
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

  logger.debug(`GitHub token: ${config.tokens.github || config.repo?.token ? '✓ provided' : '✗ missing'}`)

  if (!config.tokens.github && !config.repo?.token) {
    throw new Error('No GitHub token specified. Set GITHUB_TOKEN or GH_TOKEN environment variable.')
  }

  const newVersion = bumpResult?.newVersion || rootPackage.version

  const to = config.to || config.templates.tagBody.replace('{{newVersion}}', newVersion)

  const changelog = await generateChangelog({
    pkg: rootPackage,
    config,
    dryRun,
    newVersion,
  })

  const releaseBody = changelog.split('\n').slice(2).join('\n')

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
  }
  else {
    logger.debug('Publishing release to GitHub...')
    await createGithubRelease({
      ...config,
      from: (bumpResult?.bumped && bumpResult.fromTag) || 'v0.0.0',
      to,
      repo: repoConfig,
    }, release)
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
  try {
    const dryRun = options.dryRun ?? false
    logger.debug(`Dry run: ${dryRun}`)

    const config = await loadRelizyConfig({
      configName: options.configName,
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
