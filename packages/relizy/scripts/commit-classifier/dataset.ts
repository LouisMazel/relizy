import type { RawGitCommit } from '@relizy/core'
import { parseGitCommit } from '@relizy/core'

/**
 * Training examples of the commit classifier (first local model of the plan
 * "Relizy : mini-modèles embarqués"): for each conventional commit, the input
 * the model will see (the message without its type, scope and references, the
 * files touched, the diff stats) and the label taken from the type.
 */

/**
 * Labels the classifier predicts. A breaking change is not a label: it is
 * found by the static analysis of the public API, the example keeps the label
 * of its type and `breaking: true`.
 */
export const COMMIT_LABELS = [
  'feature',
  'fix',
  'refacto',
  'doc',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
] as const

export type CommitLabel = typeof COMMIT_LABELS[number]

/**
 * Conventional types and the label they give. A type missing here (`revert`,
 * `wip`, `release`, a typo...) gives no example: the commit is counted as
 * ignored, with its type, so the map can be extended from the report.
 */
export const TYPE_TO_LABEL: Record<string, CommitLabel> = {
  feat: 'feature',
  feature: 'feature',
  fix: 'fix',
  refactor: 'refacto',
  refacto: 'refacto',
  docs: 'doc',
  doc: 'doc',
  perf: 'perf',
  test: 'test',
  tests: 'test',
  build: 'build',
  deps: 'build',
  ci: 'ci',
  chore: 'chore',
  style: 'chore',
}

/** One example of the dataset, one JSON line of the output */
export interface CommitExample {
  /** Repository the commit comes from: `owner/name` when known, else the name of its directory; the train and test sets are split by repository */
  repo: string
  /** Where the commit was read: `git` (a local clone) or a third-party dataset (`commitsuite`) */
  source: string
  /** Full hash of the commit */
  hash: string
  /** The subject without type, scope, `!`, emoji and references to PRs or issues */
  message: string
  /** Paths of the files touched (the new path for a rename) */
  files: string[]
  /** Totals of `git log --numstat` */
  stats: DiffStats
  /** Label to predict */
  label: CommitLabel
  /** Conventional type as written in the commit, kept to revise the mapping */
  type: string
  /** `!` in the header or `BREAKING CHANGE:` in the body: kept for information, not a label */
  breaking: boolean
  /** Why the label looks wrong for the files touched (see `findSuspicion()`), absent when it looks right */
  suspect?: Suspicion
}

/** Label that contradicts the files of the commit, likely a wrong type */
export type Suspicion
  = | 'test-without-test-files'
    | 'ci-without-ci-files'
    | 'code-label-on-docs-only'
    | 'code-label-on-dependencies-only'

export interface DiffStats {
  filesChanged: number
  insertions: number
  deletions: number
  /** Files git counts as binary (no line counts) */
  binaryFiles: number
}

export interface FileStat {
  path: string
  /** null for a binary file */
  insertions: number | null
  deletions: number | null
}

/** A commit as read by `readCommitLog()`, before parsing */
export interface LoggedCommit {
  hash: string
  authorName: string
  authorEmail: string
  subject: string
  body: string
  files: FileStat[]
}

/** Why a commit gave no example */
export type SkipReason = 'bot' | 'not-conventional' | 'unknown-type' | 'release' | 'empty-message' | 'too-many-files'

export type ExtractResult
  = | { kind: 'example', example: CommitExample }
    | { kind: 'skipped', reason: SkipReason, type?: string }

const RECORD_SEPARATOR = '\x1E'
const FIELD_SEPARATOR = '\x1F'

const BASE_GIT_LOG_ARGS = [
  'log',
  '--all',
  '--no-merges',
  '-z',
  '--numstat',
  '-M',
  `--format=${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${FIELD_SEPARATOR}`,
]

/**
 * Arguments of the `git log` that `parseCommitLog()` reads: one record per
 * commit (hash, author, subject, body), followed by its `--numstat -z` list.
 * Merges are left out: their message describes no change of their own.
 *
 * @param options - Filters of the history
 * @param options.since - Only the commits after this date (any date `git log --since` accepts)
 * @returns The arguments, without the leading `git`
 */
export function getGitLogArgs(options: { since?: string } = {}): string[] {
  const { since } = options
  return [
    ...BASE_GIT_LOG_ARGS,
    ...(since
      ? [`--since=${since}`]
      : []),
  ]
}

/**
 * Parses the output of `git log` run with `GIT_LOG_ARGS`.
 *
 * With `-z`, each `--numstat` entry ends with a NUL; a rename has an empty
 * path followed by the old and the new paths, and a binary file `-` counts.
 */
export function parseCommitLog(output: string): LoggedCommit[] {
  const commits: LoggedCommit[] = []

  for (const record of output.split(RECORD_SEPARATOR)) {
    if (!record.trim()) {
      continue
    }

    const [hash = '', authorName = '', authorEmail = '', subject = '', body = '', ...rest] = record.split(FIELD_SEPARATOR)
    const tokens = rest.join(FIELD_SEPARATOR).replace(/^[\0\n]+/, '').split('\0')
    const files: FileStat[] = []

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]!
      if (!token) {
        continue
      }
      const [insertions = '-', deletions = '-', path = ''] = token.split('\t')
      let filePath = path
      if (!filePath) {
        // Rename or copy: old path, then new path
        filePath = tokens[index + 2] ?? ''
        index += 2
      }
      files.push({
        path: filePath,
        insertions: insertions === '-'
          ? null
          : Number(insertions),
        deletions: deletions === '-'
          ? null
          : Number(deletions),
      })
    }

    commits.push({
      hash,
      authorName,
      authorEmail,
      subject,
      body: body.trim(),
      files,
    })
  }

  return commits
}

/** Totals of the diff of a commit */
export function computeDiffStats(files: FileStat[]): DiffStats {
  return files.reduce<DiffStats>((stats, file) => {
    stats.filesChanged++
    if (file.insertions === null || file.deletions === null) {
      stats.binaryFiles++
    }
    else {
      stats.insertions += file.insertions
      stats.deletions += file.deletions
    }
    return stats
  }, {
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
    binaryFiles: 0,
  })
}

/**
 * The description of `parseGitCommit()` (without type, scope, `!`, leading
 * emoji and `(#12)`) cleaned of the references it keeps, so the model cannot
 * learn them: `#12`, `GH-12`, `!12` (GitLab), PR and issue URLs, the
 * `closes #12` kind of mentions, and the parentheses they leave empty.
 */
export function cleanDescription(description: string): string {
  const cleaned = description
    .replace(/\s+/g, ' ')
    .replace(/https?:\/\/\S+\/(?:pull|issues|merge_requests)\/\d\S*/gi, '')
    .replace(/\b(?:clos|fix|resolv|ref|see)\w*:? ?(?:#|GH-|!)\d+/gi, '')
    .replace(/(?<![\w/])(?:#|GH-|!)\d+\b/gi, ' ')
    .replace(/\( *(?:[,;] *)?\)|\[ *\]/g, '')
    .replace(/ {2,}/g, ' ')
    .replace(/ ([,.;:])/g, '$1')
    .trim()

  return trimTrailingPunctuation(cleaned)
}

function trimTrailingPunctuation(text: string): string {
  let end = text.length
  while (end > 0 && ' ,;:-'.includes(text[end - 1]!)) {
    end--
  }
  return text.slice(0, end)
}

/** Commits written by a release tool (relizy, changelogen, semantic-release...) */
function isReleaseCommit(type: string, scope: string, description: string): boolean {
  return (type === 'chore' && scope === 'release')
    || type === 'release'
    || /^(?:release|publish|bump(?:ed)?(?: version)?(?: to)?)\s+v?\d+\.\d+/i.test(description)
}

const DOC_FILE_REGEX = /(?:^|\/)(?:readme|changelog|contributing|license)[^/]*$|\.(?:md|mdx|rst|txt)$/i
const TEST_DIR_REGEX = /(?:^|\/)(?:__tests__|__mocks__|tests?|e2e|fixtures?)\//i
const TEST_FILE_REGEX = /\.(?:spec|test)\.\w+$|(?:^|\/)(?:vitest|jest)[.-]/i
const DEPENDENCY_FILE_REGEX = /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|package-lock\.json|bun\.lockb?|renovate\.json5?)$/
const CI_DIR_REGEX = /^(?:\.github\/|\.gitlab-ci|\.gitlab\/|\.circleci\/|\.husky\/|azure-pipelines|\.travis)/i
const CI_CONFIG_REGEX = /(?:^|\/)(?:codecov|renovate|relizy\.config|release\.config|\.releaserc)[^/]*$/i

/**
 * Flags a label the files of the commit contradict: in the history of a
 * repository, a part of the types are wrong (`feat(docs): document X` on
 * Markdown only, `fix: bump vite` on the lockfile only). The example is kept,
 * flagged: `--strict` of the script leaves the flagged ones out.
 *
 * A `docs` commit changing code is not flagged: a JSDoc, a comment or the
 * site of the docs are docs too.
 */
export function findSuspicion(label: CommitLabel, files: string[]): Suspicion | undefined {
  if (files.length === 0) {
    return undefined
  }
  const some = (regex: RegExp) => files.some(file => regex.test(file))

  if (label === 'test' && !some(TEST_DIR_REGEX) && !some(TEST_FILE_REGEX)) {
    return 'test-without-test-files'
  }
  if (label === 'ci' && !some(CI_DIR_REGEX) && !some(CI_CONFIG_REGEX)) {
    return 'ci-without-ci-files'
  }
  const isCodeLabel = ['feature', 'fix', 'refacto', 'perf'].includes(label)
  if (isCodeLabel && files.every(file => DOC_FILE_REGEX.test(file))) {
    return 'code-label-on-docs-only'
  }
  if ((isCodeLabel || label === 'doc') && files.every(file => DEPENDENCY_FILE_REGEX.test(file))) {
    return 'code-label-on-dependencies-only'
  }
  return undefined
}

/** Dependency, release and CI bots: their messages are generated, not written */
const BOT_NAME_REGEX = /\[bot\]|\b(?:ro)?bot\b|^(?:renovate|dependabot|greenkeeper|github-actions|allcontributors|imgbot|pre-commit-ci|mergify|codecov)\b/i
/** `angular-robot@google.com`, `bot@renovateapp.com`, `41898282+github-actions[bot]@users.noreply.github.com` */
const BOT_EMAIL_REGEX = /\[bot\]|(?:^|[-_.+])(?:ro)?bots?@|^(?:renovate|dependabot|github-actions)\b/i

/** A commit written by a bot (Renovate, Dependabot, a project robot...), from its author name or email */
export function isBotCommit(commit: Pick<LoggedCommit, 'authorName' | 'authorEmail'>): boolean {
  return BOT_NAME_REGEX.test(commit.authorName) || BOT_EMAIL_REGEX.test(commit.authorEmail)
}

/** Options of `extractExample()` */
export interface ExtractOptions {
  /** Where the commit was read, `git` by default */
  source?: string
  /** Above this number of files, the commit is a mass change (formatting, move, lockfile) and gives no example; 0 for no limit */
  maxFiles?: number
}

/** Turns one logged commit into an example, or says why it gives none */
export function extractExample(commit: LoggedCommit, repo: string, { maxFiles = 0, source = 'git' }: ExtractOptions = {}): ExtractResult {
  if (isBotCommit(commit)) {
    return { kind: 'skipped', reason: 'bot' }
  }

  const raw: RawGitCommit = {
    message: commit.subject,
    body: commit.body,
    shortHash: commit.hash.slice(0, 7),
    hash: commit.hash,
    author: { name: commit.authorName, email: commit.authorEmail },
  }

  const parsed = parseGitCommit(raw, {})
  if (!parsed) {
    return { kind: 'skipped', reason: 'not-conventional' }
  }

  const type = parsed.type.toLowerCase()
  if (isReleaseCommit(type, parsed.scope, parsed.description)) {
    return { kind: 'skipped', reason: 'release', type }
  }

  const typeLabel = TYPE_TO_LABEL[type]
  if (!typeLabel) {
    return { kind: 'skipped', reason: 'unknown-type', type }
  }

  const message = cleanDescription(parsed.description)
  if (!message) {
    return { kind: 'skipped', reason: 'empty-message', type }
  }

  if (maxFiles > 0 && commit.files.length > maxFiles) {
    return { kind: 'skipped', reason: 'too-many-files', type }
  }

  const files = commit.files.map(file => file.path)
  const label = typeLabel
  const suspect = findSuspicion(label, files)

  return {
    kind: 'example',
    example: {
      repo,
      source,
      hash: commit.hash,
      message,
      files,
      stats: computeDiffStats(commit.files),
      label,
      type,
      breaking: parsed.isBreaking,
      ...(suspect && { suspect }),
    },
  }
}
