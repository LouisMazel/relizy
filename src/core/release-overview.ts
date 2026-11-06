import type { BumpResultTruthy, SocialTemplateVariables, VersionMode } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { formatRepoTag } from './format'
import { readPackageJson } from './repo'
import { getIndependentTag } from './tags'
import { extractVersionFromTag } from './version'

export interface ReleaseOverviewPackage {
  name: string
  /**
   * Version the release compares against: the version of the previous tag
   * (the last stable one for a graduation), else the version before the bump
   */
  oldVersion: string
  newVersion: string
  /**
   * Release tag of the package: its own tag in an `independent` group, the
   * repository tag otherwise
   */
  tag: string
  private: boolean
}

export interface ReleaseOverviewGroup {
  /**
   * Name of the version group, undefined without `monorepo.groups`
   */
  name?: string
  /**
   * Title of the version group, the project name without `monorepo.groups`
   */
  title: string
  versionMode: VersionMode
  /**
   * New version of a `unified`/`selective` group (the root version)
   */
  version?: string
  /**
   * Version a `unified`/`selective` group compares against
   */
  oldVersion?: string
  /**
   * Repository tag of a `unified`/`selective` group
   */
  tag?: string
  /**
   * Released packages, sorted by name
   */
  packages: ReleaseOverviewPackage[]
}

/**
 * What a release ships, by version group: the data the outputs presenting a
 * release (social posts, PR comment) are rendered from.
 */
export interface ReleaseOverview {
  projectName: string
  /**
   * The `unified`/`selective` group first, then the other groups in the order of the config
   */
  groups: ReleaseOverviewGroup[]
}

/**
 * A version line of a release: the version of a `unified`/`selective` group,
 * or a package of an `independent` group.
 */
export interface ReleaseLine {
  /**
   * The project name for a `unified`/`selective` group, the package name otherwise
   */
  name: string
  version: string
  tag: string
  group: ReleaseOverviewGroup
}

function getProjectName(config: ResolvedRelizyConfig): string {
  return config.projectName || readPackageJson(config.cwd)?.name || ''
}

function toOverviewPackage(pkg: BumpResultTruthy['bumpedPackages'][number], tag: string): ReleaseOverviewPackage {
  return {
    name: pkg.name,
    // The previous released version, so a graduation shows `6.15.0 → 6.16.0` rather than `6.16.0-beta.5 → 6.16.0`
    oldVersion: extractVersionFromTag(pkg.fromTag, pkg.name) || pkg.oldVersion,
    newVersion: pkg.newVersion || pkg.version,
    tag,
    private: pkg.private,
  }
}

function toOverviewGroup({
  config,
  result,
  name,
  title,
  versionMode,
}: {
  config: ResolvedRelizyConfig
  result: Omit<BumpResultTruthy, 'groups'>
  name?: string
  title: string
  versionMode: VersionMode
}): ReleaseOverviewGroup {
  const packages = result.bumpedPackages.toSorted((a, b) => a.name.localeCompare(b.name))

  if (versionMode === 'independent') {
    return {
      name,
      title,
      versionMode,
      packages: packages
        .filter(pkg => pkg.newVersion)
        .map(pkg => toOverviewPackage(pkg, getIndependentTag({ name: pkg.name, version: pkg.newVersion! }))),
    }
  }

  const version = result.newVersion || readPackageJson(config.cwd)?.version || ''
  const tag = formatRepoTag(config.templates.tagBody, version)

  return {
    name,
    title,
    versionMode,
    version,
    oldVersion: extractVersionFromTag(result.fromTag ?? '') || result.oldVersion,
    tag,
    packages: packages.map(pkg => toOverviewPackage(pkg, tag)),
  }
}

/**
 * Build the overview of a release from its bump result: one group per version
 * group that bumped, or a single group for the config without `monorepo.groups`.
 */
export function getReleaseOverview({ config, bumpResult }: {
  config: ResolvedRelizyConfig
  bumpResult: BumpResultTruthy
}): ReleaseOverview {
  const projectName = getProjectName(config)

  if (!bumpResult.groups) {
    return {
      projectName,
      groups: [toOverviewGroup({ config, result: bumpResult, title: projectName, versionMode: config.monorepo?.versionMode ?? 'unified' })],
    }
  }

  // The unified/selective group owns the root version: it comes first
  const groups = bumpResult.groups.toSorted((a, b) => Number(a.versionMode === 'independent') - Number(b.versionMode === 'independent'))

  return {
    projectName,
    groups: groups.map(group => toOverviewGroup({ config, result: group, name: group.name, title: group.title, versionMode: group.versionMode })),
  }
}

/**
 * The overview without the private packages (never published): an
 * `independent` group without public package is left out.
 */
export function withoutPrivatePackages(overview: ReleaseOverview): ReleaseOverview {
  return {
    ...overview,
    groups: overview.groups
      .map(group => ({ ...group, packages: group.packages.filter(pkg => !pkg.private) }))
      .filter(group => group.versionMode !== 'independent' || group.packages.length > 0),
  }
}

/**
 * The version lines of a release, in the order of its groups
 */
export function getReleaseLines(overview: ReleaseOverview): ReleaseLine[] {
  return overview.groups.flatMap((group): ReleaseLine[] => {
    if (group.versionMode === 'independent') {
      return group.packages.map(pkg => ({ name: pkg.name, version: pkg.newVersion, tag: pkg.tag, group }))
    }

    return group.version ? [{ name: overview.projectName, version: group.version, tag: group.tag!, group }] : []
  })
}

/**
 * `<name> <version> is out!` when a single version line is released,
 * `New releases of <project>` otherwise.
 */
export function getReleaseTitle(overview: ReleaseOverview): string {
  const lines = getReleaseLines(overview)

  return lines.length === 1
    ? `${lines[0]!.name} ${lines[0]!.version} is out!`
    : `New releases of ${overview.projectName}`
}

/**
 * Variables of the social templates (`templates.twitterMessage`,
 * `templates.slackMessage`) describing the release.
 */
export function getSocialTemplateVariables({ overview, releaseUrl, changelogUrl }: {
  overview: ReleaseOverview
  releaseUrl?: string
  changelogUrl?: string
}): SocialTemplateVariables {
  const lines = getReleaseLines(overview)
  const packages = overview.groups.flatMap(group => group.packages)

  return {
    projectName: overview.projectName,
    releaseTitle: getReleaseTitle(overview),
    newVersion: lines.length === 1 ? lines[0]!.version : '',
    packageList: packages.map(pkg => `${pkg.name}@${pkg.newVersion}`).join(', '),
    packageCount: String(packages.length),
    releaseUrl,
    changelogUrl,
  }
}

/**
 * Replace every `{{variable}}` of a template. An undefined variable is
 * replaced with an empty string, an unknown one is left as is.
 */
export function fillTemplate(template: string, variables: Record<string, string | undefined>): string {
  return Object.entries(variables).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, value ?? ''),
    template,
  )
}

/**
 * Fill a social template (`templates.twitterMessage`, `templates.slackMessage`):
 * the URLs not set are removed.
 */
export function fillSocialTemplate(template: string, variables: SocialTemplateVariables, extraVariables: Record<string, string | undefined> = {}): string {
  return fillTemplate(template, { releaseUrl: undefined, changelogUrl: undefined, ...variables, ...extraVariables })
}

/**
 * Tag of the release linked by the posts: the tag of its only version line,
 * else the repository tag of its `unified`/`selective` group.
 */
export function getReleaseTag(overview: ReleaseOverview): string | undefined {
  const lines = getReleaseLines(overview)

  if (lines.length === 1) {
    return lines[0]!.tag
  }

  return overview.groups.find(group => group.versionMode !== 'independent' && group.version)?.tag
}

/**
 * The overview restricted to the version lines to keep (e.g. the stable ones):
 * a `unified`/`selective` group is left out when its line is, an `independent`
 * group keeps the packages of the kept lines.
 */
export function keepReleaseLines(overview: ReleaseOverview, keep: (line: ReleaseLine) => boolean): ReleaseOverview {
  const keptLines = getReleaseLines(overview).filter(keep)

  return {
    ...overview,
    groups: overview.groups.flatMap((group) => {
      const groupLines = keptLines.filter(line => line.group === group)

      if (group.versionMode !== 'independent') {
        return groupLines.length > 0 ? [group] : []
      }

      const packages = group.packages.filter(pkg => groupLines.some(line => line.name === pkg.name))

      return packages.length > 0 ? [{ ...group, packages }] : []
    }),
  }
}
