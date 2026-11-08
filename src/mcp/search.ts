import type { Knowledge } from './knowledge/load'
import type { ConfigOption, DocCategory, DocEntry } from './knowledge/schema'

import MiniSearch from 'minisearch'

/**
 * Words of other tools and of the users mapped to the words of the relizy
 * docs: a search for "changesets" or "snapshot release" finds the right pages.
 */
const SYNONYMS: Record<string, string[]> = {
  changeset: ['release', 'bump', 'changelog'],
  changesets: ['release', 'bump', 'changelog'],
  lerna: ['monorepo', 'version', 'mode'],
  turborepo: ['monorepo'],
  nx: ['monorepo'],
  workspace: ['monorepo', 'packages'],
  workspaces: ['monorepo', 'packages'],
  fixed: ['unified'],
  locked: ['unified'],
  semantic: ['conventional', 'commits', 'release'],
  conventional: ['commitlint', 'commits'],
  lint: ['commitlint'],
  husky: ['commitlint', 'hook'],
  snapshot: ['canary'],
  nightly: ['canary'],
  beta: ['prerelease', 'preid'],
  alpha: ['prerelease', 'preid'],
  rc: ['prerelease', 'preid'],
  npm: ['publish', 'registry'],
  registry: ['publish'],
  token: ['tokens', 'auth'],
  auth: ['tokens', 'token'],
  otp: ['publish', '2fa'],
  github: ['provider', 'release', 'actions'],
  gitlab: ['provider', 'release', 'ci'],
  pipeline: ['ci'],
  actions: ['github', 'ci'],
  tweet: ['twitter', 'social'],
  twitter: ['social'],
  slack: ['social'],
  announce: ['social'],
  ai: ['claude', 'changelog'],
  dependents: ['dependency', 'dependencies'],
  peer: ['peerdependencies', 'outofrangepeers'],
  preview: ['dry', 'run'],
  test: ['dry', 'run'],
  tag: ['tags'],
  rebase: ['rewritten', 'tags'],
  groups: ['group', 'version'],
}

export type SearchHit
  = | { kind: 'doc', score: number, doc: DocEntry }
    | { kind: 'config', score: number, option: ConfigOption }

interface IndexedEntry {
  id: string
  kind: 'doc' | 'config'
  title: string
  keywords: string
  headings: string
  description: string
  body: string
  category: string
}

function expandQuery(query: string): string {
  const words = query.toLowerCase().split(/[^a-z\d@./-]+/).filter(Boolean)
  const synonyms = words.flatMap(word => SYNONYMS[word] ?? [])

  return [
    ...new Set([
      ...words,
      ...synonyms,
    ]),
  ].join(' ')
}

/** Search over the doc pages and the config options, built on the first search */
export class DocSearch {
  private readonly index = new MiniSearch<IndexedEntry>({
    fields: [
      'title',
      'keywords',
      'headings',
      'description',
      'body',
    ],
    storeFields: ['kind', 'category'],
    searchOptions: {
      boost: {
        title: 5,
        keywords: 3,
        headings: 2,
        description: 2,
        body: 1,
      },
      prefix: term => term.length > 3,
      fuzzy: term => (term.length > 5
        ? 0.2
        : false),
      combineWith: 'OR',
    },
  })

  constructor(private readonly knowledge: Knowledge) {
    this.index.addAll([
      ...knowledge.docs.map(doc => ({
        id: `doc:${doc.id}`,
        kind: 'doc' as const,
        title: `${doc.title} ${doc.id.replaceAll(/[/-]/g, ' ')}`,
        keywords: doc.keywords.join(' '),
        headings: doc.headings.join(' '),
        description: doc.description,
        body: knowledge.readDoc(doc.id),
        category: doc.category,
      })),
      ...knowledge.config.map(option => ({
        id: `config:${option.path}`,
        kind: 'config' as const,
        title: option.path.replaceAll(/[.[\]]+/g, ' ').replaceAll(/([a-z])([A-Z])/g, '$1 $2'),
        keywords: option.path,
        headings: '',
        description: option.description,
        body: option.type,
        category: 'config',
      })),
    ])
  }

  search(query: string, { category, limit = 8 }: { category?: DocCategory, limit?: number } = {}): SearchHit[] {
    const results = this.index.search(expandQuery(query), {
      filter: result => !category || result.category === category,
    })

    return results.slice(0, limit).flatMap((result): SearchHit[] => {
      const id = String(result.id)

      if (result.kind === 'config') {
        const option = this.knowledge.configByPath.get(id.slice('config:'.length))

        return option
          ? [
              { kind: 'config', score: result.score, option },
            ]
          : []
      }

      const doc = this.knowledge.docsById.get(id.slice('doc:'.length))

      return doc
        ? [
            { kind: 'doc', score: result.score, doc },
          ]
        : []
    })
  }
}
