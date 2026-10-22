import type { GitCommit } from 'changelogen'
import type { Code, Heading, Link, Nodes } from 'mdast'
import type { CommitlintCommit, CommitlintRuleConfig, CommitlintRuleLevel } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import type { CommitMessageParts } from './message'
import type { WorkspacePackage } from './workspace'
import { logger } from '@maz-ui/node'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { getChangelogLinter, renderChangelogEntry } from './changelog-entry'
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

export interface RuleDefinition {
  severity: RuleSeverity
  value?: unknown
  /** Only run on conventional commits */
  conventionalOnly?: boolean
  check: (context: RuleContext) => string[] | Promise<string[]>
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

function formatScopes(scopes: string[]): string {
  const listed = scopes.slice(0, MAX_LISTED_SCOPES).join(', ')
  return scopes.length > MAX_LISTED_SCOPES ? `${listed}, ...` : listed
}

/**
 * The built-in rules, with their default severity and value.
 */
export const BUILT_IN_RULES: Record<string, RuleDefinition> = {
  'header-format': {
    severity: 'error',
    check: ({ parts }) => {
      const { header } = parts
      if (header !== header.trim()) {
        return ['The header must not start or end with whitespace']
      }
      if (STRICT_HEADER_PATTERN.test(header)) {
        return []
      }
      const example = 'e.g. "feat(core): add the commitlint command"'
      if (header.startsWith('Revert "')) {
        return [`Reverts must follow the format "revert: <reverted header>", not the default git message`]
      }
      if (/^[a-z]+(?:\([^)]*\))?!?:\S/i.test(header)) {
        return [`A space is required after the colon, ${example}`]
      }
      if (/^[A-Z]+(?:\([^)]*\))?!?: /.test(header) || /^[a-z]*[A-Z]\w*(?:\([^)]*\))?!?: /.test(header)) {
        return [`The type must be lowercase, ${example}`]
      }
      const scope = /^[a-z]+\((?<scope>[^)]*)\)/.exec(header)?.groups?.scope
      if (scope !== undefined && (!scope || /\s/.test(scope))) {
        return [`The scope must not be empty or contain spaces, ${example}`]
      }
      return [`The header must follow the format "type(scope)!: subject", ${example}`]
    },
  },
  'header-max-length': {
    severity: 'error',
    value: 500,
    check: ({ parts, value }) => {
      const max = Number(value)
      return parts.header.length > max
        ? [`The header must not be longer than ${max} characters (${parts.header.length})`]
        : []
    },
  },
  'type-enum': {
    severity: 'error',
    conventionalOnly: true,
    check: ({ commit, config, value }) => {
      const types = [...Object.keys(config.types ?? {}), ...(Array.isArray(value) ? value as string[] : [])]
      return types.includes(commit.type)
        ? []
        : [`The type "${commit.type}" is not one of the relizy types: ${types.join(', ')}`]
    },
  },
  'scope-enum': {
    severity: 'error',
    conventionalOnly: true,
    check: ({ commit, allowedScopes, packages }) => {
      if (!commit.scope || !allowedScopes || allowedScopes.includes(commit.scope)) {
        return []
      }
      const hint = packages.length > 0 ? 'Use a workspace package or one of' : 'Use one of'
      return [`The scope "${commit.scope}" is not allowed. ${hint}: ${formatScopes(allowedScopes)}`]
    },
  },
  'scope-required': {
    severity: 'off',
    value: 'always',
    conventionalOnly: true,
    check: ({ commit, packages, value }) => {
      if (value === 'never') {
        return commit.scope ? ['The scope must be empty'] : []
      }
      if (commit.scope) {
        return []
      }
      if (value !== 'when-bumping') {
        return ['A scope is required, e.g. "feat(core): ..."']
      }
      if (!commit.bump) {
        return []
      }
      if (packages.length === 0) {
        return [`A scope is required for the commits that bump the version (${commit.bump})`]
      }
      // Unknown files (e.g. during a rebase): nothing to compare
      if (!commit.packages || commit.packages.length === 0) {
        return []
      }
      return [`A scope is required: this ${commit.bump} commit touches ${commit.packages.join(', ')}, e.g. "${commit.type}(${findPackageByScope(commit.packages[0]!, packages)?.scopes[0] ?? 'package'}): ..."`]
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
      const touched = commit.packages && commit.packages.length > 0 ? `it touches ${commit.packages.join(', ')}` : 'it only touches files outside the packages'
      return [`The scope "${commit.scope}" designates ${pkg.path}, but ${touched}`]
    },
  },
  'subject-case': {
    severity: 'error',
    conventionalOnly: true,
    check: ({ commit }) =>
      // An uppercase first letter followed by a non uppercase one: acronyms ("API ...") are fine
      /^[A-Z][^A-Z]/.test(commit.subject)
        ? ['The subject must not start with an uppercase letter, relizy capitalizes it in the changelog']
        : [],
  },
  'subject-full-stop': {
    severity: 'error',
    conventionalOnly: true,
    check: ({ commit }) =>
      commit.subject.endsWith('.') && !commit.subject.endsWith('...')
        ? ['The subject must not end with a period']
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
      let word = subject.toLowerCase()
      while (word.endsWith('.') || word.endsWith('!')) {
        word = word.slice(0, -1)
      }
      if (GENERIC_SUBJECTS.has(word)) {
        return [`The subject "${subject}" does not describe the change`]
      }
      return words < minWords && subject.length < minLength
        ? [`The subject is too short: write at least ${minWords} words or ${minLength} characters describing the change`]
        : []
    },
  },
  'body-leading-blank': {
    severity: 'error',
    check: ({ parts }) => parts.hasLeadingBlank ? [] : ['A blank line is required between the header and the body'],
  },
  'body-no-headings': {
    severity: 'error',
    check: ({ parts }) =>
      findNodes<Heading>(parseMarkdown(parts.body), 'heading')
        .map(heading => `Markdown headings are not allowed in the body ("${'#'.repeat(heading.depth)} ..."): copied under the commit in the changelog, they break its structure`),
  },
  'body-markdown': {
    severity: 'error',
    check: ({ parts }) => {
      const problems: string[] = []
      const fences = parts.body.split('\n').filter(line => /^ {0,3}(?:`{3,}|~{3,})/.test(line)).length
      if (fences % 2 === 1) {
        problems.push('A code block of the body is not closed')
      }
      for (const link of findNodes<Link>(parseMarkdown(parts.body), 'link')) {
        if (!link.url) {
          problems.push('A link of the body has no URL')
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
      // A breaking commit is also listed in the breaking changes section: same problems twice
      return [...new Set(problems)].map(problem => `The body would break the changelog formatting: ${problem}`)
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
        ? ['"breaking change:" outside a "BREAKING CHANGE:" footer makes relizy bump the major version. Rephrase it, or use a "BREAKING CHANGE:" footer or "!" if the change is breaking']
        : []
    },
  },
  'no-breaking': {
    severity: 'off',
    check: ({ commit }) => commit.isBreaking ? ['Breaking changes are not allowed'] : [],
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
