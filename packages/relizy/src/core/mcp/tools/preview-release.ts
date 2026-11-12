import type { BumpResult } from '../../../types'
import type { ServerContext } from '../context'
import type { PackageSet } from './project'
import type { ReleasePlan, ReleasePlanArgs } from './release-plan'

import { z } from 'zod'
import { getReleaseTagNames } from '../..'
import { code, codeList, tableCell } from '../markdown'
import { formatNotes, withCapturedLogs } from '../runtime'
import { relativePath } from './project'
import { explainBump, formatCommits, isBumped, planRelease, releasePlanSchema } from './release-plan'
import { defineTool } from './types'

/** Below the 80,000 characters the server announces for a result, with room for the notes */
const MAX_PREVIEW_LENGTH = 75_000

/** The steps of `relizy release` after the bump, in its order: it publishes before the release commit */
const RELEASE_STEPS: [string, string][] = [
  ['changelog', 'write the changelogs'],
  ['publish', 'publish to npm'],
  ['commit', 'commit'],
  ['gitTag', 'tag'],
  ['push', 'push'],
  ['providerRelease', 'create the GitHub/GitLab releases'],
  ['social', 'post on the social networks'],
  ['prComment', 'comment the pull request'],
]

/** The tags and the push need the release commit */
const COMMIT_STEPS = new Set(['gitTag', 'push'])

/** Steps of `relizy release` after the bump, as configured */
function releaseSteps(release: object): string {
  const enabled = (key: string) => (release as Record<string, unknown>)[key] !== false

  return RELEASE_STEPS
    .filter(([key]) => enabled(key) && (!COMMIT_STEPS.has(key) || enabled('commit')))
    .map(([, label]) => label)
    .join(', ')
}

function describeSet({ set, result }: { set: PackageSet, result: BumpResult }, plan: ReleasePlan, full: boolean): string[] {
  const title = set.group
    ? `## Group ${code(set.group.name)} (${set.versionMode})`
    : `## ${set.versionMode} mode`

  if (!isBumped(result)) {
    const since = set.versionMode === 'independent'
      ? 'the last tag of each package'
      : (plan.config.from && code(plan.config.from)) || 'the last release tag'

    return [title, '', `Nothing to release: none of the commits since ${since} triggers a bump (see the \`types\` of the config), and no dependency was bumped.`]
  }

  const lines = [title, '']
  const commits = result.rootPackage?.commits ?? []

  if (result.newVersion && result.rootPackage) {
    lines.push(`**Version:** ${result.oldVersion ?? result.rootPackage.version} → ${result.newVersion} (commits since ${code(result.fromTag ?? 'the first commit')})`, '')

    if (commits.length > 0) {
      lines.push(`Commits: ${formatCommits(commits, full ? undefined : 10)}`, '')
    }
  }

  if (set.packages.length > 1 || set.versionMode === 'independent' || set.group) {
    lines.push(
      '| Package | Version | Why |',
      '| --- | --- | --- |',
      ...result.bumpedPackages.map(pkg => `| ${code(pkg.name)} (${code(relativePath(plan.config.cwd, pkg.path))}) | ${pkg.oldVersion} → ${pkg.newVersion} | ${tableCell(explainBump(pkg, { set, plan, full }))} |`),
      '',
    )
  }

  const bumped = new Set(result.bumpedPackages.map(pkg => pkg.name))
  const unchanged = set.packages.filter(pkg => !bumped.has(pkg.name)).map(pkg => pkg.name)

  if (unchanged.length > 0 && set.versionMode !== 'unified') {
    lines.push(`Not released (no relevant commit nor bumped dependency): ${codeList(unchanged)}`, '')
  }

  return lines
}

function describeNextSteps(plan: ReleasePlan): string[] {
  const { result } = plan.planned

  if (!isBumped(result)) {
    return ['No package would be released. `relizy release` would stop here: add commits whose type bumps (`feat`, `fix`...), or force a type (`type: "patch"` with `force: true`).']
  }

  const tags = getReleaseTagNames({
    config: plan.config,
    bumpedPackages: result.bumpedPackages,
    newVersion: result.newVersion,
    groups: result.groups,
  })

  return [
    `**Tags:** ${tags.length > 0
      ? codeList(tags)
      : 'none (`release.gitTag` is off)'}`,
    '',
    `\`relizy release\` would then ${releaseSteps(plan.config.release)}.`,
    '',
    'Next: `preview_changelog` with the same arguments for the changelogs. To release, ask the user first: `relizy release --dry-run` shows every step, then `relizy release` (usually run by the CI).',
  ]
}

/** Lines without the trailing blank ones */
function trimEnd(lines: string[]): string[] {
  const end = lines.findLastIndex(line => line !== '')

  return lines.slice(0, end + 1)
}

/** The preview within the size of a result, cut with a note */
export function fitPreview(text: string): string {
  if (text.length <= MAX_PREVIEW_LENGTH) {
    return text
  }

  return `${text.slice(0, MAX_PREVIEW_LENGTH)}\n\n_The preview is cut at ${MAX_PREVIEW_LENGTH} characters: preview fewer version groups (\`groups\`), or read the commits of a package with \`preview_changelog({ package })\`._`
}

export async function previewRelease(context: ServerContext, { full = false, ...args }: ReleasePlanArgs & { full?: boolean }): Promise<string> {
  const { value: plan, logs } = await withCapturedLogs(() => planRelease(context, args))
  const lines = [
    `# Release preview (relizy ${context.version})`,
    '',
    ...plan.results.flatMap(entry => [
      ...trimEnd(describeSet(entry, plan, full)),
      '',
    ]),
    ...describeNextSteps(plan),
  ]
  const notes = formatNotes(logs)

  return fitPreview(notes
    ? `${lines.join('\n')}\n\n${notes}`
    : lines.join('\n'))
}

export const previewReleaseTool = defineTool({
  name: 'preview_release',
  title: 'Preview the next release',
  description: 'Compute what `relizy release` (or `relizy bump`) would do now, without writing anything: the version of each package and of each version group, why each package is released (its commits, a bumped dependency, a peer dependency whose published range rejects the new version, a package of another group, a graduation), the packages not released, and the git tags. Call it before a release and to answer "what will be released?". Read-only: no hook, no prompt, no network unless `fetchTags`.',
  inputSchema: {
    ...releasePlanSchema,
    full: z.boolean().optional().describe('List every commit explaining a bump. Default: the first 10 commits of a version, the first 5 of a package'),
  },
  openWorld: true,
  run: previewRelease,
})
