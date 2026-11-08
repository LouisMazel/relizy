import type { AgentDocs, AgentsTool, AgentTarget, SetupAgentsChange, SetupAgentsResult } from '@maz-ui/node'

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { AGENT_TARGETS, detectAgentTargets, logger, setupAgents } from '@maz-ui/node'
import { defaultBundleDir } from './knowledge/paths'
import { readOwnVersion } from './version'

/** relizy for `setupAgents` of `@maz-ui/node`: `.claude/rules/relizy.md`, the `relizy` section of `AGENTS.md` and MCP server */
export const RELIZY_AGENTS_TOOL: AgentsTool = {
  name: 'relizy',
  mcpPackage: 'relizy',
  mcpBin: 'relizy',
  mcpArgs: ['mcp'],
  generatedBy: '`relizy mcp init`',
  versionNote: () => '> These rules and the docs in `node_modules/relizy/agent-docs` match the installed relizy.',
}

/** Rules of relizy for the agents, shipped in its docs bundle */
export function readOwnAgentDocs(directory: string = process.env.RELIZY_AGENT_DOCS_DIR || defaultBundleDir()): AgentDocs {
  const read = (file: string) => {
    const path = join(directory, 'agents', file)

    if (!existsSync(path)) {
      throw new Error(`The rules of relizy for the agents are missing (${path}). Reinstall relizy, or run \`pnpm build\` in the relizy repository.`)
    }

    return readFileSync(path, 'utf8').trim()
  }

  return {
    directory,
    version: readOwnVersion(),
    claudeRule: read('claude-rule.md'),
    agentsMdSection: read('agents-md.md'),
  }
}

export interface McpInitOptions {
  cwd?: string
  /** Agents to configure, default: the agents detected in the project, else Claude Code and `AGENTS.md` */
  targets?: AgentTarget[]
  /** Write the rules (Claude Code rule, `AGENTS.md` section), default `true` */
  rules?: boolean
  /** Register the MCP server, default `true` */
  mcp?: boolean
  dryRun?: boolean
  /** Remove what `relizy mcp init` added */
  remove?: boolean
  /** Folder of the docs bundle, default: the `agent-docs/` of relizy */
  docsDir?: string
}

/** Default agents of a project: the detected ones, else Claude Code and `AGENTS.md` (read by Codex, Cursor, Copilot...) */
export function getDefaultAgentTargets(cwd: string): AgentTarget[] {
  const detected = detectAgentTargets(cwd)

  return detected.length > 0
    ? detected
    : ['claude', 'agents-md']
}

/** Configure the AI coding agents of a project for relizy: rules and MCP server */
export function setupRelizyAgents({ cwd = process.cwd(), targets, rules = true, mcp = true, dryRun = false, remove = false, docsDir }: McpInitOptions = {}): SetupAgentsResult {
  const invalid = (targets ?? []).filter(target => !AGENT_TARGETS.includes(target))

  if (invalid.length > 0) {
    throw new Error(`Unknown agent target(s): ${invalid.join(', ')}. Available: ${AGENT_TARGETS.join(', ')}.`)
  }

  return setupAgents({
    rootDir: cwd,
    targets: targets ?? getDefaultAgentTargets(cwd),
    rules,
    mcp,
    dryRun,
    remove,
    tool: RELIZY_AGENTS_TOOL,
    agentDocs: remove || !rules
      ? undefined
      : readOwnAgentDocs(docsDir),
    mcpVersion: readOwnVersion(),
  })
}

/**
 * Rule files of the project that `relizy mcp init` would rewrite because their content changed (read-only: dry run, rules only).
 * Only the files already holding rules of relizy count: an `AGENTS.md` without its section is not outdated.
 * Never throws: an unreadable project has no outdated rules.
 */
export function findOutdatedRules(cwd: string): string[] {
  const marker = RELIZY_AGENTS_TOOL.marker ?? `Managed by ${RELIZY_AGENTS_TOOL.name}`

  try {
    return setupRelizyAgents({ cwd, mcp: false, dryRun: true }).changes.filter(change => change.action === 'update' && readFileSync(join(cwd, change.file), 'utf8').includes(marker)).map(change => change.file)
  }
  catch {
    return []
  }
}

export function formatAgentsChanges(changes: SetupAgentsChange[], dryRun: boolean): string[] {
  const labels: Record<SetupAgentsChange['action'], string> = {
    create: dryRun ? 'would create' : 'created',
    update: dryRun ? 'would update' : 'updated',
    remove: dryRun ? 'would remove' : 'removed',
    unchanged: 'up to date',
    skip: 'skipped',
  }

  return changes.map((change) => {
    const reason = change.reason
      ? ` (${change.reason})`
      : ''

    return `${labels[change.action].padEnd(13)} ${change.file}${reason}`
  })
}

export interface McpUpdateOptions {
  cwd?: string
  dryRun?: boolean
}

/** Agent owning each rule file */
const RULE_FILE_TARGETS: Record<string, AgentTarget> = {
  '.claude/rules/relizy.md': 'claude',
  'AGENTS.md': 'agents-md',
}

/**
 * `relizy mcp update`: rewrite the rule files of relizy that already exist and whose content changed.
 * Never creates a file, never touches the MCP config nor a file edited by hand. Silent when everything is up to date.
 * Never throws: a project without rules has nothing to update.
 */
export function mcpUpdate({ cwd = process.cwd(), dryRun = false }: McpUpdateOptions = {}): SetupAgentsChange[] {
  try {
    const targets = [
      ...new Set(findOutdatedRules(cwd).map(file => RULE_FILE_TARGETS[file]).filter((target): target is AgentTarget => !!target)),
    ]

    if (targets.length === 0) {
      return []
    }

    const changes = setupRelizyAgents({ cwd, mcp: false, targets, dryRun }).changes.filter(change => change.action === 'update')

    for (const line of formatAgentsChanges(changes, dryRun)) {
      logger.log(line)
    }

    return changes
  }
  catch {
    return []
  }
}

/** `relizy mcp init`: configure the agents, then print the changes */
export function mcpInit(options: McpInitOptions = {}): SetupAgentsResult {
  const dryRun = options.dryRun ?? false
  const result = setupRelizyAgents(options)
  const command = [result.mcpServer.command, ...result.mcpServer.args].join(' ')

  logger.info(`relizy ${readOwnVersion()} agents setup (${result.targets.join(', ')})${dryRun ? ' - dry run' : ''}`)

  for (const line of formatAgentsChanges(result.changes, dryRun)) {
    logger.log(`  ${line}`)
  }

  if (!options.remove && options.mcp !== false && !result.localMcpServer) {
    logger.info(`The MCP server runs through \`${command}\`: add relizy to the devDependencies of the project to start the installed version, then run \`relizy mcp init\` again.`)
  }

  if (!options.remove && options.rules !== false && result.targets.includes('agents-md')) {
    logger.info(`Codex and Windsurf read AGENTS.md: to give them the MCP server too, add \`${command}\` to their MCP config.`)
  }

  return result
}
