import type { MigrationFinding, MigrationReport } from '../../migration'
import type { ServerContext } from '../context'
import { checkMigration as checkProjectMigration, MIGRATION_GUIDE_ID } from '../../migration'
import { code } from '../markdown'
import { assertConfigName } from '../runtime'
import { configArgSchema } from './project'
import { defineTool } from './types'

function renderLocations(locations: string[] = []): string {
  if (locations.length === 0) {
    return ''
  }

  const more = locations.length > 10
    ? `, and ${locations.length - 10} more`
    : ''

  return ` (${locations.slice(0, 10).map(location => code(location)).join(', ')}${more})`
}

function renderFinding(finding: MigrationFinding): string[] {
  const locations = renderLocations(finding.locations)

  return [`- **${finding.title}**${locations}: ${finding.detail} See \`get_doc({ id: "${MIGRATION_GUIDE_ID}", sections: ["${finding.section}"] })\`.`]
}

/**
 * A config that does not load: the other checks need the config, so the agent
 * fixes it first
 */
function renderBlocking(context: ServerContext, findings: MigrationFinding[]): string {
  return [
    `# Migration from relizy 1 to relizy 2 (relizy ${context.version})`,
    '',
    `## To change first (${findings.length})`,
    '',
    ...findings.flatMap(renderFinding),
    '',
    'The config cannot load until this is fixed: fix it (after asking the user), then call `check_migration()` again for the other changes.',
  ].join('\n')
}

function renderReport(context: ServerContext, report: MigrationReport): string {
  const changes = report.findings.filter(finding => finding.severity === 'change')
  const reviews = report.findings.filter(finding => finding.severity === 'review')
  const scanned = report.configFiles.length > 0
    ? report.configFiles.map(file => code(file)).join(', ')
    : 'no config file (the defaults apply)'

  return [
    `# Migration from relizy 1 to relizy 2 (relizy ${context.version})`,
    '',
    `Checked: ${scanned}, \`package.json\`, the CI files, the source files importing \`relizy\` and the scripts posting to Teams (${code('.')}).`,
    `The guide: \`get_doc({ id: "${MIGRATION_GUIDE_ID}" })\`.`,
    '',
    `## To change (${changes.length})`,
    '',
    ...(changes.length > 0
      ? changes.flatMap(renderFinding)
      : ['Nothing to change.']),
    '',
    `## To review (${reviews.length})`,
    '',
    ...(reviews.length > 0
      ? reviews.flatMap(renderFinding)
      : ['Nothing to review.']),
    '',
    'Next: propose the changes to the user and apply them once approved, then check the next release with `preview_release()` and `relizy release --dry-run` (the social posts and the PR comment are shown in dry-run).',
  ].join('\n')
}

export async function checkMigration(context: ServerContext, { config: configName }: { config?: string }): Promise<string> {
  assertConfigName({ config: configName, cwd: context.cwd })

  const report = await checkProjectMigration({ cwd: context.cwd, configName })

  return report.configLoaded
    ? renderReport(context, report)
    : renderBlocking(context, report.findings.filter(finding => finding.blocking))
}

export const checkMigrationTool = defineTool({
  name: 'check_migration',
  title: 'Check the migration from relizy 1',
  description: 'List what to change in this project to upgrade from relizy 1 to relizy 2: the relizy dependency, the social templates (`{{releaseTitle}}`, `{{newVersion}}` with several versions), `bump.dependencyTypes`, the version groups (one release, group titles, hooks), the code calling the relizy API (cancelled prompts, functions no longer exported), and the scripts posting to Teams or Slack that `social.teams` and `social.slack` (`announcements`, `exclude`) replace, with the file and line of each place, the fix, and the section of the migration guide. Read-only.',
  inputSchema: {
    config: configArgSchema,
  },
  run: checkMigration,
})
