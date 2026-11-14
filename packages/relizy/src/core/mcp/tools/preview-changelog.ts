import type { ServerContext } from '../context'
import type { ReleasePlanArgs } from './release-plan'

import { z } from 'zod'
import { previewChangelog as previewNextChangelog, UnreleasedPackageError } from '../../release-preview'
import { codeList } from '../markdown'
import { formatNotes, withCapturedLogs } from '../runtime'
import { releasePlanSchema, toPreviewOptions, toToolError } from './release-plan'
import { defineTool, ToolInputError } from './types'

/** Above this size, the changelogs are cut: request a single package */
export const MAX_CHANGELOGS_CHARS = 60_000

export interface PreviewChangelogArgs extends ReleasePlanArgs {
  package?: string
  contributors?: boolean
}

export async function previewChangelog(context: ServerContext, args: PreviewChangelogArgs): Promise<string> {
  const { value, logs } = await withCapturedLogs(() => previewNextChangelog({
    ...toPreviewOptions(context, args),
    package: args.package,
    contributors: args.contributors ?? false,
  }).catch((error: unknown) => {
    if (error instanceof UnreleasedPackageError) {
      const released = codeList(error.released) || 'nothing'
      const root = error.root
        ? ' (and `root`)'
        : ''

      throw new ToolInputError(`"${error.packageName}" is not released by this release. Released: ${released}${root}.`)
    }

    throw toToolError(error)
  }))

  if (value.length === 0) {
    return `# Changelog preview (relizy ${context.version})\n\nNothing to release, so no changelog: see \`preview_release\`.`
  }

  const lines = [`# Changelog preview (relizy ${context.version})`, '']
  let size = 0

  for (const changelog of value) {
    const section = [
      `## ${changelog.label} → \`${changelog.file}\``,
      '',
      changelog.content || '_Empty: no commit of this package appears in the changelog._',
      '',
    ].join('\n')

    if (size + section.length > MAX_CHANGELOGS_CHARS) {
      lines.push(`The other changelogs are cut (${value.length} in total): request them one by one with \`package\`.`)
      break
    }

    size += section.length
    lines.push(section)
  }

  lines.push('These entries are added at the top of each file by the release. The `generate:changelog` hook does not run here.')

  const notes = formatNotes(logs)

  return notes
    ? `${lines.join('\n')}\n\n${notes}`
    : lines.join('\n')
}

export const previewChangelogTool = defineTool({
  name: 'preview_changelog',
  title: 'Preview the changelogs of the next release',
  description: 'Generate the changelog entries the next release would write (root CHANGELOG.md and the CHANGELOG.md of each released package), without writing anything. Same arguments as `preview_release`, plus `package` for a single package ("root" for the root changelog). Contributors are left out unless `contributors: true` (it may query the GitHub API).',
  inputSchema: {
    ...releasePlanSchema,
    package: z.string().optional().describe('Only the changelog of this package name, or "root"'),
    contributors: z.boolean().optional().describe('Include the contributors section (may reach the network). Default: false'),
  },
  openWorld: true,
  run: previewChangelog,
})
