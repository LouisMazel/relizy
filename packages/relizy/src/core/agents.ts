import type { AgentDocs, AgentsTool, AgentTarget, SetupAgentsChange, SetupAgentsResult } from '@maz-ui/node'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { join } from 'node:path'
import process from 'node:process'
import { multiselect } from '@clack/prompts'
import { AGENT_TARGETS, detectAgentTargets, setupAgents } from '@maz-ui/node'
import { defaultBundleDir } from './agent-docs'
import { readOwnVersion } from './own-version'

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

export interface SetupRelizyAgentsOptions {
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

/** Default agents of a project: the detected ones, else Claude Code and `AGENTS.md` (read by Codex, Cline, Zed...) */
export function getDefaultAgentTargets(cwd: string): AgentTarget[] {
  const detected = detectAgentTargets(cwd)

  return detected.length > 0
    ? detected
    : ['claude', 'agents-md']
}

/** Agents offered by `relizy init` and `relizy mcp init`, in the order of the question */
const AGENT_LABELS: Record<AgentTarget, string> = {
  'claude': 'Claude Code',
  'vscode': 'GitHub Copilot (VS Code)',
  'cursor': 'Cursor',
  'gemini': 'Gemini CLI',
  'opencode': 'OpenCode',
  'junie': 'JetBrains Junie',
  'windsurf': 'Windsurf / Devin',
  'warp': 'Warp',
  'kiro': 'Kiro',
  'roo': 'Roo Code',
  'agents-md': 'Codex, Cline, Zed or another agent',
}

/** The agents with `AGENTS.md` as soon as one is not Claude Code: it holds their rules */
function withAgentsMd(targets: AgentTarget[]): AgentTarget[] {
  return targets.some(target => target !== 'claude')
    ? AGENT_TARGETS.filter(target => target === 'agents-md' || targets.includes(target))
    : targets
}

/** Ask which agents to configure, the detected ones checked, with `AGENTS.md` (see `withAgentsMd`). The symbol of clack when cancelled */
export async function askAgentTargets(cwd: string): Promise<AgentTarget[] | symbol> {
  const selected = await multiselect({
    message: 'Which AI agents do you use?',
    options: (Object.keys(AGENT_LABELS) as AgentTarget[]).map(target => ({
      value: target,
      label: AGENT_LABELS[target],
      hint: target === 'agents-md'
        ? 'AGENTS.md'
        : undefined,
    })),
    initialValues: detectAgentTargets(cwd),
    required: true,
  })

  return typeof selected === 'symbol'
    ? selected
    : withAgentsMd(selected)
}

/** Configure the AI coding agents of a project for relizy: rules and MCP server, with `AGENTS.md` for the rules of the agents other than Claude Code */
export function setupRelizyAgents({ cwd = process.cwd(), targets, rules = true, mcp = true, dryRun = false, remove = false, docsDir }: SetupRelizyAgentsOptions = {}): SetupAgentsResult {
  const invalid = (targets ?? []).filter(target => !AGENT_TARGETS.includes(target))

  if (invalid.length > 0) {
    throw new Error(`Unknown agent target(s): ${invalid.join(', ')}. Available: ${AGENT_TARGETS.join(', ')}.`)
  }

  const configured = targets ?? getDefaultAgentTargets(cwd)

  return setupAgents({
    rootDir: cwd,
    targets: remove || !rules
      ? configured
      : withAgentsMd(configured),
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
