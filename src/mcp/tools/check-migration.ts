import type { ResolvedRelizyConfig } from '../../core'
import type { ServerContext } from '../context'

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import fastGlob from 'fast-glob'
import { GLOB_IGNORE } from '../../core/glob'
import { hasVersionGroups } from '../../core/groups'
import { code } from '../markdown'
import { loadProjectConfig } from '../runtime'
import { configArgSchema, getVersionMode } from './project'
import { defineTool } from './types'

const GUIDE_ID = 'guide/migration-v2'

/**
 * Something to change (`change`) or to check (`review`) to upgrade the project
 * from relizy 1, with the section of the migration guide explaining it
 */
interface MigrationFinding {
  severity: 'change' | 'review'
  title: string
  /** Title of the section of the migration guide */
  section: string
  detail: string
  /** `file:line` */
  locations?: string[]
}

const SOURCE_PATTERNS = ['**/*.{ts,mts,cts,tsx,js,mjs,cjs,jsx,vue}']
const SOURCE_IGNORE = [...GLOB_IGNORE, '**/build/**', '**/coverage/**', '**/agent-docs/**', '**/.nuxt/**', '**/.output/**', '**/.next/**']
const MAX_SOURCE_FILES = 5000
const MAX_SOURCE_SIZE = 512 * 1024

const RELIZY_IMPORTS = [/\bfrom\s+['"]relizy[/'"]/, /\brequire\(\s*['"]relizy[/'"]/, /\bimport\(\s*['"]relizy['"]/]
const NAMED_IMPORTS = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]relizy['"]/g
const COMMANDS = ['release', 'bump', 'changelog', 'publish', 'providerRelease', 'social']
const SOCIAL_HOOK = /['"](?:before|success|error):(?:social|twitter|slack)['"]/
const COMMIT_TEMPLATE_KEY = /\b(?:commitMessage|commitBody|tagMessage|tagBody|changelogTitle)\b/

/** The lines (1-based) of a text matching a pattern */
function findLines(text: string, pattern: RegExp): number[] {
  return text.split('\n').flatMap((line, index) => pattern.test(line) ? [index + 1] : [])
}

function locate(file: string, lines: number[]): string[] {
  return lines.map(line => `${file}:${line}`)
}

/** The config files of the project for a config name (`relizy` by default) */
function readConfigFiles(cwd: string, configName = 'relizy'): { file: string, text: string }[] {
  const pattern = new RegExp(`^${configName.replaceAll('.', '\\.')}\\.config\\.(?:[cm]?[jt]s|json|ya?ml|toml)$`)

  return readdirSync(cwd)
    .filter(file => pattern.test(file))
    .map(file => ({ file, text: readFileSync(join(cwd, file), 'utf8') }))
}

/** The social templates of the resolved config */
function getSocialTemplates(config: ResolvedRelizyConfig): string[] {
  return [
    config.social?.twitter?.template ?? config.templates?.twitterMessage,
    config.social?.slack?.template ?? config.templates?.slackMessage,
  ].filter((template): template is string => Boolean(template))
}

function checkTemplates(config: ResolvedRelizyConfig, configFiles: { file: string, text: string }[], severalVersions: boolean): MigrationFinding[] {
  const findings: MigrationFinding[] = []
  const templates = getSocialTemplates(config)
  const versionPlaceholder = configFiles.flatMap(({ file, text }) => locate(file, findLines(text, /\{\{version\}\}/)))

  if (versionPlaceholder.length > 0) {
    findings.push({
      severity: 'change',
      title: '`{{version}}` is not a variable of the social templates',
      section: 'Version Placeholder',
      detail: 'It was never replaced: use `{{newVersion}}`, or `{{releaseTitle}}` for the whole title.',
      locations: versionPlaceholder,
    })
  }

  if (templates.some(template => /\{\{projectName\}\}\s*v?\{\{newVersion\}\}/.test(template))) {
    findings.push({
      severity: severalVersions ? 'change' : 'review',
      title: 'A social template builds the title of the release from `{{projectName}}` and `{{newVersion}}`',
      section: 'Release Title',
      detail: `Use \`{{releaseTitle}}\`: \`<name> <version> is out!\` for a single version, \`New releases of <projectName>\` for several.${severalVersions ? ' With version groups or the `independent` mode, `{{newVersion}}` is empty when several versions are released.' : ''}`,
      locations: configFiles.flatMap(({ file, text }) => locate(file, findLines(text, /\{\{projectName\}\}\s*v?\{\{newVersion\}\}/))),
    })
  }
  else if (severalVersions && templates.some(template => template.includes('{{newVersion}}'))) {
    findings.push({
      severity: 'change',
      title: '`{{newVersion}}` in a social template',
      section: 'New Version Variable',
      detail: 'It is empty when several versions are released (version groups, `independent` mode): use `{{releaseTitle}}`, or `{{packageList}}` and `{{packageCount}}`.',
      locations: configFiles.flatMap(({ file, text }) => locate(file, findLines(text, /\{\{newVersion\}\}/).filter(line => !COMMIT_TEMPLATE_KEY.test(text.split('\n')[line - 1]!)))),
    })
  }

  const repeated = templates.flatMap(template => [...new Set((template.match(/\{\{\w+\}\}/g) ?? []).filter((variable, index, all) => all.indexOf(variable) !== index))])

  if (repeated.length > 0) {
    findings.push({
      severity: 'review',
      title: `A social template repeats ${[...new Set(repeated)].map(variable => code(variable)).join(', ')}`,
      section: 'Every Occurrence Is Replaced',
      detail: 'Every occurrence of a variable is replaced, not only the first one.',
    })
  }

  return findings
}

/**
 * `bump.dependencyTypes` lists without `dependencies`: v1 added the default
 * `dependencies` to them
 */
function checkDependencyTypes(config: ResolvedRelizyConfig, configFiles: { file: string, text: string }[]): MigrationFinding[] {
  const lists = [config.bump?.dependencyTypes, ...(config.monorepo?.groups ?? []).map(group => group.bump?.dependencyTypes)]
  const withoutDependencies = lists.some(list => list && !list.includes('dependencies'))
  const locations = configFiles.flatMap(({ file, text }) => locate(file, findLines(text, /\bdependencyTypes\b/).filter(line => !/['"]dependencies['"]/.test(text.split('\n')[line - 1]!))))

  return withoutDependencies
    ? [{
        severity: 'change',
        title: '`bump.dependencyTypes` without `dependencies`',
        section: 'Arrays Replace the Defaults',
        detail: 'relizy 1 added the default `dependencies` to the list: add it to keep bumping the packages on every bump of their `dependencies`, or leave it out on purpose.',
        locations,
      }]
    : []
}

function checkVersionGroups(config: ResolvedRelizyConfig, configFiles: { file: string, text: string }[]): MigrationFinding[] {
  if (!hasVersionGroups(config)) {
    return []
  }

  const groups = config.monorepo!.groups!
  const findings: MigrationFinding[] = [{
    severity: 'review',
    title: 'The version groups are released as one release',
    section: 'Version Groups',
    detail: 'One bump confirmation, one social post per platform (one AI call per platform) with a section per group, one PR comment with a table per group. Check the next posts with `relizy social --dry-run` or `relizy release --dry-run`.',
  }]

  const untitled = groups.filter(group => !group.title)
  if (untitled.length > 0) {
    findings.push({
      severity: 'review',
      title: `Version groups without \`title\`: ${untitled.map(group => code(group.name)).join(', ')}`,
      section: 'Group Options',
      detail: 'The `title` of a group is its name in the social posts, the PR comment and the bump prompt (default: `name`).',
    })
  }

  const socialHooks = configFiles.flatMap(({ file, text }) => locate(file, findLines(text, SOCIAL_HOOK)))
  if (socialHooks.length > 0) {
    findings.push({
      severity: 'review',
      title: 'Hooks of `social`, `twitter` or `slack` with version groups',
      section: 'Hooks Run Once',
      detail: 'They run once per release with the global config, instead of once per group with the config of the group. Read the release from their third parameter (`context.release`).',
      locations: socialHooks,
    })
  }

  const independentWithAI = groups.filter(group => group.versionMode === 'independent' && group.ai?.providerRelease === undefined)
  if (config.ai?.providerRelease?.enabled && config.release?.providerRelease && independentWithAI.length > 0) {
    findings.push({
      severity: 'review',
      title: `AI provider releases for the \`independent\` groups ${independentWithAI.map(group => code(group.name)).join(', ')}`,
      section: 'Group Options',
      detail: 'Each package of an `independent` group gets its provider release, each one rewritten by the AI. Set `ai: { providerRelease: { enabled: false } }` on a group to limit the AI calls, or `release: { providerRelease: false }` to skip its provider releases.',
    })
  }

  return findings
}

function readSourceFiles(cwd: string): { file: string, text: string }[] {
  return fastGlob.sync(SOURCE_PATTERNS, { cwd, ignore: SOURCE_IGNORE, onlyFiles: true })
    .slice(0, MAX_SOURCE_FILES)
    .filter(file => statSync(join(cwd, file)).size <= MAX_SOURCE_SIZE)
    .map(file => ({ file, text: readFileSync(join(cwd, file), 'utf8') }))
    .filter(({ text }) => RELIZY_IMPORTS.some(pattern => pattern.test(text)))
}

/**
 * The names imported from relizy, with their local name (`release as runRelease`)
 */
function getImportedNames(text: string): Map<string, string> {
  return new Map([...text.matchAll(NAMED_IMPORTS)].flatMap(([, names]) => names!
    .split(',')
    .map(name => name.replaceAll(/\s+/g, ' ').trim().replace(/^type /, ''))
    .filter(Boolean)
    .map((name) => {
      const [imported, local = imported] = name.split(' as ')
      return [imported!.trim(), local!.trim()] as const
    })))
}

function checkSourceFiles(cwd: string): MigrationFinding[] {
  const files = readSourceFiles(cwd)
  const collect = (pattern: RegExp, only?: (text: string) => boolean) => files
    .filter(({ text }) => !only || only(text))
    .flatMap(({ file, text }) => locate(file, findLines(text, pattern)))

  const checks: (MigrationFinding & { locations: string[] })[] = [
    {
      severity: 'change',
      title: '`confirmBump()` or the `confirm()` of a bump plan',
      section: 'Bump Confirmation',
      detail: '`confirmBump({ packages, display, dryRun })` only asks, once for every package; `displayBump()` prints a bump; the plans of `planBumps()` have `display()` instead of `confirm()`.',
      locations: [...collect(/\bconfirmBump\s*\(/), ...collect(/\.confirm\??\.?\(\)/, text => /\bplanBumps\b/.test(text))],
    },
    {
      severity: 'change',
      title: 'The social functions take the `variables` of the template',
      section: 'Social Functions',
      detail: '`formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()` and `postReleaseToSlack()` (and `TwitterOptions`, `SlackOptions`) take `variables` (`getSocialTemplateVariables()`) instead of `projectName`, `version`, `releaseUrl` and `changelogUrl`.',
      locations: collect(/\b(?:formatTweetMessage|postReleaseToTwitter|formatSlackMessage|postReleaseToSlack|TwitterOptions|SlackOptions)\b/),
    },
    {
      severity: 'change',
      title: '`buildReleaseSummary()` is replaced by the release report',
      section: 'Release Report',
      detail: '`release()` returns the report of the release; `formatReleaseReportText(report)` renders it as text.',
      locations: collect(/\bbuildReleaseSummary\b/),
    },
    {
      severity: 'review',
      title: '`GroupBumpResult` objects',
      section: 'Version Group Results',
      detail: 'A `GroupBumpResult` has a `title` (the `title` of the group, else its `name`).',
      locations: collect(/\bGroupBumpResult\b/),
    },
    {
      severity: 'review',
      title: 'Commands called from code: a refused prompt throws',
      section: 'Cancelled Prompts',
      detail: 'A refused or cancelled prompt throws a `RelizyCancelError` (`isRelizyCancelError()`) instead of exiting the process: nothing was written.',
      locations: files.flatMap(({ file, text }) => {
        const imported = getImportedNames(text)
        const commands = COMMANDS.flatMap(name => imported.get(name) ?? [])
        return commands.length > 0 ? locate(file, findLines(text, new RegExp(`\\b(?:${commands.join('|')})\\s*\\(`))) : []
      }),
    },
  ]

  return checks.filter(check => check.locations.length > 0)
}

function checkDependency(cwd: string): MigrationFinding[] {
  const packageJsonPath = join(cwd, 'package.json')

  if (!existsSync(packageJsonPath)) {
    return []
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as Record<string, Record<string, string> | undefined>
  const range = packageJson.devDependencies?.relizy ?? packageJson.dependencies?.relizy

  return range && /^[~^]?1\./.test(range)
    ? [{ severity: 'change', title: `\`relizy\` is required as ${code(range)} in \`package.json\``, section: 'Upgrade', detail: 'Install relizy 2: `pnpm add -D relizy@^2` (or the command of your package manager).' }]
    : []
}

function renderLocations(locations: string[] = []): string {
  if (locations.length === 0) {
    return ''
  }

  const more = locations.length > 10 ? `, and ${locations.length - 10} more` : ''

  return ` (${locations.slice(0, 10).map(location => code(location)).join(', ')}${more})`
}

function renderFinding(finding: MigrationFinding): string[] {
  const locations = renderLocations(finding.locations)

  return [`- **${finding.title}**${locations}: ${finding.detail} See \`get_doc({ id: "${GUIDE_ID}", sections: ["${finding.section}"] })\`.`]
}

export async function checkMigration(context: ServerContext, { config: configName }: { config?: string }): Promise<string> {
  const config = await loadProjectConfig({ config: configName, cwd: context.cwd })
  const configFiles = readConfigFiles(config.cwd, configName)
  const severalVersions = hasVersionGroups(config) || getVersionMode(config) === 'independent'
  const findings = [
    ...checkDependency(config.cwd),
    ...checkTemplates(config, configFiles, severalVersions),
    ...checkDependencyTypes(config, configFiles),
    ...checkVersionGroups(config, configFiles),
    ...checkSourceFiles(config.cwd),
  ]
  const changes = findings.filter(finding => finding.severity === 'change')
  const reviews = findings.filter(finding => finding.severity === 'review')
  const scanned = configFiles.length > 0 ? configFiles.map(({ file }) => code(file)).join(', ') : 'no config file (the defaults apply)'

  return [
    `# Migration from relizy 1 to relizy 2 (relizy ${context.version})`,
    '',
    `Checked: ${scanned}, \`package.json\`, and the source files importing \`relizy\` (${code(relative(context.cwd, config.cwd) || '.')}).`,
    `The guide: \`get_doc({ id: "${GUIDE_ID}" })\`.`,
    '',
    `## To change (${changes.length})`,
    '',
    ...(changes.length > 0 ? changes.flatMap(renderFinding) : ['Nothing to change.']),
    '',
    `## To review (${reviews.length})`,
    '',
    ...(reviews.length > 0 ? reviews.flatMap(renderFinding) : ['Nothing to review.']),
    '',
    'Next: propose the changes to the user and apply them once approved, then check the next release with `preview_release()` and `relizy release --dry-run` (the social posts and the PR comment are shown in dry-run).',
  ].join('\n')
}

export const checkMigrationTool = defineTool({
  name: 'check_migration',
  title: 'Check the migration from relizy 1',
  description: 'List what to change in this project to upgrade from relizy 1 to relizy 2: the relizy dependency, the social templates (`{{releaseTitle}}`, `{{newVersion}}` with several versions), `bump.dependencyTypes`, the version groups (one release, group titles, hooks), and the code calling the relizy API (cancelled prompts, `confirmBump`, social functions), with the file and line of each place, the fix, and the section of the migration guide. Read-only.',
  inputSchema: {
    config: configArgSchema,
  },
  run: checkMigration,
})
