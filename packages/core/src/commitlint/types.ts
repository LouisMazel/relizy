import type { GitCommit, Reference, SemverBumpType } from '../types'

/**
 * Severity of a commitlint rule: `error` (or `2`) fails the check, `warn` (or `1`)
 * reports without failing, `off` (or `0`) disables the rule.
 */
export type CommitlintRuleLevel = 'error' | 'warn' | 'off' | 0 | 1 | 2

/**
 * Configuration of a commitlint rule: a level, a level and a value (ESLint style),
 * or a commitlint tuple `[level, 'always', value]` to ease migrations.
 * A rule without value accepts the commitlint tuple `[level, 'always']`.
 */
export type CommitlintRuleConfig<Value = unknown>
  = | CommitlintRuleLevel
    | readonly [CommitlintRuleLevel]
    | readonly [CommitlintRuleLevel, [Value] extends [never] ? 'always' | 'never' : Value]
    | readonly [CommitlintRuleLevel, 'always' | 'never', Value]

/**
 * The built-in rules of `relizy commitlint`, with the type of their value
 * (`never` when the rule has no value).
 * @see https://relizy.dev/commitlint/rules
 */
export interface CommitlintBuiltInRules {
  /**
   * The header follows `type(scope)!: subject`.
   * @default 'error'
   */
  'header-format': never
  /**
   * Maximum length of the header.
   * @default ['error', 500]
   */
  'header-max-length': number
  /**
   * The type is one of the relizy `types`, or one of the extra types given as value.
   * @default 'error'
   */
  'type-enum': string[]
  /**
   * The scope is a workspace package, a `scopeMap` key or one of `commitlint.scopes`.
   * @default 'error'
   */
  'scope-enum': never
  /**
   * The scope is required (`'always'`), forbidden (`'never'`), or required on
   * the commits bumping a version (`'when-bumping'`).
   * @default ['off', 'always']
   */
  'scope-required': 'always' | 'never' | 'when-bumping'
  /**
   * The scope designates a package touched by the commit.
   * @default 'warn'
   */
  'scope-matches-files': never
  /**
   * The subject starts with a lowercase letter. Off by default: the changelog
   * capitalizes the subject anyway.
   * @default 'off'
   */
  'subject-case': never
  /**
   * The subject does not end with a period.
   * @default 'error'
   */
  'subject-full-stop': never
  /**
   * The subject describes the change, with a minimum of words or characters.
   * @default ['error', { minWords: 2, minLength: 15 }]
   */
  'subject-meaningful': { minWords?: number, minLength?: number }
  /**
   * A blank line separates the header from the body.
   * @default 'error'
   */
  'body-leading-blank': never
  /**
   * The body has no markdown headings, which would break the changelog.
   * @default 'error'
   */
  'body-no-headings': never
  /**
   * The markdown of the body is valid: code blocks closed, links with a URL.
   * @default 'error'
   */
  'body-markdown': never
  /**
   * The commit, rendered as in the changelogs, passes the lint of the changelogs.
   * @default 'error'
   */
  'body-changelog-lint': never
  /**
   * A breaking change is only declared with `!` in the header or a `BREAKING CHANGE:`
   * footer, as relizy bumps the major version wherever `breaking change:` appears.
   * @default 'error'
   */
  'body-breaking-change': never
  /**
   * Breaking changes are not allowed.
   * @default 'off'
   */
  'no-breaking': never
  /**
   * The message does not credit an AI tool: no AI co-author (`Co-authored-by: Claude <noreply@anthropic.com>`),
   * no session trailer (`Claude-Session:`), no "Generated with" line. The value adds
   * names or emails of AI authors (matched as substrings) and trailers.
   * @default 'error'
   */
  'no-ai-attribution': { authors?: string[], trailers?: string[] }
}

/** The name of a built-in rule, e.g. `'header-format'` */
export type CommitlintRuleName = keyof CommitlintBuiltInRules

/**
 * Configuration of the built-in rules, typed per rule, and of the custom rules
 * (any other name). Each entry is a `CommitlintRuleConfig`.
 */
export type CommitlintRulesConfig = {
  [Name in keyof CommitlintBuiltInRules]?: CommitlintRuleConfig<CommitlintBuiltInRules[Name]>
} & Record<string, CommitlintRuleConfig>

/**
 * A commit message parsed by the linter, with the commitlint field names,
 * enriched with what the linter knows about the commit.
 */
export interface CommitlintCommit {
  /** Full message, comments removed */
  raw: string
  /** First line of the message */
  header: string
  /** Text between the header and the footer */
  body: string
  /** Trailing block of `Token: value` lines (`BREAKING CHANGE:`, `Closes #12`...) */
  footer: string
  /** Type, empty when the header is not a conventional commit */
  type: string
  /** Scope, as written in the header */
  scope: string
  /** Description of the header, as written */
  subject: string
  /** Breaking change as detected by relizy (`!` or `breaking change:` in the body) */
  isBreaking: boolean
  /** Version bump the commit triggers, computed by relizy from `types` */
  bump?: SemverBumpType
  /** Pull request, issue and hash references found by relizy */
  references: Reference[]
  /** Changed files (staged files, or the files of the commit in a range), when known */
  files?: string[]
  /** Names of the workspace packages touched by `files` */
  packages?: string[]
  /** Hash of the commit, when linting a range */
  hash?: string
}

/** What a custom rule receives with the commit: its configured value and the config of the tool */
export interface CommitlintCustomRuleContext<Config = unknown> {
  /** Value configured for the rule (`['error', value]`) */
  value: unknown
  /** The config given to the linter by the tool running it, as is */
  config: Config
}

// An interface rather than a function type: the config of a tool can refer to its own custom rules
/**
 * A rule written as a function, possibly async. Returns `true` when the commit
 * is valid, an error message (or `false`) otherwise, or a commitlint-style
 * `[valid, message?]` tuple so `commitlint-plugin-function-rules` rules can be copied as is.
 * @example
 * ```ts
 * const noWip: CommitlintCustomRule = commit => !commit.subject.startsWith('wip') || 'The subject must not start with "wip"'
 * ```
 */
export interface CommitlintCustomRule<Config = unknown> {
  (commit: CommitlintCommit, context: CommitlintCustomRuleContext<Config>): CommitlintCustomRuleOutcome | Promise<CommitlintCustomRuleOutcome>
}

/** What a custom rule returns: `true` (valid), `false` or an error message (invalid), or `[valid, message?]` */
export type CommitlintCustomRuleOutcome = boolean | string | [boolean, string?]

/**
 * Tool checking the changelog entry of a commit, as written in the CHANGELOG.md
 * files (`body-changelog-lint`):
 * - `auto`: the ESLint of the project when it lints the CHANGELOG.md files, otherwise `oxc`;
 * - `eslint`: the ESLint of the project on the whole entry, an error when it does not lint the CHANGELOG.md files;
 * - `oxc`: a syntax check of the JavaScript, TypeScript and JSON code blocks of the entry.
 */
export type CommitlintChangelogLinter = 'auto' | 'eslint' | 'oxc'

/**
 * Checks a changelog entry the way the release would: returns the problems that
 * would make the formatting of the CHANGELOG.md files fail.
 */
export interface ChangelogLinter {
  /** Tool used, reported in the fix suggestion of the rule */
  name: 'eslint' | 'oxc'
  /** Lints the markdown of a changelog, resolves to the messages of the problems found (empty when there are none) */
  lint: (markdown: string) => Promise<string[]>
}

/**
 * How a tool writes its changelog, for the rule `body-changelog-lint`: the
 * commit as it appears in the changelog, and the tool checking it.
 */
export interface ChangelogChecks {
  /**
   * Whether the body of the commits is written in the changelog
   * @default true
   */
  includeCommitBody?: boolean
  /** Renders the commit as written in the changelog, `undefined` when it does not appear in it */
  renderEntry: (commit: GitCommit) => string | undefined
  /** The linter of the changelog entries */
  getLinter: () => Promise<ChangelogLinter>
}
