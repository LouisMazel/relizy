import type { AgentTarget, SetupAgentsChange, SetupAgentsResult } from '@maz-ui/node'
import type { SetupRelizyAgentsOptions } from '../core/agents'
import process from 'node:process'
import { cancel, intro, log, note, outro } from '@clack/prompts'
import { logger } from '@maz-ui/node'
import { isInCI } from '@relizy/core'
import { askAgentTargets, findOutdatedRules, setupPrepareScript, setupRelizyAgents } from '../core/agents'
import { createStyles, shouldUseColors } from '../core/commitlint/report'
import { readOwnVersion } from '../core/own-version'

export interface McpInitOptions extends SetupRelizyAgentsOptions {
  /** Add `relizy mcp update` to the `prepare` script of the root package.json (with the rules only), default `true` */
  prepare?: boolean
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

/** What `relizy mcp init` cannot do for the user: start the installed relizy, give the MCP server to the agents only reading `AGENTS.md` */
function printMcpInitHints(result: SetupAgentsResult, options: McpInitOptions): void {
  const c = createStyles(shouldUseColors())
  const command = c.cyan([result.mcpServer.command, ...result.mcpServer.args].join(' '))

  if (options.remove) {
    return
  }

  if (options.mcp !== false && !result.localMcpServer) {
    log.info(`The MCP server runs through ${command}: add relizy to the devDependencies of the project to start the installed version, then run ${c.cyan('relizy mcp init')} again.`)
  }

  if (options.rules !== false && result.targets.includes('agents-md')) {
    log.info(`Codex, Cline and Zed read AGENTS.md: to give them the MCP server too, add ${command} to their MCP config.`)
  }
}

/**
 * `relizy mcp init`: configure the agents and the `prepare` script of the rules, then print the changes.
 * In a terminal, without `targets` nor `remove`, asks which agents to configure. `undefined` when cancelled or
 * when the agents cannot be configured (exit code 1).
 */
export async function mcpInit(options: McpInitOptions = {}): Promise<SetupAgentsResult | undefined> {
  const cwd = options.cwd ?? process.cwd()
  const dryRun = options.dryRun ?? false
  const interactive = !options.targets && !options.remove && Boolean(process.stdin.isTTY) && !isInCI()
  const c = createStyles(shouldUseColors())

  // Apart from the command typed, or the line of the package manager running the script
  process.stdout.write('\n')
  intro(c.bold(' relizy mcp init '))

  const targets = interactive
    ? await askAgentTargets(cwd)
    : options.targets
  if (typeof targets === 'symbol') {
    cancel('Cancelled, nothing written')
    return undefined
  }

  let result: SetupAgentsResult
  try {
    result = setupRelizyAgents({ ...options, cwd, targets })
  }
  catch (error) {
    cancel(`AI agents not set up - ${error instanceof Error
      ? error.message
      : String(error)}`)
    process.exitCode = 1
    return undefined
  }

  // keeps the rules of the agents up to date at each install
  if (options.rules !== false && options.prepare !== false) {
    const prepare = setupPrepareScript({ cwd, dryRun, remove: options.remove })

    if (prepare) {
      result.changes.push(prepare)
    }
  }

  note(formatAgentsChanges(result.changes, dryRun).join('\n'), `relizy ${readOwnVersion()} for ${result.targets.join(', ')}`)

  printMcpInitHints(result, options)

  outro(dryRun
    ? 'Dry run, nothing written'
    : options.remove
      ? c.green('relizy removed from the AI agents')
      : c.green('AI agents set up for relizy'))

  return result
}
