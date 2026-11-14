import type { PreviewSet, ReleasePreview } from '../../release-preview'
import type { ServerContext } from '../context'
import type { ReleasePlanArgs } from './release-plan'

import { z } from 'zod'
import { previewRelease as previewNextRelease } from '../../release-preview'
import { code, codeList, tableCell } from '../markdown'
import { formatNotes, withCapturedLogs } from '../runtime'
import { explainBump, formatCommits, releasePlanSchema, toPreviewOptions, toToolError } from './release-plan'
import { defineTool } from './types'

/** Below the 80,000 characters the server announces for a result, with room for the notes */
const MAX_PREVIEW_LENGTH = 75_000

/** What each step of `relizy release` after the bump does, in its order: it publishes before the release commit */
const STEP_TEXTS: Partial<Record<ReleasePreview['steps'][number]['name'], string>> = {
  'changelog': 'write the changelogs',
  'publish': 'publish to npm',
  'commit-and-tag': 'commit',
  'push': 'push',
  'provider-release': 'create the GitHub/GitLab releases',
  'social': 'post on the social networks',
  'pr-comment': 'comment the pull request',
}

/** Steps of `relizy release` after the bump, as configured */
function releaseSteps(preview: ReleasePreview): string {
  return preview.steps
    .filter(step => step.enabled && STEP_TEXTS[step.name])
    .map(step => step.name === 'commit-and-tag' && preview.tags.length > 0
      ? 'commit, tag'
      : STEP_TEXTS[step.name])
    .join(', ')
}

function describeSet(set: PreviewSet, { full, from }: { full: boolean, from?: string }): string[] {
  const title = set.group
    ? `## Group ${code(set.group)} (${set.versionMode})`
    : `## ${set.versionMode} mode`

  if (!set.released) {
    const since = set.versionMode === 'independent'
      ? 'the last tag of each package'
      : (from && code(from)) || 'the last release tag'

    return [title, '', `Nothing to release: none of the commits since ${since} triggers a bump (see the \`types\` of the config), and no dependency was bumped.`]
  }

  const lines = [title, '']

  if (set.newVersion) {
    lines.push(`**Version:** ${set.oldVersion} → ${set.newVersion} (commits since ${code(set.fromTag ?? 'the first commit')})`, '')

    if (set.commits.length > 0) {
      lines.push(`Commits: ${formatCommits(set.commits, full ? undefined : 10)}`, '')
    }
  }

  if (set.packages.length + set.notReleased.length > 1 || set.versionMode === 'independent' || set.group) {
    lines.push(
      '| Package | Version | Why |',
      '| --- | --- | --- |',
      ...set.packages.map(pkg => `| ${code(pkg.name)} (${code(pkg.path)}) | ${pkg.oldVersion} → ${pkg.newVersion} | ${tableCell(explainBump(pkg, { set, full }))} |`),
      '',
    )
  }

  if (set.notReleased.length > 0) {
    lines.push(`Not released (no relevant commit nor bumped dependency): ${codeList(set.notReleased)}`, '')
  }

  return lines
}

function describeNextSteps(preview: ReleasePreview): string[] {
  if (!preview.released) {
    return ['No package would be released. `relizy release` would stop here: add commits whose type bumps (`feat`, `fix`...), or force a type (`type: "patch"` with `force: true`).']
  }

  return [
    `**Tags:** ${preview.tags.length > 0
      ? codeList(preview.tags)
      : 'none (`release.gitTag` is off)'}`,
    '',
    `\`relizy release\` would then ${releaseSteps(preview)}.`,
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
  const { value: preview, logs } = await withCapturedLogs(() => previewNextRelease(toPreviewOptions(context, args)).catch((error: unknown) => {
    throw toToolError(error)
  }))
  const lines = [
    `# Release preview (relizy ${context.version})`,
    '',
    ...preview.sets.flatMap(set => [
      ...trimEnd(describeSet(set, { full, from: args.from })),
      '',
    ]),
    ...describeNextSteps(preview),
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
