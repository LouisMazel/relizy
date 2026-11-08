import type { ServerContext } from '../context'
import type { ReleasePlanArgs } from './release-plan'

import { z } from 'zod'
import { aggregateIndependentChangelogs, generateChangelog, readPackageJson } from '../../core'
import { codeList } from '../markdown'
import { formatNotes, withCapturedLogs } from '../runtime'
import { relativePath } from './project'
import { isBumped, planRelease, releasePlanSchema } from './release-plan'
import { defineTool, ToolInputError } from './types'

/** Above this size, the changelogs are cut: request a single package */
export const MAX_CHANGELOGS_CHARS = 60_000

type ChangelogConfig = Parameters<typeof generateChangelog>[0]['config']

type ChangelogPackage = Parameters<typeof generateChangelog>[0]['pkg'] & { newVersion: string }

interface ChangelogTarget {
  label: string
  file: string
  /**
   * Name of the package, the root package for the root changelog (also selected with `root`)
   */
  packageName: string
  generate: () => Promise<string>
}

export interface PreviewChangelogArgs extends ReleasePlanArgs {
  package?: string
  contributors?: boolean
}

export async function previewChangelog(context: ServerContext, args: PreviewChangelogArgs): Promise<string> {
  const { value, logs } = await withCapturedLogs(async () => {
    const plan = await planRelease(context, args)
    const targets: ChangelogTarget[] = []
    const generate = (pkg: ChangelogPackage, config: ChangelogConfig) => generateChangelog({
      pkg,
      config,
      dryRun: true,
      newVersion: pkg.newVersion,
      include: { contributors: args.contributors ?? false },
    })

    for (const { set, result } of plan.results) {
      if (!isBumped(result)) {
        continue
      }

      const packages: ChangelogPackage[] = result.bumpedPackages.flatMap(pkg => pkg.newVersion && pkg.path !== plan.config.cwd
        ? [
            { ...pkg, newVersion: pkg.newVersion },
          ]
        : [])

      // As `relizy changelog`: the root changelog of an independent release aggregates the changelogs of its packages
      if (set.config.changelog.rootChangelog) {
        if (set.versionMode !== 'independent' && result.rootPackage && result.newVersion) {
          const rootPackage = { ...result.rootPackage, newVersion: result.newVersion }
          targets.push({
            label: `root (${rootPackage.name})`,
            file: 'CHANGELOG.md',
            packageName: rootPackage.name,
            generate: () => generate(rootPackage, set.config),
          })
        }
        else if (set.versionMode === 'independent' && packages.length > 0) {
          const rootName = readPackageJson(plan.config.cwd)?.name ?? 'root'
          targets.push({
            label: `root (${rootName}, the changelogs of the packages)`,
            file: 'CHANGELOG.md',
            packageName: rootName,
            generate: async () => aggregateIndependentChangelogs(await Promise.all(packages.map(pkg => generate(pkg, set.config)))) ?? '',
          })
        }
      }

      for (const pkg of packages) {
        targets.push({
          label: pkg.name,
          file: `${relativePath(plan.config.cwd, pkg.path)}/CHANGELOG.md`,
          packageName: pkg.name,
          generate: () => generate(pkg, set.config),
        })
      }
    }

    const selected = args.package
      ? targets.filter(target => target.packageName === args.package || (args.package === 'root' && target.file === 'CHANGELOG.md'))
      : targets

    if (args.package && selected.length === 0) {
      const released = codeList(targets.map(target => target.packageName)) || 'nothing'
      const root = targets.some(target => target.file === 'CHANGELOG.md')
        ? ' (and `root`)'
        : ''

      throw new ToolInputError(`"${args.package}" is not released by this release. Released: ${released}${root}.`)
    }

    const changelogs: { target: ChangelogTarget, changelog: string }[] = []

    for (const target of selected) {
      changelogs.push({ target, changelog: await target.generate() })
    }

    return changelogs
  })

  if (value.length === 0) {
    return `# Changelog preview (relizy ${context.version})\n\nNothing to release, so no changelog: see \`preview_release\`.`
  }

  const lines = [`# Changelog preview (relizy ${context.version})`, '']
  let size = 0

  for (const { target, changelog } of value) {
    const section = [
      `## ${target.label} → \`${target.file}\``,
      '',
      changelog || '_Empty: no commit of this package appears in the changelog._',
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
