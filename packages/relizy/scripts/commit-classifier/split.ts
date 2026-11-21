import type { CommitExample, CommitLabel } from './dataset'
import { createHash } from 'node:crypto'
import { COMMIT_LABELS } from './dataset'

/**
 * Pure steps of `build.ts`: deduplication, choice of the test repositories,
 * counts and language of a repository.
 */

/**
 * Drops the examples seen before: the same commit read from two sources (a
 * clone and CommitSuite), or the same change committed again in a repository
 * (cherry-pick on another branch: same message and files, another hash).
 */
export function dedupeExamples(examples: Iterable<CommitExample>): { kept: CommitExample[], duplicates: number } {
  const seen = new Set<string>()
  const kept: CommitExample[] = []
  let duplicates = 0

  for (const example of examples) {
    const keys = [example.hash, `${example.repo}\0${example.message}\0${example.files.join('\0')}`]
    if (keys.some(key => seen.has(key))) {
      duplicates++
      continue
    }
    keys.forEach(key => seen.add(key))
    kept.push(example)
  }
  return { kept, duplicates }
}

export interface TestSplitOptions {
  /** Share of the examples the test set aims at, 0.15 by default */
  share?: number
  /** Changes the repositories drawn, for another split of the same data */
  seed?: string
  /** Repositories always in the test set */
  forced?: string[]
  /** Repositories never in the test set (the ones of the owner of the dataset, by default) */
  excluded?: string[]
}

/**
 * Chooses the repositories of the test set: whole repositories, so the test
 * measures how the model does on repositories it has never seen. They are
 * drawn in a stable order (hash of seed and name) until the share is reached;
 * a repository bigger than a quarter of the target is skipped, so one large
 * project does not make the whole test set.
 */
export function chooseTestRepositories(countByRepo: Map<string, number>, { share = 0.15, seed = 'relizy', forced = [], excluded = [] }: TestSplitOptions = {}): Set<string> {
  const total = [
    ...countByRepo.values(),
  ].reduce((sum, count) => sum + count, 0)
  const target = total * share
  const test = new Set(forced.filter(repo => countByRepo.has(repo)))
  let size = [...test].reduce((sum, repo) => sum + countByRepo.get(repo)!, 0)

  const candidates = [
    ...countByRepo.keys(),
  ]
    .filter(repo => !test.has(repo) && !excluded.includes(repo))
    .sort((a, b) => hash(seed, a).localeCompare(hash(seed, b)))

  for (const repo of candidates) {
    if (size >= target) {
      break
    }
    const count = countByRepo.get(repo)!
    if (count > target / 4) {
      continue
    }
    test.add(repo)
    size += count
  }
  return test
}

function hash(seed: string, value: string): string {
  return createHash('sha256').update(`${seed}\0${value}`).digest('hex')
}

/** Number of examples per label, every label present */
export function countLabels(examples: Iterable<Pick<CommitExample, 'label'>>): Record<CommitLabel, number> {
  const counts = Object.fromEntries(COMMIT_LABELS.map(label => [label, 0])) as Record<CommitLabel, number>
  for (const example of examples) {
    counts[example.label]++
  }
  return counts
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  mts: 'TypeScript',
  cts: 'TypeScript',
  vue: 'Vue',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  py: 'Python',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  c: 'C',
  h: 'C',
  cc: 'C++',
  cpp: 'C++',
  hpp: 'C++',
  rb: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  cs: 'C#',
  scala: 'Scala',
  dart: 'Dart',
  svelte: 'Svelte',
}

/** Main language of a repository: the most frequent code extension among the files of its examples */
export function detectLanguage(examples: Iterable<Pick<CommitExample, 'files'>>): string {
  const counts = new Map<string, number>()
  for (const example of examples) {
    for (const file of example.files) {
      const language = LANGUAGE_BY_EXTENSION[file.split('.').pop()?.toLowerCase() ?? '']
      if (language) {
        counts.set(language, (counts.get(language) ?? 0) + 1)
      }
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown'
}
