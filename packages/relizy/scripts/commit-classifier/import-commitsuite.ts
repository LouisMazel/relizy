import type { CommitSuiteCommit } from './commitsuite'
import type { CommitLabel, SkipReason } from './dataset'
import { createWriteStream, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { logger } from '@maz-ui/node'
import { toLoggedCommit } from './commitsuite'
import { COMMIT_LABELS, extractExample } from './dataset'

/**
 * Converts CommitSuite (https://github.com/security-pride/CommitSuite: commits
 * of open source repositories, with their files and line counts) to examples
 * of the dataset, through the same cleaning as `extract.ts`: the type gives
 * the label, the message loses its type, scope and references.
 *
 * pnpm dataset:commitsuite <CommitSuite clone> [--out commitsuite.dataset.jsonl] [--max-files 100]
 *
 * CommitSuite itself has no license file: the licenses checked are the ones
 * of its source repositories, by `build.ts` (see `licenses.ts`).
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'out': { type: 'string', default: 'commitsuite.dataset.jsonl' },
    'max-files': { type: 'string', default: '100' },
  },
})

const root = positionals[0]
const dataDir = root && join(root, 'all_data')
const maxFiles = Number(values['max-files'])
if (!dataDir || !existsSync(dataDir) || !Number.isInteger(maxFiles) || maxFiles < 0) {
  logger.error('Usage: pnpm dataset:commitsuite <CommitSuite clone> [--out commitsuite.dataset.jsonl] [--max-files 100]')
  process.exit(1)
}

const labelCounts = Object.fromEntries(COMMIT_LABELS.map(label => [label, 0])) as Record<CommitLabel, number>
const skipCounts: Partial<Record<SkipReason | 'duplicate', number>> = {}
const seenHashes = new Set<string>()
const out = createWriteStream(values.out)
let repositories = 0

for (const name of readdirSync(dataDir).sort()) {
  const file = join(dataDir, name, 'commits.json')
  if (!existsSync(file)) {
    continue
  }
  repositories++
  const commits = JSON.parse(readFileSync(file, 'utf8')) as CommitSuiteCommit[]

  for (const commit of commits) {
    if (seenHashes.has(commit.hash)) {
      skipCounts.duplicate = (skipCounts.duplicate ?? 0) + 1
      continue
    }
    seenHashes.add(commit.hash)

    const result = extractExample(toLoggedCommit(commit), commit.repo_name, { maxFiles, source: 'commitsuite' })
    if (result.kind === 'skipped') {
      skipCounts[result.reason] = (skipCounts[result.reason] ?? 0) + 1
      continue
    }
    labelCounts[result.example.label]++
    out.write(`${JSON.stringify(result.example)}\n`)
  }
}

await new Promise<void>((resolveEnd, reject) => out.end((error?: Error | null) => error
  ? reject(error)
  : resolveEnd()))

const total = Object.values(labelCounts).reduce((sum, count) => sum + count, 0)
const formatCount = ([name, count]: [string, number | undefined]) => `${name} ${count ?? 0}`
logger.log(`Examples per label: ${COMMIT_LABELS.map(label => formatCount([label, labelCounts[label]])).join(', ')}`)
logger.log(`Ignored: ${Object.entries(skipCounts).map(formatCount).join(', ')}`)
logger.success(`${total} examples from ${repositories} CommitSuite repositories written to ${values.out}`)
