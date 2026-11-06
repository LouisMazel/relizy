import type { ServerContext } from '../context'
import type { DocEntry } from '../knowledge/schema'

import { z } from 'zod'
import { findSection, listSections, outline, sectionContent } from '../markdown'
import { formatDocLine } from './search-docs'
import { defineTool, ToolInputError } from './types'

/** Pages above this size are returned as an outline and their beginning, unless `full` is set */
const MAX_FULL_DOC_CHARS = 24_000
const PREVIEW_CHARS = 6000

/** Finds a page by id, by id without category (`version-groups`) or by title */
function resolveDoc(context: ServerContext, query: string): DocEntry | undefined {
  const { knowledge } = context
  const id = query.trim().split('#')[0]!.replace(/^\//, '').replace(/\.md$/, '').toLowerCase()

  return knowledge.docsById.get(id)
    ?? knowledge.docs.find(doc => doc.id.split('/').at(-1) === id)
    ?? knowledge.docs.find(doc => doc.title.toLowerCase() === query.trim().toLowerCase())
}

function notFoundMessage(context: ServerContext, query: string): string {
  const suggestions = context.search.search(query, { limit: 8 }).flatMap(hit => hit.kind === 'doc' ? [hit.doc] : []).slice(0, 5)

  return [
    `No relizy doc matches "${query}".`,
    ...(suggestions.length > 0 ? ['', 'Closest docs:', ...suggestions.map(doc => formatDocLine(doc))] : []),
    '',
    'Pass an id from `search_docs` (e.g. "guide/version-groups", "config/bump", "cli/release").',
  ].join('\n')
}

export interface GetDocArgs {
  id: string
  sections?: string[]
  full?: boolean
}

export function getDoc(context: ServerContext, { id, sections, full = false }: GetDocArgs): string {
  const doc = resolveDoc(context, id)

  if (!doc) {
    throw new ToolInputError(notFoundMessage(context, id))
  }

  const markdown = context.knowledge.readDoc(doc.id)
  const source = `\n\nSource: ${doc.url}`

  if (sections?.length) {
    const found = sections.map(title => ({ title, section: findSection(markdown, title) }))
    const missing = found.filter(entry => !entry.section).map(entry => entry.title)

    if (missing.length === found.length) {
      throw new ToolInputError(`No section "${missing.join('", "')}" in \`${doc.id}\`. Available sections:\n${outline(markdown)}`)
    }

    return [
      `# ${doc.title} (\`${doc.id}\`)`,
      ...found.flatMap(entry => entry.section ? [sectionContent(markdown, entry.section)] : []),
      ...(missing.length > 0 ? [`Sections not found: ${missing.join(', ')}.`] : []),
    ].join('\n\n')
  }

  if (full || markdown.length <= MAX_FULL_DOC_CHARS) {
    return `${markdown.trim()}${source}`
  }

  const firstSection = listSections(markdown)[0]
  const introLength = firstSection ? markdown.split('\n').slice(0, firstSection.start).join('\n').length : PREVIEW_CHARS

  return [
    markdown.slice(0, Math.min(introLength, PREVIEW_CHARS)).trim(),
    '',
    `This page is long (${markdown.length} characters). Request the sections you need with \`get_doc({ id: "${doc.id}", sections: ["..."] })\`, or \`full: true\` for everything.`,
    '',
    '## Sections',
    '',
    outline(markdown),
  ].join('\n') + source
}

export const getDocTool = defineTool({
  name: 'get_doc',
  title: 'Read a relizy doc page',
  description: 'Read a page of the docs of the installed relizy: guide (getting-started, version-modes, version-groups, prereleases, github-actions, gitlab-ci, dependency-management...), config (bump, changelog, monorepo, publish, release, hooks...), cli (bump, release, publish...), commitlint (rules, config, cli...) or api. Accepts an id ("guide/version-groups", "config/bump") or a page name ("version-groups"). Long pages return an outline: then ask for specific sections.',
  inputSchema: {
    id: z.string().min(1).describe('Doc id or page name: "guide/version-groups", "config/publish", "cli/release", "version-modes"'),
    sections: z.array(z.string()).max(10).optional().describe('Only return these sections (heading titles, e.g. ["Configuration"])'),
    full: z.boolean().optional().describe('Return the whole page even when it is long'),
  },
  run: getDoc,
})
