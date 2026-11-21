import type { CommitExample } from './dataset'
import type { RepositoryLicense } from './licenses'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { logger } from '@maz-ui/node'
import { COMMIT_LABELS } from './dataset'
import { isPermissive, readRemoteRepositoryLicense, resolveRepositoryLicense } from './licenses'
import { chooseTestRepositories, countLabels, dedupeExamples, detectLanguage } from './split'

/**
 * Merges the outputs of `extract.ts` and `import-commitsuite.ts` into the
 * dataset of the classifier: one copy of each commit, only the repositories
 * under a permissive license (read from their license files), a test set made
 * of whole repositories the training never sees, and the manifest of the
 * sources. Prints the count per label before any balancing.
 *
 * pnpm dataset:build <examples.jsonl>... [--out-dir commit-classifier-dataset]
 *   [--own <owner>] [--test-share 0.15] [--test-repo <owner/name>] [--seed relizy]
 *
 * `--own` names the owners whose repositories are kept whatever their license
 * (your own private repositories); they stay out of the test set unless given
 * by `--test-repo`. The licenses are cached in `<out-dir>/licenses.json`.
 */

const USAGE = 'Usage: pnpm dataset:build <examples.jsonl>... [--out-dir commit-classifier-dataset] [--own <owner>] [--test-share 0.15] [--test-repo <owner/name>] [--seed relizy]'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'out-dir': { type: 'string', default: 'commit-classifier-dataset' },
    'own': { type: 'string', multiple: true, default: [] },
    'test-share': { type: 'string', default: '0.15' },
    'test-repo': { type: 'string', multiple: true, default: [] },
    'seed': { type: 'string', default: 'relizy' },
  },
})

const testShare = Number(values['test-share'])
if (positionals.length === 0 || !(testShare > 0 && testShare < 1)) {
  logger.error(USAGE)
  process.exit(1)
}

const outDir = values['out-dir']
mkdirSync(outDir, { recursive: true })
const licensesFile = join(outDir, 'licenses.json')
const licenses: Record<string, RepositoryLicense> = existsSync(licensesFile)
  ? JSON.parse(readFileSync(licensesFile, 'utf8'))
  : {}

function* readExamples(): Generator<CommitExample> {
  for (const file of positionals) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.trim()) {
        yield JSON.parse(line) as CommitExample
      }
    }
  }
}

const { kept, duplicates } = dedupeExamples(readExamples())
const byRepo = new Map<string, CommitExample[]>()
for (const example of kept) {
  const examples = byRepo.get(example.repo) ?? []
  examples.push(example)
  byRepo.set(example.repo, examples)
}

function isOwn(repo: string): boolean {
  return values.own.some(owner => repo.toLowerCase().startsWith(`${owner.toLowerCase()}/`))
}

// Licenses: own repositories are kept, the others need a permissive license file
const excludedRepos = new Map<string, string>()
const toCheck = [
  ...byRepo.keys(),
].filter(repo => !isOwn(repo) && !licenses[repo])
toCheck.forEach((repo, index) => {
  if (!repo.includes('/')) {
    return
  }
  const license = readRemoteRepositoryLicense(repo)
  if (license) {
    licenses[repo] = license
  }
  if ((index + 1) % 20 === 0 || index + 1 === toCheck.length) {
    logger.info(`Licenses checked: ${index + 1}/${toCheck.length}`)
    writeFileSync(licensesFile, `${JSON.stringify(licenses, null, 2)}\n`)
  }
})

for (const repo of byRepo.keys()) {
  if (isOwn(repo)) {
    continue
  }
  const license = licenses[repo]
  if (license) {
    // Recomputed from the files, so a fix of the rules applies to the cache
    license.license = resolveRepositoryLicense(license.files)
  }
  if (!repo.includes('/')) {
    excludedRepos.set(repo, 'unknown repository (no owner/name)')
  }
  else if (!license) {
    excludedRepos.set(repo, 'license not readable (repository gone or private)')
  }
  else if (!isPermissive(license.license)) {
    excludedRepos.set(repo, `license ${license.license}`)
  }
}

const countByRepo = new Map([...byRepo]
  .filter(([repo]) => !excludedRepos.has(repo))
  .map(([repo, examples]) => [repo, examples.length]))
const testRepos = chooseTestRepositories(countByRepo, {
  share: testShare,
  seed: values.seed,
  forced: values['test-repo'],
  excluded: [
    ...countByRepo.keys(),
  ].filter(isOwn),
})

const train: CommitExample[] = []
const test: CommitExample[] = []
for (const [repo, examples] of byRepo) {
  if (excludedRepos.has(repo)) {
    continue
  }
  (testRepos.has(repo)
    ? test
    : train).push(...examples)
}

writeFileSync(join(outDir, 'train.dataset.jsonl'), train.map(example => JSON.stringify(example)).join('\n').concat('\n'))
writeFileSync(join(outDir, 'test.dataset.jsonl'), test.map(example => JSON.stringify(example)).join('\n').concat('\n'))

const manifest = {
  generatedAt: new Date().toISOString(),
  rules: 'Permissive licenses only (MIT, Apache-2.0, BSD, ISC) read from the license files of each repository; own repositories kept; type, scope and references removed from the message; test set made of whole repositories absent from the training set',
  datasets: [
    { name: 'CommitSuite', url: 'https://github.com/security-pride/CommitSuite', license: 'none declared: each source repository is checked' },
    { name: 'oov-commit-classification', url: 'https://github.com/exhilarin/oov-commit-classification', license: 'MIT (code); its repository list is re-extracted from clones' },
  ],
  repositories: [...byRepo].sort(([a], [b]) => a.localeCompare(b)).map(([repo, examples]) => ({
    repo,
    url: repo.includes('/')
      ? `https://github.com/${repo}`
      : undefined,
    sources: [
      ...new Set(examples.map(example => example.source)),
    ],
    license: isOwn(repo)
      ? 'own'
      : licenses[repo]?.license ?? 'unknown',
    licenseFiles: licenses[repo]?.files.map(file => file.path),
    language: detectLanguage(examples),
    examples: examples.length,
    split: excludedRepos.has(repo)
      ? 'excluded'
      : testRepos.has(repo)
        ? 'test'
        : 'train',
    excludedBecause: excludedRepos.get(repo),
  })),
}
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

// Report, before any balancing
const trainCounts = countLabels(train)
const testCounts = countLabels(test)
const width = Math.max(...COMMIT_LABELS.map(label => label.length))
const pad = (value: number | string, size = 7) => String(value).padStart(size)
function percent(count: number, total: number) {
  return total
    ? `${(count / total * 100).toFixed(1)} %`
    : '-'
}

logger.log('')
logger.log(`  ${'label'.padEnd(width)}  ${pad('train')}  ${pad('%', 7)}  ${pad('test')}  ${pad('%', 7)}`)
for (const label of [...COMMIT_LABELS].sort((a, b) => trainCounts[b] - trainCounts[a])) {
  logger.log(`  ${label.padEnd(width)}  ${pad(trainCounts[label])}  ${pad(percent(trainCounts[label], train.length))}  ${pad(testCounts[label])}  ${pad(percent(testCounts[label], test.length))}`)
}
logger.log(`  ${'total'.padEnd(width)}  ${pad(train.length)}  ${pad('')}  ${pad(test.length)}`)
logger.log('')
const exclusionReasons = new Map<string, number>()
for (const reason of excludedRepos.values()) {
  exclusionReasons.set(reason, (exclusionReasons.get(reason) ?? 0) + 1)
}
const formatReason = ([reason, count]: [string, number]) => `${reason}: ${count}`
logger.log(`Repositories: ${countByRepo.size - testRepos.size} train, ${testRepos.size} test, ${excludedRepos.size} excluded (${[...exclusionReasons].map(formatReason).join(', ') || 'none'})`)
logger.log(`Duplicates dropped: ${duplicates}; examples of excluded repositories: ${[
  ...excludedRepos.keys(),
].reduce((sum, repo) => sum + byRepo.get(repo)!.length, 0)}`)
logger.success(`Written to ${outDir}: train.dataset.jsonl, test.dataset.jsonl, manifest.json, licenses.json`)
