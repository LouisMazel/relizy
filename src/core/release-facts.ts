import type { BumpResultTruthy, GitCommit, PackageBase, PostedRelease } from '../types'
import type { ResolvedRelizyConfig } from './config'
import type { AIRewrite, ReleaseLink } from './progress'
import type { ReleaseAI, ReleaseContent, ReleaseGit, ReleasePublish, ReleaseStepReport } from './release-report'
import { execSync } from 'node:child_process'
import { getCurrentGitBranch, getGitUpstream } from './git'
import { collectContributorNames } from './markdown'
import { detectPackageManager, getPublishTag, resolveRegistryTargetsForPackages } from './npm'
import { getReleaseUrl } from './social'

/**
 * What the release brings, for its summary and its report: content, git,
 * publication, AI and links
 */

const NPM_REGISTRY_HOST = 'registry.npmjs.org'
/** Above, the install command would be too long to be useful */
const INSTALL_MAX_PACKAGES = 3

/**
 * The commits of the release (each counted once), by kind, and their contributors
 */
export function getReleaseContent({ bumpResult, config }: { bumpResult: BumpResultTruthy, config: ResolvedRelizyConfig }): ReleaseContent {
  const commits = new Map<string, GitCommit>()
  const sources = [bumpResult.rootPackage, ...(bumpResult.groups ?? []).map(group => group.rootPackage), ...bumpResult.bumpedPackages]

  for (const source of sources) {
    for (const commit of source?.commits ?? []) {
      commits.set(commit.shortHash, commit)
    }
  }

  const list = [...commits.values()]

  return {
    commits: list.length,
    features: list.filter(commit => commit.type === 'feat').length,
    fixes: list.filter(commit => commit.type === 'fix').length,
    breaking: list.filter(commit => commit.isBreaking).length,
    contributors: collectContributorNames({ commits: list, config }).length,
  }
}

/**
 * The branch, the release commit (once created) and the remote it is pushed to
 */
export async function getReleaseGit({ config, committed, dryRun }: { config: ResolvedRelizyConfig, committed: boolean, dryRun: boolean }): Promise<ReleaseGit | undefined> {
  try {
    const branch = getCurrentGitBranch(config.cwd)
    const commit = committed && !dryRun
      ? execSync('git rev-parse --short HEAD', { cwd: config.cwd, encoding: 'utf8' }).trim()
      : undefined
    const upstream = await getGitUpstream(config.cwd)

    return { branch, ...(commit ? { commit } : {}), ...(upstream ? { remote: upstream.name } : {}) }
  }
  catch {
    return undefined
  }
}

function getRegistryHost(registry: string | undefined): string {
  if (!registry) {
    return NPM_REGISTRY_HOST
  }

  try {
    return new URL(registry).host
  }
  catch {
    return registry
  }
}

function getVersion(pkg: PackageBase): string {
  return pkg.newVersion || pkg.version
}

/**
 * The dist-tags, the registries and the install command of the published packages
 */
export function getReleasePublish({ config, packages }: { config: ResolvedRelizyConfig, packages: PackageBase[] }): ReleasePublish | undefined {
  if (packages.length === 0) {
    return undefined
  }

  const targets = resolveRegistryTargetsForPackages(packages, config)
  const tags = new Set(packages.map(pkg => getPublishTag(getVersion(pkg), config.publish.tag)))
  const registries = new Set(targets.map(target => getRegistryHost(target.registry)))

  let install: string | undefined
  if (packages.length <= INSTALL_MAX_PACKAGES) {
    const packageManager = config.publish.packageManager ?? detectPackageManager(config.cwd)
    const command = packageManager === 'npm' ? 'npm install' : `${packageManager} add`
    const versions = packages.map(pkg => `${pkg.name}@${getVersion(pkg)}`)
    install = `${command} ${versions.join(' ')}`
  }

  return { tags: [...tags], registries: [...registries], ...(install ? { install } : {}) }
}

/**
 * The npm pages of the published versions, on the npm registry only
 */
export function getNpmLinks({ config, packages }: { config: ResolvedRelizyConfig, packages: PackageBase[] }): ReleaseLink[] {
  return packages
    .filter(pkg => pkg.name && getVersion(pkg))
    .filter(pkg => resolveRegistryTargetsForPackages([pkg], config).some(target => getRegistryHost(target.registry) === NPM_REGISTRY_HOST))
    .map(pkg => ({
      step: 'publish',
      label: `${pkg.name}@${getVersion(pkg)}`,
      url: `https://www.npmjs.com/package/${pkg.name}/v/${getVersion(pkg)}`,
    }))
}

export function getProviderReleaseLinks({ config, postedReleases }: { config: ResolvedRelizyConfig, postedReleases: PostedRelease[] }): ReleaseLink[] {
  return postedReleases.flatMap((release) => {
    const url = getReleaseUrl(config, release.tag)
    return url ? [{ step: 'providerRelease' as const, label: release.tag, url }] : []
  })
}

/**
 * The AI rewrites of the release, together
 */
export function getReleaseAI(rewrites: AIRewrite[]): ReleaseAI | undefined {
  if (rewrites.length === 0) {
    return undefined
  }

  // The sum of the calls giving the value, none when no call gives it
  const sum = (key: 'inputTokens' | 'outputTokens' | 'costUsd') => {
    const values = rewrites.map(rewrite => rewrite[key]).filter(value => value !== undefined)
    return values.length > 0 ? { [key]: values.reduce((total, value) => total + value, 0) } : {}
  }

  return {
    provider: rewrites[0]!.provider,
    rewrites: rewrites.length,
    simulated: rewrites.every(rewrite => rewrite.simulated),
    durationMs: rewrites.reduce((total, rewrite) => total + (rewrite.durationMs ?? 0), 0),
    ...sum('inputTokens'),
    ...sum('outputTokens'),
    ...sum('costUsd'),
  }
}

/**
 * Give each step the links of what it created
 */
export function attachStepLinks(steps: ReleaseStepReport[], links: ReleaseLink[]): void {
  for (const step of steps) {
    const stepLinks = links.filter(link => link.step === step.name).map(({ label, url }) => ({ label, url }))

    if (stepLinks.length > 0) {
      step.links = stepLinks
    }
  }
}
