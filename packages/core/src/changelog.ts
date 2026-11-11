import type { ChangelogAuthorsOptions, ChangelogBodyOptions } from './markdown'
import type { CoreLogger, GitCommit } from './types'
import { formatRepoTag } from './format'
import { getCurrentGitRef, getFirstCommit } from './git-refs'
import { buildChangelogBody, buildCompareLink, buildContributors } from './markdown'
import { getNewPackageCompareBase } from './package-commits'
import { getIndependentTag, NEW_PACKAGE_MARKER } from './tags'

/**
 * The refs a changelog is read from and shown with, see `resolveChangelogRange()`
 */
export interface ChangelogRange {
  /** Ref `git log` starts from */
  gitFromRef: string
  /** Ref `git log` ends at */
  gitToRef: string
  /** Name of the previous release shown in the title and the compare link */
  displayFromTag: string
  /** Name of the release shown in the title and the compare link */
  displayToTag: string
  /** Where the compare link starts from, null when no link can be built */
  compareFromRef: string | null
  /** The range starts at the first commit of the repository */
  isFirstCommit: boolean
}

/**
 * Resolves the two flavours of refs a changelog needs:
 *
 * - `gitFromRef` / `gitToRef` are the refs passed to `git log`. The release tag
 *   is created after the changelog, so `gitToRef` is the current ref of the
 *   repository unless `to` is given (to render an old changelog between two
 *   existing tags).
 * - `displayFromTag` / `displayToTag` are the names shown in the title and the
 *   compare link. `displayToTag` is the tag of the release about to be made
 *   (`v1.5.0`), unless `to` is given.
 * - `compareFromRef` is where the compare link starts from: `displayFromTag`,
 *   except for a new package, where it is the commit preceding its first commit.
 *
 * For a first release (no previous tag, or a new package) `displayFromTag` is
 * `0.0.0` as a tag (`v0.0.0`, or `name@0.0.0` when independent), so the title
 * stays meaningful and the internal marker never shows.
 *
 * Runs `git` synchronously (current ref, first commit) and writes nothing.
 *
 * @param options - The package, the repository and the version of the release
 * @param options.pkg - The package
 * @param options.pkg.name - Name of the package
 * @param options.pkg.path - Directory of the package
 * @param options.pkg.fromTag - Where its commits start (a tag or a commit), when it has one
 * @param options.cwd - Directory of the repository
 * @param options.newVersion - Version of the release
 * @param options.tagBody - Template of the repository tags (`v{{newVersion}}`)
 * @param options.independent - The package is tagged on its own (`name@version`) instead of with the repository tag
 * @param options.from - Ref to start from, instead of the tag of the package or the first commit
 * @param options.to - Ref to end at, instead of the release about to be made
 * @param options.movedPackages - Packages moved from a directory to another, `old path: new path`, only used to find the compare base of a new package
 * @param options.logger - Where the details are reported
 * @returns The refs to read and the names to show
 * @throws When the tag to display cannot be named (`No tag found for <name>`)
 *
 * @example
 * ```ts
 * resolveChangelogRange({ pkg: { name: 'a', path: '/repo/a', fromTag: 'v1.0.0' }, cwd: '/repo', newVersion: '1.1.0', tagBody: 'v{{newVersion}}' })
 * // { gitFromRef: 'v1.0.0', gitToRef: 'HEAD', displayFromTag: 'v1.0.0', displayToTag: 'v1.1.0', compareFromRef: 'v1.0.0', isFirstCommit: false }
 * ```
 */
export function resolveChangelogRange({ pkg, cwd, newVersion, tagBody, independent, from, to, movedPackages, logger }: {
  pkg: { name: string, path: string, fromTag?: string }
  cwd: string
  newVersion: string
  tagBody: string
  independent?: boolean
  from?: string
  to?: string
  movedPackages?: Record<string, string>
  logger?: CoreLogger
}): ChangelogRange {
  const gitFromRef = from
    || pkg.fromTag
    || getFirstCommit(cwd)

  const isNewPackage = gitFromRef === NEW_PACKAGE_MARKER
  const isFirstCommit = !isNewPackage && gitFromRef === getFirstCommit(cwd)

  const displayFromTag = isFirstCommit || isNewPackage
    ? (independent
        ? getIndependentTag({ version: '0.0.0', name: pkg.name })
        : formatRepoTag(tagBody, '0.0.0'))
    : gitFromRef

  // The marker is not a git ref: point the compare link at a real commit.
  const compareFromRef = isNewPackage
    ? getNewPackageCompareBase(pkg.path, cwd, movedPackages, logger)
    : displayFromTag

  // The release tag does not exist yet at changelog time (it is created in
  // the commit & tag step). Use the current git ref for `git log` so the
  // diff resolves, while displaying the future templated tag in the title.
  const gitToRef = to || getCurrentGitRef(cwd)

  const displayToTag = to
    || (independent
      ? getIndependentTag({ version: newVersion, name: pkg.name })
      : formatRepoTag(tagBody, newVersion))

  if (!displayToTag) {
    throw new Error(`No tag found for ${pkg.name}`)
  }

  return {
    gitFromRef,
    gitToRef,
    displayFromTag,
    displayToTag,
    compareFromRef,
    isFirstCommit,
  }
}

/**
 * The root changelog of an `independent` release: the changelogs of its
 * packages under a dated title.
 *
 * @param changelogs - The changelog of each package, the empty ones are left out
 * @param date - Date of the title (now by default)
 * @returns The markdown, undefined when no package has an entry
 *
 * @example
 * ```ts
 * aggregateIndependentChangelogs(['## pkg-a v1.1.0', '## pkg-b v2.0.1'])
 * // '**Multiple Packages Updated** - 2026-11-06\n\n## pkg-a v1.1.0\n\n## pkg-b v2.0.1'
 * ```
 */
export function aggregateIndependentChangelogs(changelogs: string[], date = new Date()): string | undefined {
  const entries = changelogs.filter(Boolean)

  if (entries.length === 0) {
    return undefined
  }

  return `**Multiple Packages Updated** - ${date.toISOString().split('T')[0]}\n\n${entries.join('\n\n')}`
}

/**
 * Which sections of a rendered changelog are produced, each `true` by default
 */
export interface ChangelogInclude {
  /** The `## ` title */
  title?: boolean
  /** The compare link, also left out by `minify` */
  compareLink?: boolean
  /** The sections of the commits */
  body?: boolean
  /** The contributors, also left out by `minify` */
  contributors?: boolean
}

/**
 * What `renderChangelog()` renders a release from
 */
export interface RenderChangelogOptions extends ChangelogBodyOptions, ChangelogAuthorsOptions {
  /** The conventional commits, see `parseCommits()` */
  commits: GitCommit[]
  /** Name of the previous release, shown in the title */
  from: string
  /** Name of the release, shown in the title and the compare link */
  to: string
  /** Where the compare link starts from, `from` by default; `null` for no link */
  compareFrom?: string | null
  /** `from` is the first commit of the repository */
  isFirstCommit: boolean
  /** Directory of the repository, where the first commit is read */
  cwd: string
  /** Do not show the emails of the contributors */
  hideAuthorEmail?: boolean
  /** Template of the title: `{{oldVersion}}` (`from`), `{{newVersion}}` (`to`) and `{{date}}` (today, UTC, `YYYY-MM-DD`) are replaced (`{{oldVersion}}...{{newVersion}}` by default) */
  titleTemplate?: string
  /** The sections to produce, all by default */
  include?: ChangelogInclude
  /** Short changelog: no compare link, contributors, references nor commit body */
  minify?: boolean
  /** Called with the sections of the commits before the assembly, e.g. to rewrite them */
  transformBody?: (body: string) => Promise<string> | string
  /** Called before the lookups of the contributors on GitHub, which can take a while */
  onProgress?: (message: string) => void
}

function renderTitle({ from, to, titleTemplate }: RenderChangelogOptions): string {
  const title = (titleTemplate || '{{oldVersion}}...{{newVersion}}')
    .replaceAll('{{oldVersion}}', from)
    .replaceAll('{{newVersion}}', to)
    .replaceAll('{{date}}', new Date().toISOString().split('T')[0] as string)

  return `## ${title}`
}

function renderBody({ commits, types, repo, includeCommitBody, minify, transformBody }: RenderChangelogOptions): Promise<string> | string {
  const body = buildChangelogBody({
    commits,
    types,
    repo,
    includeCommitBody,
    minify,
  })

  return transformBody && body
    ? transformBody(body)
    : body
}

/**
 * The changelog of a release as markdown: its title, the compare link, the
 * sections of the commits and the contributors, separated by a blank line.
 * Empty sections are left out. On a GitHub repository the contributors section
 * queries `https://ungh.cc` over the network (failed lookups are ignored); the
 * other sections only read git for the first commit of the compare link.
 *
 * @param options - The commits, the range and how the changelog looks, see `RenderChangelogOptions`
 * @returns The markdown, trimmed, an empty string when every section is empty
 *
 * @example
 * ```ts
 * await renderChangelog({ commits, from: 'v1.0.0', to: 'v1.1.0', isFirstCommit: false, cwd, types, repo })
 * // '## v1.0.0...v1.1.0\n\n[compare changes](...)\n\n### Features\n\n- ...'
 * ```
 */
export async function renderChangelog(options: RenderChangelogOptions): Promise<string> {
  const { commits, to, compareFrom = options.from, isFirstCommit, cwd, repo, noAuthors, excludeAuthors, hideAuthorEmail, include, minify, onProgress } = options

  const title = include?.title ?? true
    ? renderTitle(options)
    : ''
  const compareLink = (include?.compareLink ?? true) && !minify && compareFrom
    ? buildCompareLink({
        repo,
        cwd,
        from: compareFrom,
        to,
        isFirstCommit,
      })
    : ''
  const body = include?.body ?? true
    ? await renderBody(options)
    : ''
  const contributors = (include?.contributors ?? true) && !minify
    ? await buildContributors({
        commits,
        repo,
        noAuthors,
        excludeAuthors,
        hideAuthorEmail,
        onProgress,
      })
    : ''

  return [title, compareLink, body, contributors].filter(Boolean).join('\n\n').trim()
}
