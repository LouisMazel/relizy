import type { ServerContext } from '../context'
import type { DocCategory, DocEntry } from '../knowledge/schema'
import type { SearchHit } from '../search'

import { z } from 'zod'
import { docCategories } from '../knowledge/schema'
import { firstParagraph, truncateText } from '../markdown'
import { defineTool } from './types'

/** Below this score, the results are only loosely related to the query */
const WEAK_MATCH_SCORE = 60

export function formatDocLine(doc: DocEntry, index?: number): string {
  const prefix = index === undefined
    ? '-'
    : `${index + 1}.`

  return [
    `${prefix} **${doc.title}** (${doc.category}, \`${doc.id}\`): ${truncateText(doc.description, 220)}`,
    `   Next: get_doc({ id: "${doc.id}" })`,
  ].join('\n')
}

function formatHit(hit: SearchHit, index: number): string {
  if (hit.kind === 'doc') {
    return formatDocLine(hit.doc, index)
  }

  if (hit.kind === 'export') {
    return [
      `${index + 1}. **\`${hit.coreExport.name}\`** (@relizy/core ${hit.coreExport.kind}, \`${hit.coreExport.docId}\`): ${truncateText(hit.coreExport.summary, 220)}`,
      `   Next: get_doc({ id: "${hit.coreExport.docId}", sections: ["${hit.coreExport.name}"] })`,
    ].join('\n')
  }

  return [
    `${index + 1}. **\`${hit.option.path}\`** (config option, \`${hit.option.type}\`): ${truncateText(firstParagraph(hit.option.description), 220)}`,
    `   Next: get_config_option({ path: "${hit.option.path}" })`,
  ].join('\n')
}

export interface SearchDocsArgs {
  query: string
  category?: DocCategory
  limit?: number
}

export function searchDocs(context: ServerContext, { query, category, limit = 8 }: SearchDocsArgs): string {
  const hits = context.search.search(query, { category, limit })
  const filter = category
    ? ` (category: ${category})`
    : ''
  const header = `# relizy ${context.version} results for "${query}"${filter}`

  if (hits.length === 0) {
    return [
      header,
      '',
      'No result. Try other words (e.g. "prerelease" or "beta", "monorepo" or "workspace"), remove the category filter, or read the overview with `get_doc({ id: "guide/what-is-relizy" })`.',
    ].join('\n')
  }

  const lines = [
    header,
    '',
    ...hits.map(formatHit),
  ]

  if (hits[0]!.score < WEAK_MATCH_SCORE) {
    lines.push('', 'These results are weak matches: relizy probably has no dedicated feature for this. Check the config reference with `get_config_option()` before assuming an option exists.')
  }

  return lines.join('\n')
}

export const searchDocsTool = defineTool({
  name: 'search_docs',
  title: 'Search the relizy docs',
  description: 'Search the docs of the installed relizy, its config options and the API of @relizy/core (each export with its signature and JSDoc, category core): guides (version modes, version groups, canary and prerelease releases, CI, private projects, rewritten tags), config, CLI, commitlint and API. Describe the need in plain words ("release only the changed packages", "beta release", "skip npm publish", "github actions token"); words from other tools (changesets, lerna, semantic-release) work too. Returns ranked pages, config options and core exports with the next tool to call.',
  inputSchema: {
    query: z.string().min(1).describe('The need or the name to look for, in English'),
    category: z.enum(docCategories).optional().describe('Restrict to one category of pages'),
    limit: z.number().int().min(1).max(20).optional().describe('Number of results (default 8)'),
  },
  run: searchDocs,
})
