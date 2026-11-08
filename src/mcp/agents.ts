import type { AgentDocs, AgentsTool, AgentTarget, SetupAgentsChange, SetupAgentsResult } from '@maz-ui/node'

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { AGENT_TARGETS, compareVersions, detectAgentTargets, logger, readManagedVersion, setupAgents } from '@maz-ui/node'
import { defaultBundleDir } from './knowledge/paths'
import { readOwnVersion } from './version'

/** relizy for `setupAgents` of `@maz-ui/node`: `.claude/rules/relizy.md`, the `relizy` section of `AGENTS.md` and MCP server */
export const RELIZY_AGENTS_TOOL: AgentsTool = {
  name: 'relizy',
  mcpPackage: 'relizy',
  mcpBin: 'relizy',
  mcpArgs: ['mcp'],
  generatedBy: '`relizy mcp init`',
  versionNote: version => `> relizy ${version} is installed: these rules and the docs in \`node_modules/relizy/agent-docs\` match this version.`,
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

/** Rules generated in a project by an older relizy than the installed one: `relizy mcp init` updates them */
export function findOutdatedRules(cwd: string, version: string = readOwnVersion()): { file: string, version: string }[] {
  return ['.claude/rules/relizy.md', 'AGENTS.md'].flatMap((file) => {
    const path = join(cwd, file)
    const written = existsSync(path)
      ? readManagedVersion(readFileSync(path, 'utf8'), RELIZY_AGENTS_TOOL)
      : undefined

    return written && compareVersions(written, version) < 0
      ? [
          { file, version: written },
        ]
      : []
  })
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
