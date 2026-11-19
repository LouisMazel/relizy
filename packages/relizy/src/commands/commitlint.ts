import type { LogLevel } from '@maz-ui/node'
import type { CommitlintResult, PullRequestTitle } from '@relizy/core'
import type { CommitlintReport, CommitlintSummary, InstalledHook, PullRequestLint, ReportEntry, ResolvedRelizyConfig } from '../core'
import type { CommitlintTitleMode } from '../types'
import { relative } from 'node:path'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { assertRefAvailable, ensureFullHistory, getCommentChar, getCommitMessageFile, getCommitsInRange, getPullRequestTitle, getStagedFiles, readCommitMessageFile, resolveDefaultRangeStart, stripGitComments, tryGitSync } from '@relizy/core'
import { COMMIT_MSG_HOOK_COMMAND, detectMergeSquash, formatGithubAnnotations, formatJsonReport, formatTextReport, getMergePreviewPullRequest, getTitleMode, getWorkspacePackages, installCommitMsgHook, isSquashTitleFromCommit, lintCommitMessage, loadRelizyConfig, renderChangelogEntry, resolvePullRequestLint, shouldUseColors, summarizeResults, toWarnings } from '../core'

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
   * In the CI of a pull/merge request, how to lint its title, which becomes the
   * commit message of a squash merge (see `CommitlintTitleMode`): `true` is `'error'`, `false` is `'off'`
   * @default config.commitlint.title
   */
  title?: CommitlintTitleMode | boolean
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

/**
 * How to lint the title and the commits of the pull/merge request of the CI
 * job: with `commitlint.title: 'auto'`, from the merge method read from the
 * provider (`mergePreview.squash`)
 */
async function getPullRequestLint({ config, mode, kind, from, to = 'HEAD' }: {
  config: ResolvedRelizyConfig
  mode: CommitlintTitleMode
  /** Kind of the pull/merge request whose title is linted */
  kind?: PullRequestTitle['kind']
  from?: string
  to?: string
}): Promise<PullRequestLint> {
  const pullRequest = mode === 'auto'
    ? getMergePreviewPullRequest()
    : undefined
  if (!pullRequest) {
    return resolvePullRequestLint({ mode, kind })
  }

  const detection = await detectMergeSquash({ config, pullRequest, option: config.mergePreview?.squash ?? 'auto' })
  const squash = detection.squash === undefined
    ? 'merge method unknown'
    : `squash merge: ${detection.squash}`
  logger.debug(`commitlint: ${squash} (${detection.reason})`)
  const commitCount = Number(tryGitSync([
    'rev-list',
    '--no-merges',
    '--count',
    from
      ? `${from}..${to}`
      : to,
  ], { cwd: config.cwd }) ?? 0)

  return resolvePullRequestLint({
    mode,
    detection,
    titleFromCommit: isSquashTitleFromCommit({ provider: pullRequest.provider, commitCount, settings: detection }),
    kind: pullRequest.kind,
  })
}

async function lintMessages(options: CommitlintOptions, config: ResolvedRelizyConfig): Promise<CommitlintReport> {
  const packages = getWorkspacePackages(config)
  const helpUrl = config.commitlint?.helpUrl

  if (options.message !== undefined) {
    const result = await lintCommitMessage(options.message, {
      config,
      packages,
      files: getStagedFiles(config.cwd),
    })
    return {
      mode: 'message',
      entries: [
        { result },
      ],
      helpUrl,
    }
  }

  if (options.edit) {
    const file = typeof options.edit === 'string'
      ? options.edit
      : undefined
    const message = stripGitComments(readCommitMessageFile(file, config.cwd), getCommentChar(config.cwd))
    const result = await lintCommitMessage(message, {
      config,
      packages,
      files: getStagedFiles(config.cwd),
    })
    const path = getCommitMessageFile(file, config.cwd)
    // Relative inside the repository, absolute outside (e.g. a temporary file)
    const messageFile = relative(config.cwd, path).startsWith('..')
      ? path
      : relative(config.cwd, path)
    return {
      mode: 'edit',
      entries: [
        { result },
      ],
      messageFile,
      helpUrl,
    }
  }

  // A range needs the history: a shallow CI clone may miss its start
  ensureFullHistory(config.cwd, { logger })

  let from = options.from
  if (!from) {
    const start = await resolveDefaultRangeStart({ cwd: config.cwd, logger })
    logger.debug(`commitlint: linting from the ${start.reason}`)
    from = start.from
  }
  if (from) {
    assertRefAvailable(from, config.cwd, logger)
  }

  const commits = getCommitsInRange({ from, to: options.to, cwd: config.cwd })
  const entries: ReportEntry[] = []

  const mode = getTitleMode(options.title ?? config.commitlint?.title)
  const title = mode === 'off'
    ? undefined
    : getPullRequestTitle()
  const lint = await getPullRequestLint({
    config,
    mode,
    kind: title?.kind,
    from,
    to: options.to,
  })
  // What a merge may not keep only warns: the note tells why, when it turns errors into warnings
  let downgraded = false
  const withSeverity = (result: CommitlintResult, severity: 'error' | 'warn'): CommitlintResult => {
    if (severity === 'error') {
      return result
    }
    const warned = toWarnings(result)
    downgraded ||= warned !== result
    return warned
  }

  // The title becomes the commit message of a squash merge, with every file of the pull request
  const pullRequest = lint.title === 'off'
    ? undefined
    : title
  if (pullRequest) {
    const files = [
      ...new Set(commits.flatMap(commit => commit.files)),
    ]
    entries.push({
      result: withSeverity(await lintCommitMessage(pullRequest.title, { config, packages, files }), lint.title as 'error' | 'warn'),
      label: pullRequest.kind === 'merge request'
        ? 'MR title'
        : 'PR title',
    })
  }

  for (const commit of commits) {
    entries.push({
      result: withSeverity(await lintCommitMessage(commit.message, {
        config,
        packages,
        files: commit.files,
        hash: commit.hash,
      }), lint.commits),
      label: commit.hash.slice(0, 7),
    })
  }

  return {
    mode: 'range',
    entries,
    from,
    titleKind: pullRequest?.kind,
    helpUrl,
    ...(downgraded && lint.note
      ? {
          notes: [lint.note],
        }
      : {}),
  }
}

/**
 * Write the commit-msg hook. Run by the prepare script, also where there is no
 * repository (a Docker build, a tarball): nothing to install, without failing
 */
function installHook(cwd: string, force?: boolean): CommitlintRunResult {
  const result = {
    results: [],
    errorCount: 0,
    warningCount: 0,
  }
  if (!tryGitSync(['rev-parse', '--show-toplevel'], { cwd })) {
    print(['Not a git repository: commit-msg hook not installed'])
    return result
  }

  const hook = installCommitMsgHook({ cwd, force })
  const messages: Record<InstalledHook['status'], string> = {
    unchanged: `The commit-msg hook already runs relizy commitlint (${hook.path})`,
    kept: `A commit-msg hook already exists (${hook.path}): kept, add "${COMMIT_MSG_HOOK_COMMAND}" to it, or run with --force to replace it`,
    created: `✔ commit-msg hook created: ${hook.path}`,
    replaced: `✔ commit-msg hook replaced: ${hook.path}`,
  }
  print([
    messages[hook.status],
    ...(hook.removed
      ? [`✔ Removed the old commit-msg hook, no longer run: ${hook.removed}`]
      : []),
  ])
  return { ...result, hook }
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
    return installHook(config.cwd, options.force)
  }

  const report = await lintMessages(options, config)
  if (options.preview) {
    for (const entry of report.entries) {
      entry.preview = entry.result.gitCommit && !entry.result.ignored
        ? renderChangelogEntry(entry.result.gitCommit, config)
        : undefined
    }
  }

  if (options.format === 'json') {
    print([
      formatJsonReport(report),
    ])
  }
  else {
    print(formatTextReport(report, {
      colors: shouldUseColors(),
      quiet: options.quiet,
    }))
    if (process.env.GITHUB_ACTIONS === 'true') {
      print(formatGithubAnnotations(report))
    }
  }

  const results = report.entries.map(entry => entry.result)
  return {
    results,
    ...summarizeResults(results),
    report,
  }
}
