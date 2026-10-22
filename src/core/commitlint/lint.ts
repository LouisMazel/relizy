import type { GitCommit } from 'changelogen'
import type { CommitlintCommit, CommitlintCustomRule, CommitlintCustomRuleOutcome } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import type { RuleContext, RuleProblem, RuleSeverity } from './rules'
import type { WorkspacePackage } from './workspace'
import { logger } from '@maz-ui/node'
import { parseCommits } from 'changelogen'
import { isAllowedCommit } from '../repo'
import { determineSemverChange } from '../version'
import { getChangelogTitle } from './changelog-entry'
import { isIgnoredCommitMessage, splitCommitMessage } from './message'
import { BUILT_IN_RULES, normalizeRuleConfig, STRICT_HEADER_PATTERN } from './rules'
import { suggestHeader } from './suggest'
import { getAllowedScopes, getPackagesOfFiles, getWorkspacePackages } from './workspace'

/** Documentation of the built-in rules */
export const COMMITLINT_RULES_URL = 'https://relizy.dev/commitlint/rules'

export interface CommitlintProblem {
  rule: string
  severity: Exclude<RuleSeverity, 'off'>
  /** What is wrong */
  message: string
  /** How to fix it */
  fix?: string
  /** Documentation of the rule (built-in rules only) */
  url?: string
}

export interface CommitlintSuggestion {
  /** The header with the safe fixes applied */
  header: string
  /** Rules still failing with the suggested header */
  remainingRules: string[]
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
  /** A fixed header, when some errors of the header can be fixed safely */
  suggestion?: CommitlintSuggestion
}

export interface LintCommitMessageOptions {
  config: ResolvedRelizyConfig
  /** Changed files of the commit, relative to the repository root */
  files?: string[]
  hash?: string
  /** Workspace packages, read from the config when not given */
  packages?: WorkspacePackage[]
  /**
   * Suggest a fixed header
   * @default true
   */
  suggest?: boolean
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
  /** Documentation of the rule */
  url?: string
  run: (commit: CommitlintCommit) => Promise<RuleProblem[]>
}

/** Configs whose unknown rules were already reported: once per run, not once per commit */
const reportedConfigs = new WeakSet<object>()

function warnUnknownRules(configured: Record<string, unknown>, customRules: Record<string, CommitlintCustomRule>): void {
  if (reportedConfigs.has(configured)) {
    return
  }
  reportedConfigs.add(configured)
  for (const name of Object.keys(configured)) {
    if (!Object.hasOwn(BUILT_IN_RULES, name) && !customRules[name]) {
      logger.warn(`commitlint: unknown rule "${name}" in commitlint.rules, it is ignored`)
    }
  }
}

/** The enabled rules: built-in ones with their configured level and value, then the custom ones */
function resolveRules(config: ResolvedRelizyConfig, context: Omit<RuleContext, 'value' | 'commit'>): ResolvedRule[] {
  const configured = config.commitlint?.rules ?? {}
  const customRules: Record<string, CommitlintCustomRule> = config.commitlint?.customRules ?? {}
  const rules: ResolvedRule[] = []

  warnUnknownRules(configured, customRules)

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
      url: `${COMMITLINT_RULES_URL}#${name}`,
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
        const message = normalizeCustomOutcome(await rule(commit, { value: ruleConfig?.value, config }))
        return message ? [{ message }] : []
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

  const allowedScopes = getAllowedScopes(config, packages)
  const rules = resolveRules(config, { config, parts, gitCommit, packages, allowedScopes })
  const problems: CommitlintProblem[] = []
  for (const rule of rules) {
    if (rule.conventionalOnly && !gitCommit) {
      continue
    }
    for (const problem of await rule.run(commit)) {
      problems.push({ rule: rule.name, severity: rule.severity, ...problem, ...(rule.url && { url: rule.url }) })
    }
  }

  const result: CommitlintResult = {
    commit,
    ignored: false,
    valid: problems.every(problem => problem.severity !== 'error'),
    problems,
    changelogTitle,
    gitCommit,
  }

  if (options.suggest !== false && !result.valid) {
    result.suggestion = await getSuggestion(message, result, { ...options, packages }, allowedScopes)
  }

  return result
}

/** The errors a suggested header can fix */
const HEADER_RULES = new Set(['header-format', 'type-enum', 'scope-enum', 'subject-case', 'subject-full-stop'])

/**
 * A header with the safe fixes applied, linted again to report what remains.
 * `undefined` when it fixes none of the errors.
 */
async function getSuggestion(message: string, result: CommitlintResult, options: LintCommitMessageOptions, allowedScopes: string[] | undefined): Promise<CommitlintSuggestion | undefined> {
  const errors = result.problems.filter(problem => problem.severity === 'error').map(problem => problem.rule)
  if (!errors.some(rule => HEADER_RULES.has(rule))) {
    return undefined
  }

  const header = suggestHeader(result.commit.header, { types: Object.keys(options.config.types ?? {}), allowedScopes })
  if (!header) {
    return undefined
  }

  const [, ...rest] = message.split('\n')
  const suggested = await lintCommitMessage([header, ...rest].join('\n'), { ...options, suggest: false })
  const remainingRules = [...new Set(suggested.problems.filter(problem => problem.severity === 'error').map(problem => problem.rule))]
  return remainingRules.length < new Set(errors).size ? { header, remainingRules } : undefined
}
