import type { LogLevel } from '@maz-ui/node'
import type { CommitlintResult, CommitlintSummary, InstalledHook, ResolvedRelizyConfig } from '../core'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import {
  formatCommitResult,
  formatSummary,
  getCommentChar,
  getCommitsInRange,
  getStagedFiles,
  getWorkspacePackages,
  installCommitMsgHook,
  lintCommitMessage,
  loadRelizyConfig,
  readCommitMessageFile,
  renderChangelogEntry,
  resolveDefaultRangeStart,
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
  /** Print the changelog entry of each commit */
  preview?: boolean
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
  /** Set when the hook was installed */
  hook?: InstalledHook
}

/** Plain output, without the logger prefixes: it is read in the terminal of the commit and in the CI logs */
function print(lines: string[]) {
  for (const line of lines) {
    process.stdout.write(`${line}\n`)
  }
}

async function lintMessages(options: CommitlintOptions, config: ResolvedRelizyConfig): Promise<CommitlintResult[]> {
  const packages = getWorkspacePackages(config)

  if (options.edit || options.message !== undefined) {
    const message = options.message ?? stripGitComments(
      readCommitMessageFile(typeof options.edit === 'string' ? options.edit : undefined, config.cwd),
      getCommentChar(config.cwd),
    )
    return [await lintCommitMessage(message, { config, packages, files: getStagedFiles(config.cwd) })]
  }

  let from = options.from
  if (!from) {
    const start = await resolveDefaultRangeStart({ cwd: config.cwd, logLevel: options.logLevel })
    logger.debug(`commitlint: linting from the ${start.reason}`)
    from = start.from
  }

  const commits = getCommitsInRange({ from, to: options.to, cwd: config.cwd })
  const results: CommitlintResult[] = []
  for (const commit of commits) {
    results.push(await lintCommitMessage(commit.message, { config, packages, files: commit.files, hash: commit.hash }))
  }
  return results
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

  const results = await lintMessages(options, config)
  const isRange = !options.edit && options.message === undefined

  for (const result of results) {
    print(formatCommitResult(result, { showHash: isRange }))
    if (options.preview && result.gitCommit && !result.ignored) {
      const entry = renderChangelogEntry(result.gitCommit, config)
      print(entry ? ['', ...entry.split('\n').map(line => `    ${line}`), ''] : [])
    }
  }

  if (isRange && results.length === 0) {
    print(['No commit to lint'])
  }

  const summary = summarizeResults(results)
  print(formatSummary(summary, config.commitlint?.helpUrl))

  return { results, ...summary }
}
