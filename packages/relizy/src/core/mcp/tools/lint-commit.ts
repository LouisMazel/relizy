import type { CommitlintResult } from '@relizy/core'
import type { ResolvedRelizyConfig } from '../../core'
import type { ServerContext } from '../context'
import { logger } from '@maz-ui/node'
import { getCommitsInRange, getLastTag, getStagedFiles } from '@relizy/core'

import { z } from 'zod'
import { getWorkspacePackages, lintCommitMessage, renderChangelogEntry, summarizeResults } from '../../core'
import { code, codeList } from '../markdown'
import { formatNotes, loadProjectConfig, withCapturedLogs } from '../runtime'
import { configArgSchema } from './project'
import { defineTool, ToolInputError } from './types'

/** Above this number of commits, only the commits with problems are detailed */
const MAX_DETAILED_COMMITS = 20

interface LintEntry {
  label?: string
  result: CommitlintResult
}

function statusOf(result: CommitlintResult): string {
  if (result.ignored) {
    return 'ignored'
  }

  if (!result.valid) {
    return 'invalid'
  }

  return result.problems.length > 0
    ? 'valid with warnings'
    : 'valid'
}

function describeProblems(result: CommitlintResult): string[] {
  const problems = result.problems.map((problem) => {
    const fix = problem.fix
      ? ` (fix: ${problem.fix})`
      : ''

    return `- **${problem.severity}** ${code(problem.rule)}: ${problem.message}${fix}`
  })

  if (result.suggestion) {
    const remaining = result.suggestion.remainingRules.length > 0
      ? ` (still to fix: ${result.suggestion.remainingRules.join(', ')})`
      : ''

    problems.push(`- Suggested header: ${code(result.suggestion.header)}${remaining}`)
  }

  return problems
}

function describeEffect(result: CommitlintResult, config: ResolvedRelizyConfig): string[] {
  if (result.ignored || !result.gitCommit) {
    return []
  }

  const { commit } = result
  const breaking = commit.isBreaking ? ' (breaking change)' : ''
  const packages = commit.packages?.length
    ? `, packages: ${codeList(commit.packages)}`
    : ''
  const entry = renderChangelogEntry(result.gitCommit, config)
  const changelog = entry
    ? `- Changelog entry:\n\n${entry.trim().split('\n').map(line => '  '.concat(line)).join('\n')}`
    : `- Not in the changelog (the type ${code(commit.type)} has no changelog title)`

  return [`- Bump: ${commit.bump ?? 'none'}${breaking}${packages}`, changelog]
}

function formatEntry({ label, result }: LintEntry, config: ResolvedRelizyConfig): string {
  const prefix = label
    ? `${label} `
    : ''

  return [
    `### ${prefix}${code(result.commit.header)}: ${statusOf(result)}`,
    '',
    ...describeProblems(result),
    ...describeEffect(result, config),
  ].join('\n')
}

export interface LintCommitArgs {
  config?: string
  message?: string
  files?: string[]
  from?: string
  to?: string
}

async function lintEntries(context: ServerContext, args: LintCommitArgs): Promise<{ config: ResolvedRelizyConfig, from?: string, entries: LintEntry[] }> {
  const config = await loadProjectConfig({ config: args.config, cwd: context.cwd })
  const packages = getWorkspacePackages(config)

  if (args.message !== undefined) {
    const files = args.files ?? getStagedFiles(config.cwd)

    return {
      config,
      entries: [
        { result: await lintCommitMessage(args.message, { config, packages, files }) },
      ],
    }
  }

  const from = args.from ?? (await getLastTag({ cwd: config.cwd, logger }) || undefined)
  const entries: LintEntry[] = []

  for (const commit of getCommitsInRange({ from, to: args.to, cwd: config.cwd })) {
    entries.push({
      label: commit.hash.slice(0, 7),
      result: await lintCommitMessage(commit.message, {
        config,
        packages,
        files: commit.files,
        hash: commit.hash,
      }),
    })
  }

  return { config, from, entries }
}

function describeScope(args: LintCommitArgs, count: number, from: string | undefined): string {
  if (args.message !== undefined) {
    return 'the message'
  }

  const start = from
    ? `after ${code(from)}`
    : 'of the whole history'
  const end = args.to
    ? ` up to ${code(args.to)}`
    : ''

  return `${count} commit(s) ${start}${end}`
}

export async function lintCommit(context: ServerContext, args: LintCommitArgs): Promise<string> {
  if (args.message !== undefined && (args.from || args.to)) {
    throw new ToolInputError('Pass either `message` (a message to lint) or `from`/`to` (commits of the history), not both.')
  }

  const { value: { config, from, entries }, logs } = await withCapturedLogs(() => lintEntries(context, args))
  const { errorCount, warningCount } = summarizeResults(entries.map(entry => entry.result))
  const detailed = entries.length > MAX_DETAILED_COMMITS
    ? entries.filter(entry => entry.result.problems.length > 0)
    : entries

  const lines = [
    `# Commitlint (relizy ${context.version}): ${errorCount === 0
      ? 'passed'
      : 'failed'}`,
    '',
    `Linted ${describeScope(args, entries.length, from)}: ${errorCount} error(s), ${warningCount} warning(s).`,
    ...detailed.flatMap(entry => [
      '',
      formatEntry(entry, config),
    ]),
  ]

  if (detailed.length < entries.length) {
    lines.push('', `The ${entries.length - detailed.length} other commits are valid.`)
  }

  if (errorCount > 0) {
    lines.push('', 'Fix the errors before committing (or with `git commit --amend` / an interactive rebase for the history, after asking the user). Rules: `get_doc({ id: "commitlint/rules" })`.')
  }

  const notes = formatNotes(logs.filter(log => log.type !== 'info'))

  return notes
    ? `${lines.join('\n')}\n\n${notes}`
    : lines.join('\n')
}

export const lintCommitTool = defineTool({
  name: 'lint_commit',
  title: 'Lint commit messages',
  description: 'Lint a commit message with the relizy commitlint rules of the project (Conventional Commits, types, scopes of the workspace packages, body), BEFORE committing: returns the problems with their fix, a suggested header, the bump the commit triggers, the packages it touches and its changelog entry. Pass `message` (the staged files are used as the files of the commit, or `files`), or `from`/`to` to lint commits of the history (default: since the last tag).',
  inputSchema: {
    config: configArgSchema,
    message: z.string().optional().describe('Full commit message: header, blank line, body, footers'),
    files: z.array(z.string()).optional().describe('Files of the commit, relative to the root (default: the staged files): they decide the packages and scopes'),
    from: z.string().optional().describe('Lint the commits after this ref (default: the last tag)'),
    to: z.string().optional().describe('Last commit of the range (default: HEAD)'),
  },
  run: lintCommit,
})
