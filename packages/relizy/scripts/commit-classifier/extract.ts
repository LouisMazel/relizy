import type { CommitExample, CommitLabel, SkipReason, Suspicion } from './dataset'
import { createWriteStream, readdirSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { logger } from '@maz-ui/node'
import { runGitSync, tryGitSync } from '@relizy/core'
import { COMMIT_LABELS, extractExample, getGitLogArgs, parseCommitLog } from './dataset'

/**
 * Builds the dataset of the commit classifier from the history of local
 * repositories: one JSON line per conventional commit (cleaned message, files
 * touched, diff stats, label from the type), then the count per label.
 *
 * pnpm dataset:commits <repo-or-folder>... [--out commits.dataset.jsonl]
 *   [--since 2022-01-01] [--since maz-ui=2022-01-01] [--max-files 100] [--strict]
 *
 * A path is a repository (bare or not), or a folder whose direct
 * subdirectories are repositories. A commit present in several repositories
 * (forks, copies) is kept once.
 *
 * Quality of the labels: the old history of a repository often predates its
 * conventions. `--since` keeps the commits after a date, for every repository
 * or for one (`<repo>=<date>`, the name of its directory); `--max-files`
 * drops the mass changes (100 files by default, 0 for no limit); the examples
 * whose label contradicts their files are flagged `suspect`, and `--strict`
 * leaves them out.
 */

const USAGE = 'Usage: pnpm dataset:commits <repo-or-folder>... [--out commits.dataset.jsonl] [--since [<repo>=]<date>] [--max-files 100] [--strict]'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'out': { type: 'string', default: 'commits.dataset.jsonl' },
    'since': { type: 'string', multiple: true, default: [] },
    'max-files': { type: 'string', default: '100' },
    'strict': { type: 'boolean', default: false },
  },
})

const maxFiles = Number(values['max-files'])
if (positionals.length === 0 || !Number.isInteger(maxFiles) || maxFiles < 0) {
  logger.error(USAGE)
  process.exit(1)
}

let defaultSince: string | undefined
const sinceByRepo = new Map<string, string>()
for (const since of values.since) {
  const separator = since.indexOf('=')
  if (separator === -1) {
    defaultSince = since
  }
  else {
    sinceByRepo.set(since.slice(0, separator), since.slice(separator + 1))
  }
}

function isGitRepository(path: string): boolean {
  return tryGitSync(['rev-parse', '--git-dir'], { cwd: path }) !== undefined
}

function findRepositories(path: string): string[] {
  const absolute = resolve(path)
  if (isGitRepository(absolute)) {
    return [absolute]
  }
  return readdirSync(absolute)
    .map(name => join(absolute, name))
    .filter(child => statSync(child).isDirectory() && isGitRepository(child))
}

const repositories = [
  ...new Set(positionals.flatMap(findRepositories)),
]
if (repositories.length === 0) {
  logger.error(`No git repository found in ${positionals.join(', ')}`)
  process.exit(1)
}

const labelCounts = Object.fromEntries(COMMIT_LABELS.map(label => [label, 0])) as Record<CommitLabel, number>
const skipCounts: Record<SkipReason | 'duplicate', number> = {
  'not-conventional': 0,
  'unknown-type': 0,
  'release': 0,
  'empty-message': 0,
  'too-many-files': 0,
  'duplicate': 0,
}
const suspectCounts = Object.fromEntries(COMMIT_LABELS.map(label => [label, 0])) as Record<CommitLabel, number>
const suspicionCounts = new Map<Suspicion, number>()
const unknownTypes = new Map<string, number>()
const seenHashes = new Set<string>()
const out = createWriteStream(values.out)

for (const repository of repositories) {
  const repo = basename(repository).replace(/\.git$/, '')
  const since = sinceByRepo.get(repo) ?? defaultSince
  const commits = parseCommitLog(runGitSync(getGitLogArgs({ since }), { cwd: repository, trim: false }))
  let examples = 0

  for (const commit of commits) {
    if (seenHashes.has(commit.hash)) {
      skipCounts.duplicate++
      continue
    }
    seenHashes.add(commit.hash)

    const result = extractExample(commit, repo, { maxFiles })
    if (result.kind === 'skipped') {
      skipCounts[result.reason]++
      if (result.reason === 'unknown-type' && result.type) {
        unknownTypes.set(result.type, (unknownTypes.get(result.type) ?? 0) + 1)
      }
      continue
    }

    const example: CommitExample = result.example
    if (example.suspect) {
      suspectCounts[example.label]++
      suspicionCounts.set(example.suspect, (suspicionCounts.get(example.suspect) ?? 0) + 1)
      if (values.strict) {
        continue
      }
    }
    labelCounts[example.label]++
    examples++
    out.write(`${JSON.stringify(example)}\n`)
  }

  logger.info(`${repo}: ${examples} examples out of ${commits.length} commits${since
    ? ` since ${since}`
    : ''}`)
}

await new Promise<void>((resolveEnd, reject) => out.end((error?: Error | null) => error
  ? reject(error)
  : resolveEnd()))

const total = Object.values(labelCounts).reduce((sum, count) => sum + count, 0)
const width = Math.max(...COMMIT_LABELS.map(label => label.length))
function percent(count: number) {
  return total
    ? `${(count / total * 100).toFixed(1)} %`
    : '-'
}

logger.log('')
const suspectHeader = values.strict
  ? 'suspect (left out)'
  : 'suspect (kept)'
logger.log(`Examples per label:${' '.repeat(width + 1)}${suspectHeader}`)
for (const label of [...COMMIT_LABELS].sort((a, b) => labelCounts[b] - labelCounts[a])) {
  logger.log(`  ${label.padEnd(width)}  ${String(labelCounts[label]).padStart(6)}  ${percent(labelCounts[label]).padStart(7)}  ${String(suspectCounts[label]).padStart(6)}`)
}
logger.log(`  ${'total'.padEnd(width)}  ${String(total).padStart(6)}  ${' '.repeat(7)}  ${String(Object.values(suspectCounts).reduce((sum, count) => sum + count, 0)).padStart(6)}`)
logger.log('')
const formatCount = ([name, count]: [string, number]) => `${name} ${count}`
logger.log(`Ignored: ${Object.entries(skipCounts).map(formatCount).join(', ')}`)
if (suspicionCounts.size > 0) {
  logger.log(`Suspect: ${[...suspicionCounts].sort((a, b) => b[1] - a[1]).map(formatCount).join(', ')}`)
}
if (unknownTypes.size > 0) {
  const top = [...unknownTypes].sort((a, b) => b[1] - a[1]).slice(0, 10)
  logger.log(`Unknown types: ${top.map(formatCount).join(', ')}`)
}
logger.success(`${total} examples from ${repositories.length} repositories written to ${values.out}`)
