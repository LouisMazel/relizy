import type { GitCommit } from 'changelogen'
import type { Code, Heading, Link, Nodes } from 'mdast'
import type { CommitlintCommit, CommitlintRuleConfig, CommitlintRuleLevel, CommitlintRuleName } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import type { CommitMessageParts } from './message'
import type { WorkspacePackage } from './workspace'
import { logger } from '@maz-ui/node'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { getChangelogLinter, renderChangelogEntry } from './changelog-entry'
import { findClosest } from './suggest'
import { findPackageByScope } from './workspace'

export type RuleSeverity = 'error' | 'warn' | 'off'

/**
 * What a rule receives to check a commit.
 */
export interface RuleContext {
  config: ResolvedRelizyConfig
  commit: CommitlintCommit
  parts: CommitMessageParts
  /** The commit as parsed by relizy, `undefined` when the header is not a conventional commit */
  gitCommit?: GitCommit
  packages: WorkspacePackage[]
  /** `undefined` when any scope is allowed */
  allowedScopes?: string[]
  /** Configured value of the rule, or its default value */
  value: unknown
}

/** A problem found by a rule: what is wrong, and how to fix it */
export interface RuleProblem {
  message: string
  fix?: string
}

export interface RuleDefinition {
  severity: RuleSeverity
  value?: unknown
  /** Only run on conventional commits */
  conventionalOnly?: boolean
  check: (context: RuleContext) => RuleProblem[] | Promise<RuleProblem[]>
}

/** `type(scope)!: subject`, lowercase type, a space after the colon */
export const STRICT_HEADER_PATTERN = /^(?<type>[a-z]+)(?:\((?<scope>[^()\s]+)\))?(?<breaking>!)?: (?<subject>\S.*)$/

/** Subjects that do not describe anything */
const GENERIC_SUBJECTS = new Set(['wip', 'fix', 'fixes', 'fixed', 'update', 'updates', 'updated', 'change', 'changes', 'changed', 'misc', 'stuff', 'tmp', 'temp', 'test', 'tests', 'cleanup', 'clean', 'refactor', 'minor', 'typo', 'typos', 'improvements', 'tweaks'])

const MAX_LISTED_SCOPES = 20

function parseMarkdown(markdown: string) {
  return fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
}

function findNodes<T extends Nodes>(root: Nodes, type: T['type']): T[] {
  const found: T[] = []
  const visit = (node: Nodes) => {
    if (node.type === type) {
      found.push(node as T)
    }
    if ('children' in node) {
      node.children.forEach(child => visit(child as Nodes))
    }
  }
  visit(root)
  return found
}

/** Text of a markdown node, for the messages */
function toPlainText(node: Nodes): string {
  if ('value' in node && typeof node.value === 'string') {
    return node.value
  }
  return 'children' in node ? (node.children as Nodes[]).map(toPlainText).join('') : ''
}

const MAX_LISTED_PACKAGES = 3

/** `a, b, c and 4 more` */
function formatPackageNames(names: string[]): string {
  const listed = names.slice(0, MAX_LISTED_PACKAGES).join(', ')
  return names.length > MAX_LISTED_PACKAGES ? `${listed} and ${names.length - MAX_LISTED_PACKAGES} more` : listed
}

function formatScopes(scopes: string[]): string {
  const listed = scopes.slice(0, MAX_LISTED_SCOPES).join(', ')
  return scopes.length > MAX_LISTED_SCOPES ? `${listed}, ...` : listed
}

/** `did you mean "nuxt"? ` when a candidate is close enough */
function didYouMean(word: string, candidates: string[]): string {
  const closest = findClosest(word, candidates)
  return closest ? `did you mean "${closest}"? ` : ''
}

const HEADER_EXAMPLE = 'e.g. "feat(core): add the parser"'

/**
 * The built-in rules, with their default severity and value.
 */
export const BUILT_IN_RULES: Record<CommitlintRuleName, RuleDefinition> = {
  'header-format': {
    severity: 'error',
    check: ({ parts, config }) => {
      const { header } = parts
      if (header !== header.trim()) {
        return [{ message: 'The header starts or ends with whitespace', fix: 'remove the spaces around the header' }]
      }
      if (STRICT_HEADER_PATTERN.test(header)) {
        return []
      }
      if (header.startsWith('Revert "')) {
        const fix = config.types?.revert
          ? 'write it as "revert: <reverted header>"'
          : `rewrite it as a conventional commit, e.g. "fix(core): revert the parser change", or add a "revert" type to the relizy types`
        return [{ message: 'The header is the default revert message of git', fix }]
      }
      if (/^\w+(?:\([^)]*\))?!? +:/.test(header)) {
        return [{ message: 'There is a space before the colon', fix: `write "type(scope): subject", ${HEADER_EXAMPLE}` }]
      }
      if (/^[a-z]+(?:\([^)]*\))?!?:\S/i.test(header)) {
        return [{ message: 'A space is missing after the colon', fix: `write "type(scope): subject", ${HEADER_EXAMPLE}` }]
      }
      const type = /^(?<type>\w+)(?:\([^)]*\))?!? ?: /.exec(header)?.groups?.type
      if (type && type !== type.toLowerCase()) {
        return [{ message: `The type "${type}" is not lowercase`, fix: `write "${type.toLowerCase()}"` }]
      }
      const scope = /^[a-z]+\((?<scope>[^)]*)\)/.exec(header)?.groups?.scope
      if (scope !== undefined && (!scope || /\s/.test(scope))) {
        return [{ message: 'The scope is empty or contains spaces', fix: `use a single word, ${HEADER_EXAMPLE}` }]
      }
      return [{ message: 'The header is not a conventional commit', fix: `write "type(scope): subject", ${HEADER_EXAMPLE}` }]
    },
  },
  'header-max-length': {
    severity: 'error',
    value: 500,
    check: ({ parts, value }) => {
      const max = Number(value)
      return parts.header.length > max
        ? [{ message: `The header is ${parts.header.length} characters long, the maximum is ${max}`, fix: 'shorten the subject and move the details to the body' }]
        : []
    },
  },
  'type-enum': {
    severity: 'error',
    conventionalOnly: true,
    check: ({ commit, config, value }) => {
      const types = [...Object.keys(config.types ?? {}), ...(Array.isArray(value) ? value as string[] : [])]
      // A known type in the wrong case is reported by header-format
      return types.includes(commit.type.toLowerCase())
        ? []
        : [{ message: `The type "${commit.type}" is unknown to relizy`, fix: `${didYouMean(commit.type, types)}use one of: ${types.join(', ')}` }]
    },
  },
  'scope-enum': {
    severity: 'error',
    conventionalOnly: true,
    check: ({ commit, allowedScopes, packages }) => {
      if (!commit.scope || !allowedScopes || allowedScopes.includes(commit.scope)) {
        return []
      }
      const allowed = packages.length > 0 ? 'use a workspace package or one of' : 'use one of'
      return [{ message: `The scope "${commit.scope}" is not allowed`, fix: `${didYouMean(commit.scope, allowedScopes)}${allowed}: ${formatScopes(allowedScopes)}` }]
    },
  },
  'scope-required': {
    severity: 'off',
    value: 'always',
    conventionalOnly: true,
    check: ({ commit, packages, value }) => {
      if (value === 'never') {
        return commit.scope ? [{ message: 'The scope is not allowed in this project', fix: `remove "(${commit.scope})"` }] : []
      }
      if (commit.scope) {
        return []
      }
      if (value !== 'when-bumping') {
        return [{ message: 'The scope is missing', fix: `add one, e.g. "${commit.type}(core): ${commit.subject}"` }]
      }
      if (!commit.bump) {
        return []
      }
      if (packages.length === 0) {
        return [{ message: `The scope is missing on a commit that bumps the version (${commit.bump})`, fix: `add one, e.g. "${commit.type}(core): ${commit.subject}"` }]
      }
      // Unknown files (e.g. during a rebase): nothing to compare
      if (!commit.packages || commit.packages.length === 0) {
        return []
      }
      const scope = findPackageByScope(commit.packages[0]!, packages)?.scopes[0] ?? 'package'
      return [{
        message: `The scope is missing on a ${commit.bump} commit touching ${formatPackageNames(commit.packages)}`,
        fix: commit.packages.length > 1
          ? `add the scope of the main package, e.g. "${commit.type}(${scope}): ${commit.subject}", or split the commit per package`
          : `add the scope of the package: "${commit.type}(${scope}): ${commit.subject}"`,
      }]
    },
  },
  'scope-matches-files': {
    severity: 'warn',
    conventionalOnly: true,
    check: ({ commit, packages }) => {
      const pkg = commit.scope ? findPackageByScope(commit.scope, packages) : undefined
      if (!pkg || !commit.files || commit.files.length === 0 || commit.packages?.includes(pkg.name)) {
        return []
      }
      const touched = commit.packages && commit.packages.length > 0
        ? { message: `it touches ${formatPackageNames(commit.packages)}`, fix: 'use the scope of the touched package, or split the commit per package' }
        : { message: 'it only touches files outside the packages', fix: 'use a scope describing these files, or no scope' }
      return [{ message: `The scope "${commit.scope}" designates ${pkg.path}, but ${touched.message}`, fix: touched.fix }]
    },
  },
  'subject-case': {
    severity: 'error',
    conventionalOnly: true,
    check: ({ commit }) =>
      // An uppercase first letter followed by a non uppercase one: acronyms ("API ...") are fine
      /^[A-Z][^A-Z]/.test(commit.subject)
        ? [{ message: 'The subject starts with an uppercase letter', fix: 'start it lowercase, relizy capitalizes it in the changelog' }]
        : [],
  },
  'subject-full-stop': {
    severity: 'error',
    conventionalOnly: true,
    check: ({ commit }) =>
      commit.subject.endsWith('.') && !commit.subject.endsWith('...')
        ? [{ message: 'The subject ends with a period', fix: 'remove the final period' }]
        : [],
  },
  'subject-meaningful': {
    severity: 'error',
    value: { minWords: 2, minLength: 15 },
    conventionalOnly: true,
    check: ({ commit, value }) => {
      const { minWords = 2, minLength = 15 } = (value ?? {}) as { minWords?: number, minLength?: number }
      const subject = commit.subject.trim()
      const words = subject.split(/\s+/).filter(Boolean).length
      const fix = `describe what changed, in at least ${minWords} words or ${minLength} characters`
      let word = subject.toLowerCase()
      while (word.endsWith('.') || word.endsWith('!')) {
        word = word.slice(0, -1)
      }
      if (GENERIC_SUBJECTS.has(word)) {
        return [{ message: `The subject "${subject}" does not describe the change`, fix }]
      }
      return words < minWords && subject.length < minLength
        ? [{ message: `The subject "${subject}" is too short`, fix }]
        : []
    },
  },
  'body-leading-blank': {
    severity: 'error',
    check: ({ parts }) => parts.hasLeadingBlank
      ? []
      : [{ message: 'The body starts right after the header', fix: 'add a blank line between the header and the body' }],
  },
  'body-no-headings': {
    severity: 'error',
    check: ({ parts }) =>
      findNodes<Heading>(parseMarkdown(parts.body), 'heading').map(heading => ({
        message: `The body contains a markdown heading ("${'#'.repeat(heading.depth)} ${toPlainText(heading)}")`,
        fix: 'use a bold line or a list instead: copied under the commit in the changelog, a heading breaks its structure',
      })),
  },
  'body-markdown': {
    severity: 'error',
    check: ({ parts }) => {
      const problems: RuleProblem[] = []
      const fences = parts.body.split('\n').filter(line => /^ {0,3}(?:`{3,}|~{3,})/.test(line)).length
      if (fences % 2 === 1) {
        problems.push({ message: 'A code block of the body is not closed', fix: 'close it with a ``` line' })
      }
      for (const link of findNodes<Link>(parseMarkdown(parts.body), 'link')) {
        if (!link.url) {
          problems.push({ message: `The link "${toPlainText(link)}" of the body has no URL`, fix: 'add its URL, or remove the link' })
        }
      }
      return problems
    },
  },
  'body-changelog-lint': {
    severity: 'error',
    conventionalOnly: true,
    check: async ({ config, gitCommit, parts }) => {
      if (!gitCommit || !parts.body || config.changelog?.includeCommitBody === false) {
        return []
      }
      // The code blocks are what breaks the changelog formatting (the rest of the
      // markdown is covered by the rules above): skip loading the linter without them
      if (findNodes<Code>(parseMarkdown(parts.body), 'code').length === 0) {
        return []
      }
      const entry = renderChangelogEntry(gitCommit, config)
      if (!entry) {
        return []
      }
      const linter = await getChangelogLinter(config.cwd)
      const problems = await linter.lint(`# Changelog\n\n## v0.0.0\n\n${entry}\n`)
      const fix = linter.name === 'eslint'
        ? 'fix the code block: the body is linted like the CHANGELOG.md files by the ESLint of the project'
        : 'make the code block a complete program, e.g. "export default defineConfig({ ... })" rather than a bare object'
      // A breaking commit is also listed in the breaking changes section: same problems twice
      return [...new Set(problems)].map(problem => ({ message: `The body would break the changelog formatting: ${problem}`, fix }))
    },
  },
  'body-breaking-change': {
    severity: 'error',
    check: ({ parts }) => {
      const isMention = (line: string) => /breaking[ -]change:/i.test(line)
      const footerLines = parts.footer.split('\n')
      const misplaced = [
        ...parts.body.split('\n').filter(isMention),
        ...footerLines.filter(line => isMention(line) && !/^BREAKING[ -]CHANGE: /.test(line)),
      ]
      return misplaced.length > 0
        ? [{
            message: '"breaking change:" appears outside a "BREAKING CHANGE:" footer: relizy would bump the major version',
            fix: 'rephrase it, or if the change is breaking, declare it with "!" or a "BREAKING CHANGE:" footer',
          }]
        : []
    },
  },
  'no-breaking': {
    severity: 'off',
    check: ({ commit }) => commit.isBreaking
      ? [{ message: 'Breaking changes are not allowed', fix: 'remove the "!" and the "BREAKING CHANGE:" footer' }]
      : [],
  },
}

const LEVELS: Record<string | number, RuleSeverity> = {
  error: 'error',
  warn: 'warn',
  off: 'off',
  0: 'off',
  1: 'warn',
  2: 'error',
}

export interface NormalizedRuleConfig {
  severity: RuleSeverity
  /** `undefined` when the config sets no value */
  value?: unknown
}

/**
 * `'error'`, `['error', value]` or a commitlint tuple `[2, 'always', value]`.
 */
export function normalizeRuleConfig(name: string, config: CommitlintRuleConfig | undefined): NormalizedRuleConfig | undefined {
  if (config === undefined) {
    return undefined
  }
  const [level, ...rest] = (Array.isArray(config) ? config : [config]) as [CommitlintRuleLevel, ...unknown[]]
  const severity = LEVELS[level]
  if (!severity) {
    throw new Error(`commitlint: invalid level "${String(level)}" for the rule "${name}", use 'error', 'warn' or 'off'`)
  }
  // commitlint tuple `[level, when, value]`: `[level, value]` is the ESLint form,
  // so `['error', 'never']` keeps 'never' as the value (e.g. for scope-required)
  if (rest.length === 2 && (rest[0] === 'always' || rest[0] === 'never')) {
    if (rest[0] === 'never') {
      logger.warn(`commitlint: "never" is not supported (rule "${name}"), the value of the rule is used as is`)
    }
    return { severity, value: rest[1] }
  }
  return { severity, value: rest[0] }
}
