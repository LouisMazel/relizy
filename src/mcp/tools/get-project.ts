import type { ResolvedRelizyConfig } from '../../core'
import type { ServerContext } from '../context'
import type { PackageSet } from './project'

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { detectGitProvider, getCurrentGitBranch, getLastTag, readPackageJson, redactSecrets } from '../../core'
import { findOutdatedRules } from '../agents'
import { code, codeList, tableCell } from '../markdown'
import { listConfigNames, loadProjectConfig } from '../runtime'
import { stringifyConfigValue } from './get-config-option'
import { configArgSchema, readPackageSets, relativePath } from './project'
import { defineTool } from './types'

function safely<T>(read: () => T): T | undefined {
  try {
    return read()
  }
  catch {
    return undefined
  }
}

function describeRoot(config: ResolvedRelizyConfig): string {
  const rootPackage = readPackageJson(config.cwd)

  if (!rootPackage) {
    return code(config.cwd)
  }

  return `${code(config.cwd)}, ${code(rootPackage.name)} ${rootPackage.version}${rootPackage.private ? ' (private)' : ''}`
}

function describeConfigs(cwd: string, loaded: string | undefined): string {
  const names = listConfigNames(cwd)

  if (names.length === 0) {
    return 'no relizy config file, the defaults apply (`relizy init` creates one)'
  }

  return `${codeList(names)} (loaded: ${code(loaded ?? 'relizy')})`
}

async function describeGit(config: ResolvedRelizyConfig): Promise<string> {
  const branch = safely(() => getCurrentGitBranch(config.cwd)) ?? 'unknown'
  const lastTag = await getLastTag({ cwd: config.cwd })
  const provider = config.repo?.provider ?? detectGitProvider(config.cwd)
  const repository = config.repo?.repo ? ` (${code(config.repo.repo)})` : ''
  const hosting = provider ? `, provider ${provider}` : ''

  return `branch ${code(branch)}, last tag ${code(lastTag || 'none')}${hosting}${repository}`
}

function describeSteps(config: ResolvedRelizyConfig): string {
  return Object.entries(config.release)
    .filter(([key, value]) => typeof value === 'boolean' && key !== 'noVerify' && key !== 'clean')
    .map(([key, value]) => `${key} ${value ? 'on' : 'off'}`)
    .join(', ')
}

function describeSet(set: PackageSet, cwd: string): string[] {
  const title = set.group ? `## Group ${code(set.group.name)} (${set.versionMode})` : `## Packages (${set.versionMode})`

  if (set.packages.length === 0) {
    return [title, '', 'No package.']
  }

  return [
    title,
    '',
    '| Package | Version | Path |',
    '| --- | --- | --- |',
    ...set.packages.map(pkg => `| ${code(pkg.name)}${pkg.private ? ' (private)' : ''} | ${pkg.version} | ${code(tableCell(relativePath(cwd, pkg.path)))} |`),
  ]
}

function describeAgents(cwd: string, version: string): string[] {
  const outdated = findOutdatedRules(cwd, version)

  if (outdated.length > 0) {
    return ['## Agents', '', ...outdated.map(rule => `- ${code(rule.file)} holds the rules of relizy ${rule.version}: ask the user to run \`relizy mcp init\` to update them to ${version}.`)]
  }

  if (!existsSync(join(cwd, '.claude/rules/relizy.md')) && !existsSync(join(cwd, 'AGENTS.md'))) {
    return ['The agents of this project have no relizy rules: `relizy mcp init` writes them (Claude Code rule, AGENTS.md section) with this MCP server.']
  }

  return []
}

export async function getProject(context: ServerContext, { config: configName }: { config?: string }): Promise<string> {
  const config = await loadProjectConfig({ config: configName, cwd: context.cwd })
  const sets = readPackageSets(config)
  const modes = sets.map(set => set.group ? `${code(set.group.name)} group in ${set.versionMode} mode` : set.versionMode).join(', ')
  const agents = describeAgents(config.cwd, context.version)

  return [
    `# relizy project (relizy ${context.version})`,
    '',
    `- **Root:** ${describeRoot(config)}`,
    `- **Config:** ${describeConfigs(config.cwd, configName)}`,
    `- **Version mode:** ${modes}`,
    `- **Git:** ${await describeGit(config)}`,
    `- **Steps of \`relizy release\`:** ${describeSteps(config)}`,
    ...sets.flatMap(set => ['', ...describeSet(set, config.cwd)]),
    ...(agents.length > 0 ? ['', ...agents] : []),
    '',
    '## Resolved config',
    '',
    'Secrets are masked, hooks are not shown (the MCP server never runs them).',
    '',
    '```json',
    stringifyConfigValue({ ...redactSecrets(config), hooks: undefined, cwd: undefined }, 2)!,
    '```',
    '',
    'Next: `preview_release` to see what the next release bumps, `get_config_option({ path })` for an option.',
  ].join('\n')
}

export const getProjectTool = defineTool({
  name: 'get_project',
  title: 'Read the relizy project',
  description: 'Describe how relizy releases this project: its config files, the version mode or the version groups, the packages released by each group with their current version, the git branch and last tag, the steps of `relizy release`, and the resolved config (defaults merged, secrets masked). Read-only: no hook runs.',
  inputSchema: {
    config: configArgSchema,
  },
  run: getProject,
})
