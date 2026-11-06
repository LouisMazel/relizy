import type { BumpResultTruthy, PackageBase, PostedRelease, ProviderReleaseOptions } from '../types'
import type { ResolvedRelizyConfig } from './config'
import type { RootPackage } from './repo'
import { logger } from '@maz-ui/node'
import { generateAIProviderReleaseBody, isAIProviderReleaseEnabled } from './ai'
import { generateChangelog } from './changelog'
import { loadRelizyConfig } from './config'
import { formatRepoTag } from './format'
import { getFirstCommit } from './git'
import { reportProgress, showPreview } from './progress'
import { getPrivatePackagesMode, getRootPackage, readPackageJson } from './repo'
import { getIndependentTag, resolveTags } from './tags'
import { filterPrivatePackagesUnlessIncluded, getPackagesOrBumpedPackages, isBumpedPackage } from './utils'
import { extractVersionFromTag, isPrerelease } from './version'

/**
 * The releases of a git provider (GitHub, GitLab), the same flow for each: the
 * tags, the notes (changelog, AI), the dry-run preview and the summary. The
 * provider only checks its config and creates a release.
 */

/** A release to create, its tag named after its version */
export interface ProviderRelease {
  tag: string
  notes: string
  prerelease: boolean
}

export interface ReleaseProvider {
  /** In the logs and the previews: `GitHub`, `GitLab` */
  name: string
  /** The token of `tokens` the `token` option overrides */
  tokenKey: 'github' | 'gitlab'
  /** Whether the provider flags the prereleases, shown in the preview */
  flagsPrereleases: boolean
  /** Throws when the config cannot create the releases (repository, token) */
  check: (config: ResolvedRelizyConfig) => void
  create: (args: { config: ResolvedRelizyConfig, release: ProviderRelease, dryRun: boolean }) => Promise<unknown>
}

async function postRelease({
  provider,
  config,
  release,
  dryRun,
}: {
  provider: ReleaseProvider
  config: ResolvedRelizyConfig
  release: ProviderRelease
  dryRun: boolean
}): Promise<void> {
  logger.debug(`Creating release for ${release.tag}${release.prerelease ? ' (prerelease)' : ''}`)

  if (dryRun) {
    logger.info(`[dry-run] Publish ${provider.name} release for ${release.tag}`)
    showPreview({
      title: `${provider.name} release ${release.tag}`,
      meta: provider.flagsPrereleases && release.prerelease ? ['Prerelease'] : [],
      content: release.notes,
    })
    return
  }

  logger.debug(`Publishing release ${release.tag} to ${provider.name}...`)
  reportProgress(`Creating the ${provider.name} release ${release.tag}`)
  await provider.create({ config, release, dryRun })
}

async function postPackageRelease({
  provider,
  pkg,
  config,
  dryRun,
}: {
  provider: ReleaseProvider
  pkg: PackageBase
  config: ResolvedRelizyConfig
  dryRun: boolean
}): Promise<PostedRelease | undefined> {
  const newVersion = (isBumpedPackage(pkg) && pkg.newVersion) || pkg.version

  const from = config.from || pkg.fromTag
  const to = getIndependentTag({ version: newVersion, name: pkg.name })

  if (!from) {
    logger.warn(`No from tag found for ${pkg.name}, skipping release`)
    return undefined
  }

  logger.debug(`Processing ${pkg.name}: ${from} → ${dryRun ? 'HEAD' : to}`)

  // Pass `from` via `pkg.fromTag` so `generateChangelog` resolves the right
  // git range without overriding `config.to` (which would otherwise leak the
  // not-yet-created future tag into `git log`).
  const changelogPackage = { ...pkg, fromTag: from }

  // The full notes always hold the compare link: the body alone tells whether there is anything to release
  const bodyOnly = await generateChangelog({
    pkg: changelogPackage,
    config,
    dryRun,
    newVersion,
    include: { title: false, compareLink: false, body: true, contributors: false },
  })

  if (!bodyOnly.trim()) {
    logger.warn(`No changelog found for ${pkg.name}`)
    return undefined
  }

  reportProgress(`Writing the notes of ${to}`)
  const notes = await generateChangelog({
    pkg: changelogPackage,
    config,
    dryRun,
    newVersion,
    include: { title: false, compareLink: true, body: true, contributors: true },
    transformBody: isAIProviderReleaseEnabled(config)
      ? body => generateAIProviderReleaseBody({ config, rawBody: body, label: to, context: { project: pkg.name, version: newVersion, previousVersion: extractVersionFromTag(from, pkg.name) || undefined }, dryRun })
      : undefined,
  })

  const release = { tag: to, notes, prerelease: isPrerelease(newVersion) }
  await postRelease({ provider, config, release, dryRun })

  return { name: pkg.name, tag: to, version: newVersion, prerelease: release.prerelease }
}

async function postIndependentReleases({
  provider,
  config,
  dryRun,
  bumpResult,
  force,
  suffix,
}: {
  provider: ReleaseProvider
  config: ResolvedRelizyConfig
  dryRun: boolean
  bumpResult: BumpResultTruthy | undefined
  force: boolean
  suffix: string | undefined
}): Promise<PostedRelease[]> {
  const packages = filterPrivatePackagesUnlessIncluded(await getPackagesOrBumpedPackages({
    config,
    bumpResult,
    suffix,
    force,
    dryRun,
  }), getPrivatePackagesMode(config))

  logger.info(`Creating ${packages.length} ${provider.name} release(s)`)

  const postedReleases: PostedRelease[] = []

  for (const pkg of packages) {
    const posted = await postPackageRelease({ provider, pkg, config, dryRun })
    if (posted) {
      postedReleases.push(posted)
    }
  }

  if (postedReleases.length === 0) {
    logger.warn('No releases created')
  }
  else {
    logger.success(`Releases ${postedReleases.map(r => r.tag).join(', ')} published to ${provider.name}!`)
  }

  return postedReleases
}

async function postRootRelease({
  provider,
  config,
  dryRun,
  rootPackage,
  bumpResult,
}: {
  provider: ReleaseProvider
  config: ResolvedRelizyConfig
  dryRun: boolean
  rootPackage: RootPackage
  bumpResult: BumpResultTruthy | undefined
}): Promise<PostedRelease[]> {
  const newVersion = bumpResult?.newVersion || rootPackage.newVersion || rootPackage.version
  const to = formatRepoTag(config.templates.tagBody, newVersion)
  const from = config.from || rootPackage.fromTag || getFirstCommit(config.cwd)

  reportProgress(`Writing the notes of ${to}`)
  const notes = await generateChangelog({
    pkg: { ...rootPackage, fromTag: from },
    config,
    dryRun,
    newVersion,
    include: { title: false, compareLink: true, body: true, contributors: true },
    transformBody: isAIProviderReleaseEnabled(config)
      ? body => generateAIProviderReleaseBody({ config, rawBody: body, label: to, context: { project: config.projectName || rootPackage.name, version: newVersion, previousVersion: extractVersionFromTag(from) || bumpResult?.oldVersion }, dryRun })
      : undefined,
  })

  const release = { tag: to, notes, prerelease: isPrerelease(newVersion) }
  await postRelease({ provider, config, release, dryRun })

  logger.success(`Release ${to} published to ${provider.name}!`)

  return [{ name: to, tag: to, version: to, prerelease: release.prerelease }]
}

/**
 * Creates the releases of a provider: one per package in `independent` mode,
 * one for the root version otherwise
 */
export async function postProviderReleases(provider: ReleaseProvider, options: Partial<ProviderReleaseOptions> = {}): Promise<PostedRelease[]> {
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
          [provider.tokenKey]: options.token,
        },
      },
    })

    logger.debug(`${provider.name} token: ${config.tokens[provider.tokenKey] ? '✓ provided' : '✗ missing'}`)
    provider.check(config)

    const force = options.force ?? false

    if (config.monorepo?.versionMode === 'independent') {
      return await postIndependentReleases({ provider, config, dryRun, bumpResult: options.bumpResult, force, suffix: options.suffix })
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
      force,
      suffix: options.suffix,
      changelog: true,
      from,
      to,
      dryRun,
    })

    return await postRootRelease({ provider, config, dryRun, rootPackage, bumpResult: options.bumpResult })
  }
  catch (error) {
    logger.error(`Error publishing ${provider.name} release:`, error)
    throw error
  }
}
