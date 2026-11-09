import type { AgentDocs, AgentsTool, AgentTarget, SetupAgentsChange, SetupAgentsResult } from '@maz-ui/node'

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { AGENT_TARGETS, detectAgentTargets, logger, setupAgents } from '@maz-ui/node'
import { isInCI } from '../core/ci-env'
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
  /** Add `relizy mcp update` to the `prepare` script of the root package.json (with the rules only), default `true` */
  prepare?: boolean
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
 * Does nothing in CI, where the `prepare` script also runs: nobody commits the files it would rewrite there.
 */
export function mcpUpdate({ cwd = process.cwd(), dryRun = false }: McpUpdateOptions = {}): SetupAgentsChange[] {
  if (isInCI()) {
    return []
  }

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

/** Command of the `prepare` script keeping the agent rules up to date at each install */
export const AGENT_RULES_COMMAND = 'relizy mcp update'

/**
 * The `prepare` script running `relizy mcp update`: an existing script is extended.
 * `undefined` when it already runs `relizy mcp update` or `relizy mcp init`.
 */
export function addAgentRulesCommand(prepare: string | undefined): string | undefined {
  if (!prepare) {
    return AGENT_RULES_COMMAND
  }

  return prepare.includes(AGENT_RULES_COMMAND) || prepare.includes('relizy mcp init')
    ? undefined
    : `${prepare} && ${AGENT_RULES_COMMAND}`
}

/** The `prepare` script without `relizy mcp update`: `undefined` when nothing else is left */
function removeAgentRulesCommand(prepare: string): string | undefined {
  const kept = prepare.split('&&').map(part => part.trim()).filter(part => part !== AGENT_RULES_COMMAND)

  return kept.length > 0
    ? kept.join(' && ')
    : undefined
}

/** Write the `prepare` script of the package.json, keeping its indentation: `undefined` removes it, with the `scripts` left empty */
function writePrepareScript(path: string, content: string, prepare: string | undefined): void {
  const json = JSON.parse(content)
  const indent = /^([ \t]+)"/m.exec(content)?.[1] ?? '  '

  json.scripts = { ...json.scripts, prepare }

  if (Object.values(json.scripts).every(script => script === undefined)) {
    delete json.scripts
  }

  writeFileSync(path, `${JSON.stringify(json, null, indent)}\n`)
}

/**
 * Add `relizy mcp update` to the `prepare` script of the root package.json (or remove it).
 * No change without a package.json, nor when the script is already as expected.
 */
export function setupPrepareScript({ cwd = process.cwd(), dryRun = false, remove = false }: { cwd?: string, dryRun?: boolean, remove?: boolean } = {}): SetupAgentsChange | undefined {
  const path = join(cwd, 'package.json')

  if (!existsSync(path)) {
    return undefined
  }

  const content = readFileSync(path, 'utf8')
  let prepare: string | undefined

  try {
    prepare = JSON.parse(content).scripts?.prepare
  }
  catch {
    return { file: 'package.json', action: 'skip', reason: 'invalid JSON, prepare script not changed' }
  }

  if (remove) {
    const next = prepare && removeAgentRulesCommand(prepare)

    if (!prepare?.includes(AGENT_RULES_COMMAND) || next === prepare) {
      return undefined
    }

    if (!dryRun) {
      writePrepareScript(path, content, next)
    }

    return { file: 'package.json', action: 'update', reason: `${AGENT_RULES_COMMAND} removed from the prepare script` }
  }

  const next = addAgentRulesCommand(prepare)

  if (next === undefined) {
    return { file: 'package.json', action: 'unchanged', reason: 'prepare script' }
  }

  if (!dryRun) {
    writePrepareScript(path, content, next)
  }

  return { file: 'package.json', action: 'update', reason: `prepare script: ${next}` }
}

/** `relizy mcp init`: configure the agents and the `prepare` script of the rules, then print the changes */
export function mcpInit(options: McpInitOptions = {}): SetupAgentsResult {
  const dryRun = options.dryRun ?? false
  const result = setupRelizyAgents(options)

  // keeps the rules of the agents up to date at each install
  if (options.rules !== false && options.prepare !== false) {
    const prepare = setupPrepareScript({ cwd: options.cwd, dryRun, remove: options.remove })

    if (prepare) {
      result.changes.push(prepare)
    }
  }

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
