import type { GitCommit } from 'changelogen'
import type { CommitlintCommit, CommitlintCustomRule, CommitlintCustomRuleOutcome } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import type { RuleContext, RuleSeverity } from './rules'
import type { WorkspacePackage } from './workspace'
import { logger } from '@maz-ui/node'
import { parseCommits } from 'changelogen'
import { isAllowedCommit } from '../repo'
import { determineSemverChange } from '../version'
import { getChangelogTitle } from './changelog-entry'
import { isIgnoredCommitMessage, splitCommitMessage } from './message'
import { BUILT_IN_RULES, normalizeRuleConfig, STRICT_HEADER_PATTERN } from './rules'
import { getAllowedScopes, getPackagesOfFiles, getWorkspacePackages } from './workspace'

export interface CommitlintProblem {
  rule: string
  severity: Exclude<RuleSeverity, 'off'>
  message: string
}

export interface CommitlintResult {
  commit: CommitlintCommit
  /** Ignored commits (merge, fixup, release...) are not linted */
  ignored: boolean
  /** No error (warnings allowed) */
  valid: boolean
  problems: CommitlintProblem[]
  /** Title of the changelog section of the commit, `undefined` when it does not appear in the changelog */
  changelogTitle?: string
  /** The commit as parsed by relizy, `undefined` when the header is not a conventional commit */
  gitCommit?: GitCommit
}

export interface LintCommitMessageOptions {
  config: ResolvedRelizyConfig
  /** Changed files of the commit, relative to the repository root */
  files?: string[]
  hash?: string
  /** Workspace packages, read from the config when not given */
  packages?: WorkspacePackage[]
}

/** The raw scope of the header: relizy maps it through `scopeMap` */
const LOOSE_SCOPE_PATTERN = /^[^(:]*\((?<scope>[^)]*)\)!?: /

/** Parse a message like relizy does when it reads the git history */
function parseWithRelizy(header: string, body: string, hash: string | undefined, config: ResolvedRelizyConfig): GitCommit | undefined {
  const [parsed] = parseCommits([{
    message: header,
    body,
    shortHash: hash?.slice(0, 7) ?? '',
    author: { name: '', email: '' },
  }], { ...config, from: config.from ?? '', to: config.to ?? 'HEAD' })
  if (!parsed) {
    return undefined
  }
  // The commit being created has no hash yet: no empty hash reference in its changelog entry
  return { ...parsed, references: parsed.references.filter(reference => reference.value) }
}

/** The version bump the commit triggers, as computed by relizy for a release */
function getBump(gitCommit: GitCommit | undefined, config: ResolvedRelizyConfig): CommitlintCommit['bump'] {
  if (!gitCommit) {
    return undefined
  }
  const type = config.types?.[gitCommit.type]
  if (!isAllowedCommit({ commit: gitCommit, type: type === undefined ? undefined : type, changelog: false })) {
    return undefined
  }
  return determineSemverChange([gitCommit], config.types)
}

function normalizeCustomOutcome(outcome: CommitlintCustomRuleOutcome): string | undefined {
  if (Array.isArray(outcome)) {
    const [valid, message] = outcome
    return valid ? undefined : message || 'The custom rule failed'
  }
  if (typeof outcome === 'string') {
    return outcome
  }
  return outcome ? undefined : 'The custom rule failed'
}

interface ResolvedRule {
  name: string
  severity: Exclude<RuleSeverity, 'off'>
  value: unknown
  conventionalOnly: boolean
  run: (commit: CommitlintCommit) => Promise<string[]>
}

/** The enabled rules: built-in ones with their configured level and value, then the custom ones */
function resolveRules(config: ResolvedRelizyConfig, context: Omit<RuleContext, 'value' | 'commit'>): ResolvedRule[] {
  const configured = config.commitlint?.rules ?? {}
  const customRules: Record<string, CommitlintCustomRule> = config.commitlint?.customRules ?? {}
  const rules: ResolvedRule[] = []

  for (const name of Object.keys(configured)) {
    if (!BUILT_IN_RULES[name] && !customRules[name]) {
      logger.warn(`commitlint: unknown rule "${name}" in commitlint.rules, it is ignored`)
    }
  }

  for (const [name, definition] of Object.entries(BUILT_IN_RULES)) {
    const ruleConfig = normalizeRuleConfig(name, configured[name])
    const severity = ruleConfig?.severity ?? definition.severity
    if (severity === 'off') {
      continue
    }
    const value = ruleConfig?.value ?? definition.value
    rules.push({
      name,
      severity,
      value,
      conventionalOnly: definition.conventionalOnly ?? false,
      run: async commit => await definition.check({ ...context, commit, value }),
    })
  }

  for (const [name, rule] of Object.entries(customRules)) {
    const ruleConfig = normalizeRuleConfig(name, configured[name])
    const severity = ruleConfig?.severity ?? 'error'
    if (severity === 'off') {
      continue
    }
    rules.push({
      name,
      severity,
      value: ruleConfig?.value,
      conventionalOnly: false,
      run: async (commit) => {
        const problem = normalizeCustomOutcome(await rule(commit, { value: ruleConfig?.value, config }))
        return problem ? [problem] : []
      },
    })
  }

  return rules
}

function buildCommit({ parts, gitCommit, config, files, hash, packages }: {
  parts: ReturnType<typeof splitCommitMessage>
  gitCommit?: GitCommit
  config: ResolvedRelizyConfig
  files?: string[]
  hash?: string
  packages: WorkspacePackage[]
}): CommitlintCommit {
  return {
    raw: parts.raw,
    header: parts.header,
    body: parts.body,
    footer: parts.footer,
    type: gitCommit?.type ?? '',
    scope: LOOSE_SCOPE_PATTERN.exec(parts.header)?.groups?.scope ?? '',
    subject: STRICT_HEADER_PATTERN.exec(parts.header)?.groups?.subject ?? gitCommit?.description ?? '',
    isBreaking: gitCommit?.isBreaking ?? false,
    bump: getBump(gitCommit, config),
    references: gitCommit?.references ?? [],
    files,
    packages: files ? getPackagesOfFiles(files, packages) : undefined,
    hash,
  }
}

/**
 * Lint a commit message with the relizy config: the same parser and types as the
 * release, the workspace packages for the scopes, the changelog rendering for the body.
 */
export async function lintCommitMessage(message: string, options: LintCommitMessageOptions): Promise<CommitlintResult> {
  const { config, files, hash } = options
  const parts = splitCommitMessage(message)
  const bodyWithFooter = [parts.body, parts.footer].filter(Boolean).join('\n\n')
  const gitCommit = parseWithRelizy(parts.header, bodyWithFooter, hash, config)
  const packages = options.packages ?? getWorkspacePackages(config)
  const commit = buildCommit({ parts, gitCommit, config, files, hash, packages })

  const changelogTitle = gitCommit ? getChangelogTitle(gitCommit.type, config) : undefined

  if (isIgnoredCommitMessage(message, config)) {
    return { commit, ignored: true, valid: true, problems: [], changelogTitle, gitCommit }
  }

  const rules = resolveRules(config, { config, parts, gitCommit, packages, allowedScopes: getAllowedScopes(config, packages) })
  const problems: CommitlintProblem[] = []
  for (const rule of rules) {
    if (rule.conventionalOnly && !gitCommit) {
      continue
    }
    for (const problem of await rule.run(commit)) {
      problems.push({ rule: rule.name, severity: rule.severity, message: problem })
    }
  }

  return {
    commit,
    ignored: false,
    valid: problems.every(problem => problem.severity !== 'error'),
    problems,
    changelogTitle,
    gitCommit,
  }
}
