import type { LogLevel } from '@maz-ui/node'
import type { CommitlintReport, CommitlintResult, CommitlintSummary, InstalledHook, ReportEntry, ResolvedRelizyConfig } from '../core'
import { relative } from 'node:path'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import {
  assertRefAvailable,
  formatGithubAnnotations,
  formatJsonReport,
  formatTextReport,
  getCommentChar,
  getCommitMessageFile,
  getCommitsInRange,
  getPullRequestTitle,
  getStagedFiles,
  getWorkspacePackages,
  installCommitMsgHook,
  lintCommitMessage,
  loadRelizyConfig,
  readCommitMessageFile,
  renderChangelogEntry,
  resolveDefaultRangeStart,
  shouldUseColors,
  stripGitComments,
  summarizeResults,
} from '../core'

export interface CommitlintOptions {
  /**
   * Lint the message of the commit being created: the file given to the
   * `commit-msg` hook, or `.git/COMMIT_EDITMSG` when `true`.
   */
  edit?: string | boolean
  /** Lint this message */
  message?: string
  /**
   * Lint the commits after this ref. Defaults to the merge-base with the target
   * branch of the pull/merge request in CI, otherwise the last tag.
   */
  from?: string
  /**
   * Last commit of the range
   * @default 'HEAD'
   */
  to?: string
  /**
   * In the CI of a pull/merge request, also lint its title, which becomes the
   * commit message of a squash merge
   * @default config.commitlint.title
   */
  title?: boolean
  /** Print the changelog entry of each commit */
  preview?: boolean
  /**
   * `text` for people (colors in a terminal or a CI), `json` for programs and AI agents
   * @default 'text'
   */
  format?: 'text' | 'json'
  /** In the text format, only print the commits with problems, and the summary */
  quiet?: boolean
  /** Write the `commit-msg` hook instead of linting */
  install?: boolean
  /** Replace an existing `commit-msg` hook with `install` */
  force?: boolean
  /** Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`) */
  configName?: string
  logLevel?: LogLevel
  /** Pre-loaded config */
  config?: ResolvedRelizyConfig
}

export interface CommitlintRunResult extends CommitlintSummary {
  results: CommitlintResult[]
  /** The linted commits and how to fix them, unset with `install` */
  report?: CommitlintReport
  /** Set when the hook was installed */
  hook?: InstalledHook
}

/** Plain output, without the logger prefixes: it is read in the terminal of the commit, in the CI logs and by AI agents */
function print(lines: string[]) {
  for (const line of lines) {
    process.stdout.write(`${line}\n`)
  }
}

async function lintMessages(options: CommitlintOptions, config: ResolvedRelizyConfig): Promise<CommitlintReport> {
  const packages = getWorkspacePackages(config)
  const helpUrl = config.commitlint?.helpUrl

  if (options.message !== undefined) {
    const result = await lintCommitMessage(options.message, { config, packages, files: getStagedFiles(config.cwd) })
    return { mode: 'message', entries: [{ result }], helpUrl }
  }

  if (options.edit) {
    const file = typeof options.edit === 'string' ? options.edit : undefined
    const message = stripGitComments(readCommitMessageFile(file, config.cwd), getCommentChar(config.cwd))
    const result = await lintCommitMessage(message, { config, packages, files: getStagedFiles(config.cwd) })
    const path = getCommitMessageFile(file, config.cwd)
    // Relative inside the repository, absolute outside (e.g. a temporary file)
    const messageFile = relative(config.cwd, path).startsWith('..') ? path : relative(config.cwd, path)
    return { mode: 'edit', entries: [{ result }], messageFile, helpUrl }
  }

  let from = options.from
  if (!from) {
    const start = await resolveDefaultRangeStart({ cwd: config.cwd, logLevel: options.logLevel })
    logger.debug(`commitlint: linting from the ${start.reason}`)
    from = start.from
  }
  if (from) {
    assertRefAvailable(from, config.cwd)
  }

  const commits = getCommitsInRange({ from, to: options.to, cwd: config.cwd })
  const entries: ReportEntry[] = []

  // The title becomes the commit message of a squash merge, with every file of the pull request
  const pullRequest = (options.title ?? config.commitlint?.title) ? getPullRequestTitle() : undefined
  if (pullRequest) {
    const files = [...new Set(commits.flatMap(commit => commit.files))]
    entries.push({
      result: await lintCommitMessage(pullRequest.title, { config, packages, files }),
      label: pullRequest.kind === 'merge request' ? 'MR title' : 'PR title',
    })
  }

  for (const commit of commits) {
    entries.push({
      result: await lintCommitMessage(commit.message, { config, packages, files: commit.files, hash: commit.hash }),
      label: commit.hash.slice(0, 7),
    })
  }

  return { mode: 'range', entries, from, titleKind: pullRequest?.kind, helpUrl }
}

/**
 * Lint commit messages with the relizy config: the commit being created
 * (`edit`), a message, or a range of commits. Errors make `errorCount` positive.
 */
export async function commitlint(options: CommitlintOptions = {}): Promise<CommitlintRunResult> {
  const config = options.config ?? await loadRelizyConfig({
    configFile: options.configName,
    overrides: { logLevel: options.logLevel },
  })

  if (options.install) {
    const hook = installCommitMsgHook({ cwd: config.cwd, force: options.force })
    print([hook.status === 'unchanged'
      ? `The commit-msg hook already runs relizy commitlint (${hook.path})`
      : `✔ commit-msg hook ${hook.status}: ${hook.path}`])
    return { results: [], errorCount: 0, warningCount: 0, hook }
  }

  const report = await lintMessages(options, config)
  if (options.preview) {
    for (const entry of report.entries) {
      entry.preview = entry.result.gitCommit && !entry.result.ignored ? renderChangelogEntry(entry.result.gitCommit, config) : undefined
    }
  }

  if (options.format === 'json') {
    print([formatJsonReport(report)])
  }
  else {
    print(formatTextReport(report, { colors: shouldUseColors(), quiet: options.quiet }))
    if (process.env.GITHUB_ACTIONS === 'true') {
      print(formatGithubAnnotations(report))
    }
  }

  const results = report.entries.map(entry => entry.result)
  return { results, ...summarizeResults(results), report }
}
