import type { CommitTypes, CoreLogger, GitCommit, SemverBumpType } from '../types'
import type { IgnoredCommitOptions } from './message'
import type { RuleContext, RuleProblem, RuleSeverity } from './rules'
import type { ChangelogChecks, CommitlintCommit, CommitlintCustomRule, CommitlintCustomRuleOutcome, CommitlintRulesConfig } from './types'
import type { WorkspacePackage } from './workspace'
import { parseCommits } from '../commits'
import { isIgnoredCommitMessage, splitCommitMessage } from './message'
import { BUILT_IN_RULES, normalizeRuleConfig, STRICT_HEADER_PATTERN } from './rules'
import { suggestHeader } from './suggest'
import { getAllowedScopes, getPackagesOfFiles } from './workspace'

/** Documentation of the built-in rules */
const COMMITLINT_RULES_URL = 'https://relizy.dev/commitlint/rules'

/** A rule broken by a commit message */
export interface CommitlintProblem {
  /** Name of the broken rule, built-in or custom */
  rule: string
  /** `error` makes the commit invalid, `warn` only reports */
  severity: Exclude<RuleSeverity, 'off'>
  /** What is wrong */
  message: string
  /** How to fix it */
  fix?: string
  /** Documentation of the rule (built-in rules only) */
  url?: string
}

/** A fixed header proposed for a message, with the rules it does not fix */
export interface CommitlintSuggestion {
  /** The header with the safe fixes applied */
  header: string
  /** Rules still failing with the suggested header */
  remainingRules: string[]
}

/** The result of the lint of one commit message */
export interface CommitlintResult {
  /** The parsed message */
  commit: CommitlintCommit
  /** Ignored commits (merge, fixup, release...) are not linted */
  ignored: boolean
  /** No error (warnings allowed) */
  valid: boolean
  /** Errors and warnings, empty for a valid or ignored commit */
  problems: CommitlintProblem[]
  /** Title of the changelog section of the commit, `undefined` when it does not appear in the changelog */
  changelogTitle?: string
  /** The commit as parsed like the release does, `undefined` when the header is not a conventional commit */
  gitCommit?: GitCommit
  /** A fixed header, when some errors of the header can be fixed safely */
  suggestion?: CommitlintSuggestion
}

/**
 * Title of the changelog section of a commit type, `undefined` when the commits
 * of this type never appear in the changelog.
 * @param type - Commit type, e.g. `feat`
 * @param types - The relizy commit types
 * @returns The `title` of the type, `undefined` when the type is unknown, disabled or has no title
 * @example
 * ```ts
 * getChangelogTitle('feat', { feat: { title: 'Features', semver: 'minor' } }) // 'Features'
 * getChangelogTitle('chore', { chore: false }) // undefined
 * ```
 */
export function getChangelogTitle(type: string, types: CommitTypes | undefined): string | undefined {
  const typeConfig = types?.[type]
  return typeConfig && typeof typeConfig === 'object' && typeConfig.title
    ? typeConfig.title
    : undefined
}

/**
 * What the linter knows of the project. `Config` is the type of the config of
 * the tool running the linter, which it gives to the custom rules as is.
 */
export interface LintCommitMessageOptions<Config = unknown> extends IgnoredCommitOptions {
  /**
   * The commit types: the keys are the types allowed, the title is the
   * section of the changelog and the `semver` the bump the type triggers.
   */
  types?: CommitTypes
  /** Renames the scopes of the commits (`{ ui: 'components' }`), their keys are allowed scopes */
  scopeMap?: Record<string, string>
  /** Scopes allowed in addition to the workspace packages and the keys of `scopeMap` */
  scopes?: string[]
  /** Level and value of the built-in and custom rules */
  rules?: CommitlintRulesConfig
  /** Rules written as functions, keyed by name. Their level is set in `rules` and defaults to `error` */
  customRules?: Record<string, CommitlintCustomRule<Config>>
  /** The config of the tool, given to the custom rules in their context */
  config?: Config
  /** Workspace packages, for the scopes and the files, see `getWorkspacePackages` */
  packages?: WorkspacePackage[]
  /** How the commits are written in the changelog, for the rule `body-changelog-lint` */
  changelog?: ChangelogChecks
  /** The version bump a parsed commit triggers, `undefined` when it triggers none */
  getBump?: (commit: GitCommit) => SemverBumpType | undefined
  /** Changed files of the commit, relative to the repository root */
  files?: string[]
  /** Hash of the commit, when linting a range */
  hash?: string
  /**
   * Suggest a fixed header
   * @default true
   */
  suggest?: boolean
  /** Receives the warnings, e.g. for the rules configured but unknown */
  logger?: CoreLogger
}

/** The raw scope of the header: the commit parser maps it through `scopeMap` */
const LOOSE_SCOPE_PATTERN = /^[^(:]*\((?<scope>[^)]*)\)!?: /

/** Parse a message like the release does when it reads the git history */
function parseLikeRelease(header: string, body: string, hash: string | undefined, scopeMap: Record<string, string> | undefined): GitCommit | undefined {
  const [parsed] = parseCommits([
    {
      message: header,
      body,
      shortHash: hash?.slice(0, 7) ?? '',
      author: { name: '', email: '' },
    },
  ], { scopeMap })
  if (!parsed) {
    return undefined
  }
  // The commit being created has no hash yet: no empty hash reference in its changelog entry
  return {
    ...parsed,
    references: parsed.references.filter(reference => reference.value),
  }
}

function normalizeCustomOutcome(outcome: CommitlintCustomRuleOutcome): string | undefined {
  if (Array.isArray(outcome)) {
    const [valid, message] = outcome
    return valid
      ? undefined
      : message || 'The custom rule failed'
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

function warnUnknownRules(configured: Record<string, unknown>, customRules: Record<string, unknown>, logger?: CoreLogger): void {
  if (reportedConfigs.has(configured)) {
    return
  }
  reportedConfigs.add(configured)
  for (const name of Object.keys(configured)) {
    if (!Object.hasOwn(BUILT_IN_RULES, name) && !customRules[name]) {
      logger?.warn?.(`commitlint: unknown rule "${name}" in commitlint.rules, it is ignored`)
    }
  }
}

/** The enabled rules: built-in ones with their configured level and value, then the custom ones */
function resolveRules<Config>(options: LintCommitMessageOptions<Config>, context: Omit<RuleContext, 'value' | 'commit'>): ResolvedRule[] {
  const { logger } = options
  const configured = options.rules ?? {}
  const customRules: Record<string, CommitlintCustomRule<Config>> = options.customRules ?? {}
  const rules: ResolvedRule[] = []

  warnUnknownRules(configured, customRules, logger)

  for (const [name, definition] of Object.entries(BUILT_IN_RULES)) {
    const ruleConfig = normalizeRuleConfig(name, configured[name], logger)
    const severity = ruleConfig?.severity ?? definition.severity
    if (severity === 'off') {
      continue
    }
    const value = ruleConfig?.value ?? definition.value
    // `[2, 'always']` without its number would silence the rule (NaN)
    if (typeof definition.value === 'number' && !Number.isFinite(Number(value))) {
      throw new TypeError(`commitlint: the rule "${name}" needs a number, e.g. ['error', ${definition.value}] or [2, 'always', ${definition.value}], got ${JSON.stringify(value)}`)
    }
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
    const ruleConfig = normalizeRuleConfig(name, configured[name], logger)
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
        const message = normalizeCustomOutcome(await rule(commit, { value: ruleConfig?.value, config: options.config as Config }))
        return message
          ? [
              { message },
            ]
          : []
      },
    })
  }

  return rules
}

function buildCommit({ parts, gitCommit, bump, files, hash, packages }: {
  parts: ReturnType<typeof splitCommitMessage>
  gitCommit?: GitCommit
  bump?: SemverBumpType
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
    bump,
    references: gitCommit?.references ?? [],
    files,
    packages: files
      ? getPackagesOfFiles(files, packages)
      : undefined,
    hash,
  }
}

/**
 * Lint a commit message: the same parser as the release, the workspace packages
 * for the scopes, the changelog rendering for the body. Ignored messages (merge,
 * fixup, release commits...) are returned as valid without problems. A fixed
 * header is suggested when the message is invalid and some errors come from the
 * header. Rejects when a rule is configured with an invalid level, or a numeric
 * rule with a non numeric value.
 * @param message - The full commit message
 * @param options - Project knowledge and rules, all optional
 * @returns The parsed commit, the problems and, when possible, a suggested header
 * @throws `TypeError` when a numeric built-in rule (e.g. `header-max-length`) is configured with a non numeric value; `Error` when a rule is configured with an invalid level
 * @example
 * ```ts
 * const result = await lintCommitMessage('Fix stuff.', { types: { feat: { title: 'Features' }, fix: { title: 'Bug Fixes' } } })
 * result.valid // false
 * result.problems.map(problem => problem.rule) // ['header-format']
 * ```
 */
export async function lintCommitMessage<Config = unknown>(message: string, options: LintCommitMessageOptions<Config> = {}): Promise<CommitlintResult> {
  const { files, hash, types, scopeMap, packages = [] } = options
  const parts = splitCommitMessage(message)
  const bodyWithFooter = [parts.body, parts.footer].filter(Boolean).join('\n\n')
  const gitCommit = parseLikeRelease(parts.header, bodyWithFooter, hash, scopeMap)
  const commit = buildCommit({
    parts,
    gitCommit,
    bump: gitCommit && options.getBump?.(gitCommit),
    files,
    hash,
    packages,
  })

  const changelogTitle = gitCommit
    ? getChangelogTitle(gitCommit.type, types)
    : undefined

  if (isIgnoredCommitMessage(message, options)) {
    return {
      commit,
      ignored: true,
      valid: true,
      problems: [],
      changelogTitle,
      gitCommit,
    }
  }

  const allowedScopes = getAllowedScopes({ packages, scopes: options.scopes, scopeMap })
  const rules = resolveRules(options, {
    types: types ?? {},
    parts,
    gitCommit,
    packages,
    allowedScopes,
    changelog: options.changelog,
  })
  const problems: CommitlintProblem[] = []
  for (const rule of rules) {
    if (rule.conventionalOnly && !gitCommit) {
      continue
    }
    for (const problem of await rule.run(commit)) {
      problems.push({
        rule: rule.name,
        severity: rule.severity,
        ...problem,
        ...(rule.url && { url: rule.url }),
      })
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
    result.suggestion = await getSuggestion(message, result, options, allowedScopes)
  }

  return result
}

/** The errors a suggested header can fix */
const HEADER_RULES = new Set([
  'header-format',
  'type-enum',
  'scope-enum',
  'subject-case',
  'subject-full-stop',
])

/**
 * A header with the safe fixes applied, linted again to report what remains.
 * `undefined` when it fixes none of the errors.
 */
async function getSuggestion<Config>(message: string, result: CommitlintResult, options: LintCommitMessageOptions<Config>, allowedScopes: string[] | undefined): Promise<CommitlintSuggestion | undefined> {
  const errors = result.problems.filter(problem => problem.severity === 'error').map(problem => problem.rule)
  if (!errors.some(rule => HEADER_RULES.has(rule))) {
    return undefined
  }

  // Without subject-case, the case of the subject is kept: "MazChart" is a name
  const lowercaseSubject = errors.includes('subject-case')
  const header = suggestHeader(result.commit.header, {
    types: Object.keys(options.types ?? {}),
    allowedScopes,
    lowercaseSubject,
  })
  if (!header) {
    return undefined
  }

  const [, ...rest] = message.split('\n')
  const suggested = await lintCommitMessage([header, ...rest].join('\n'), { ...options, suggest: false })
  const remainingRules = [
    ...new Set(suggested.problems.filter(problem => problem.severity === 'error').map(problem => problem.rule)),
  ]
  return remainingRules.length < new Set(errors).size
    ? { header, remainingRules }
    : undefined
}
