import type { SocialAnnouncement, SocialAnnouncementContent, SocialAnnouncementVariables, SocialExclude, SocialLink } from '../types'
import type { ResolvedRelizyConfig } from './config'
import type { ReleaseLine } from './release-overview'
import micromatch from 'micromatch'
import { fillTemplate } from './release-overview'

/**
 * The announcements of the social platforms (`announcements` and `exclude` of
 * `social.teams`, `social.slack`, `exclude` of `social.twitter`): which
 * versions a platform announces, and the title, message and links of each one.
 */

/**
 * What decides the versions a platform announces
 */
export interface AnnouncementRules {
  announcements?: SocialAnnouncement[]
  exclude?: SocialExclude
}

/**
 * A version to announce
 */
export interface AnnouncementVersion {
  line: ReleaseLine
  /**
   * The name shown: the package name, the project name (or the title of the
   * group with version groups) for a `unified`/`selective` version
   */
  name: string
  /**
   * Directory of its `CHANGELOG.md`, relative to the root of the repository
   * (`''` for the root), undefined when it has none
   */
  changelogDir?: string
}

function matchesPackage(name: string, patterns: string[] | undefined): boolean {
  return Boolean(patterns?.length) && micromatch.isMatch(name, patterns!)
}

/**
 * Whether `exclude` leaves out a version: its group or its name
 */
export function isExcludedLine(line: ReleaseLine, exclude: SocialExclude | undefined): boolean {
  const groupName = line.group.name

  return Boolean(groupName && exclude?.groups?.includes(groupName)) || matchesPackage(line.name, exclude?.packages)
}

/** The fields of a content, without the undefined ones */
function pickContent({ title, message, changelogUrl, links }: SocialAnnouncementContent): SocialAnnouncementContent {
  return Object.fromEntries(Object.entries({ title, message, changelogUrl, links }).filter(([, value]) => value !== undefined))
}

/**
 * The content of the announcement of a version, undefined when the platform
 * does not announce it: every version without `announcements`, else the ones
 * matching an entry, the fields of a package entry over the ones of its group
 * entry, over `defaults`. `exclude` always applies.
 */
export function resolveAnnouncement(line: ReleaseLine, { announcements, exclude }: AnnouncementRules, defaults: SocialAnnouncementContent = {}): SocialAnnouncementContent | undefined {
  if (isExcludedLine(line, exclude)) {
    return undefined
  }

  const base = pickContent(defaults)

  if (!announcements) {
    return base
  }

  const groupName = line.group.name
  const groupEntry = groupName
    ? announcements.find(entry => entry.group === groupName)
    : undefined
  const packageEntry = announcements.find(entry => entry.package !== undefined && micromatch.isMatch(line.name, entry.package))

  if (!groupEntry && !packageEntry) {
    return undefined
  }

  return {
    ...base,
    ...(groupEntry && pickContent(groupEntry)),
    ...(packageEntry && pickContent(packageEntry)),
  }
}

/** `@scope/ui` gives `ui` */
function getShortName(name: string): string {
  return name.replace(/^@[^/]+\//, '')
}

/**
 * The URL of a file of the repository at a tag, undefined when the provider
 * is unknown
 */
function getRepoFileUrl(config: ResolvedRelizyConfig, tag: string, file: string): string | undefined {
  const repo = config.repo
  if (!repo?.domain || !repo?.repo) {
    return undefined
  }

  const encode = (value: string) => value.split('/').map(encodeURIComponent).join('/')
  const path = encode(file)
  const ref = encode(tag)

  switch (repo.provider || 'github') {
    case 'github':
      return `https://${repo.domain}/${repo.repo}/blob/${ref}/${path}`
    case 'gitlab':
      return `https://${repo.domain}/${repo.repo}/-/blob/${ref}/${path}`
    case 'bitbucket':
      return `https://${repo.domain}/${repo.repo}/src/${ref}/${path}`
    default:
      return undefined
  }
}

/**
 * The variables of an announcement. The changelog URL is the one of the
 * announcement, else `social.changelogUrl`, else the `CHANGELOG.md` of the
 * version at its tag.
 */
export function getAnnouncementVariables({ config, version, content, projectName, releaseUrl }: {
  config: ResolvedRelizyConfig
  version: AnnouncementVersion
  content: SocialAnnouncementContent
  projectName: string
  releaseUrl: string | undefined
}): SocialAnnouncementVariables {
  const variables: SocialAnnouncementVariables = {
    name: version.name,
    shortName: getShortName(version.name),
    newVersion: version.line.version,
    tag: version.line.tag,
    projectName,
    groupTitle: version.line.group.name ? version.line.group.title : '',
    releaseUrl: releaseUrl ?? '',
    changelogUrl: '',
  }

  const changelogFile = version.changelogDir === undefined
    ? undefined
    : [version.changelogDir, 'CHANGELOG.md'].filter(Boolean).join('/')
  const changelogUrl = content.changelogUrl === false
    ? ''
    : (content.changelogUrl && fillTemplate(content.changelogUrl, { ...variables }))
      || config.social?.changelogUrl
      || (changelogFile && getRepoFileUrl(config, version.line.tag, changelogFile))
      || ''

  return { ...variables, changelogUrl }
}

/**
 * A text of an announcement with its variables replaced, trimmed
 */
export function fillAnnouncementText(text: string, variables: SocialAnnouncementVariables): string {
  return fillTemplate(text, { ...variables }).trim()
}

/**
 * The links of an announcement: its release notes, its changelog, then its
 * `links`, with their variables replaced; the ones without URL are left out
 */
export function getAnnouncementLinks(content: SocialAnnouncementContent, variables: SocialAnnouncementVariables): SocialLink[] {
  return [
    { title: '📖 Release notes', url: variables.releaseUrl },
    { title: '📝 Changelog', url: variables.changelogUrl },
    ...(content.links ?? []),
  ]
    .map(link => ({
      title: fillAnnouncementText(link.title, variables),
      url: fillAnnouncementText(link.url, variables),
    }))
    .filter(link => link.title && link.url)
}
