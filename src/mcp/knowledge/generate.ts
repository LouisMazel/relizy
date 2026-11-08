import type { ConfigOption, DocCategory, DocEntry, Manifest } from './schema'

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative } from 'node:path'
import { parseSync } from 'oxc-parser'
import { docCategories, SCHEMA_VERSION } from './schema'

/**
 * Generates the agent knowledge bundle shipped in the relizy package
 * (`agent-docs/`): the doc pages without the VitePress syntax, a manifest
 * (pages and config reference extracted from `src/types.ts`) and the rules
 * written in the projects by `relizy mcp init`. Everything comes from the
 * sources, so each build (and each release) ships the docs of its version.
 */

const HOMEPAGE = 'https://relizy.dev'

/** Pages that are not documentation for the users of relizy */
const EXCLUDED_PAGES = new Set(['index.md', 'changelog.md', 'guide/contributing.md'])

/** Doc page of the top-level config keys, `config/overview` for the others */
export const CONFIG_DOC_IDS: Record<string, string> = {
  monorepo: 'config/monorepo',
  bump: 'config/bump',
  changelog: 'config/changelog',
  publish: 'config/publish',
  release: 'config/release',
  social: 'config/social',
  prComment: 'config/pr-comment',
  mergePreview: 'config/merge-preview',
  ai: 'config/ai',
  templates: 'config/commit-templates',
  hooks: 'config/hooks',
  commitlint: 'commitlint/config',
  excludeAuthors: 'config/changelog',
  noAuthors: 'config/changelog',
  hideAuthorEmail: 'config/changelog',
  types: 'config/changelog',
}

const MAX_DEPTH = 5

export interface GenerateAgentDocsOptions {
  /** Root of the relizy repository */
  rootDir: string
  /** Output folder, `<rootDir>/agent-docs` by default */
  outDir?: string
}

interface Frontmatter {
  title?: string
  description?: string
  keywords?: string
}

function unquote(value: string): string {
  const quote = value[0]

  return value.length > 1 && (quote === '"' || quote === '\'') && value.at(-1) === quote
    ? value.slice(1, -1)
    : value
}

export function parseFrontmatter(markdown: string): { data: Frontmatter, body: string } {
  const end = markdown.startsWith('---\n')
    ? markdown.indexOf('\n---\n', 3)
    : -1

  if (end === -1) {
    return { data: {}, body: markdown }
  }

  const data: Record<string, string> = {}

  for (const line of markdown.slice(4, end).split('\n')) {
    const separator = line.indexOf(':')
    const key = line.slice(0, separator)

    if (separator > 0 && /^\w+$/.test(key)) {
      data[key] = unquote(line.slice(separator + 1).trim())
    }
  }

  return {
    data,
    body: markdown.slice(end + '\n---\n'.length),
  }
}

/** Doc id of a link to another page (`/cli/release#x`, `../config/bump.md`), `undefined` for the other links */
function linkToDocId(link: string, pageId: string): string | undefined {
  const [path = '', anchor] = link.split('#')

  // Only the links to the pages: `/cli/release`, `./getting-started.md`, `../config/bump.md`
  if (!/^\.{0,2}\//.test(path) || path === '/') {
    return undefined
  }

  const resolved = path.startsWith('/')
    ? path.slice(1)
    : posix.join(posix.dirname(pageId), path)
  const id = resolved.replace(/\.md$/, '').replace(/\/index$/, '').replace(/\/$/, '')

  return anchor
    ? `${id}#${anchor}`
    : id
}

/** Markdown of a page for the agents: frontmatter variables replaced, `v-pre` removed, links to the other pages as doc ids */
export function cleanMarkdown(body: string, data: Frontmatter, pageId: string): string {
  return body
    .replaceAll('{{ $frontmatter.title }}', data.title ?? '')
    .replaceAll('{{ $frontmatter.description }}', data.description ?? '')
    .replaceAll(/<code v-pre>([^<]*)<\/code>/g, '`$1`')
    .replaceAll(/\]\(([^)\s]+)\)/g, (match, link: string) => {
      const id = linkToDocId(link, pageId)

      return id
        ? `](${id})`
        : match
    })
    .trim()
}

function listMarkdownFiles(directory: string, base = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      return entry.name === 'typedoc' || entry.name.startsWith('.')
        ? []
        : listMarkdownFiles(path, base)
    }

    return entry.name.endsWith('.md')
      ? [
          relative(base, path).split('\\').join('/'),
        ]
      : []
  })
}

/** Replaces the VitePress includes (`<!--@include: ./../file.md-->`) of a page with the included files */
function resolveIncludes(markdown: string, pageFile: string): string {
  return markdown.replaceAll(/<!--@include:\s*([^>\s]+)\s*-->/g, (_, path: string) => readFileSync(join(dirname(pageFile), path), 'utf8').trim())
}

function readPages(docsDir: string): { entry: DocEntry, content: string }[] {
  return listMarkdownFiles(docsDir)
    .filter(file => !EXCLUDED_PAGES.has(file))
    .sort()
    .flatMap((file) => {
      const id = file.replace(/\.md$/, '')
      const category = id.split('/')[0] as DocCategory

      if (!docCategories.includes(category)) {
        return []
      }

      const { data, body } = parseFrontmatter(resolveIncludes(readFileSync(join(docsDir, file), 'utf8'), join(docsDir, file)))
      const content = cleanMarkdown(body, data, id)

      return [
        {
          entry: {
            id,
            category,
            title: data.title || id,
            description: data.description ?? '',
            keywords: (data.keywords ?? '').split(',').map(keyword => keyword.trim()).filter(Boolean),
            headings: content.split('\n').filter(line => /^#{2,3} /.test(line)).map(line => line.replace(/^#+ /, '').trim()),
            file: `pages/${id}.md`,
            url: `${HOMEPAGE}/${id}`,
            chars: content.length,
          },
          content,
        },
      ]
    })
}

interface JsDoc {
  description: string
  tags: Record<string, string>
}

export function parseJsDoc(comment: string): JsDoc {
  const lines = comment.replace(/^\*/, '').split('\n').map(line => line.replace(/^\s*\* ?/, '').trimEnd())
  const description: string[] = []
  const tags: Record<string, string> = {}
  let current: string | undefined

  for (const line of lines) {
    const trimmed = line.trim()
    const name = trimmed.startsWith('@')
      ? /^@(\w+)/.exec(trimmed)?.[1]
      : undefined

    if (name) {
      current = name
      tags[name] = trimmed.slice(name.length + 1).trim()
    }
    else if (current) {
      tags[current] = `${tags[current]}\n${trimmed}`.trim()
    }
    else {
      description.push(line)
    }
  }

  return {
    description: description.join('\n').trim(),
    tags,
  }
}

type AstNode = Record<string, any>

interface NestedType {
  node: AstNode
  array: boolean
  /** Keys of a `Pick<X, 'a' | 'b'>` */
  keys?: string[]
}

/**
 * Reference of the config options: the properties of `RelizyConfig` and of
 * the interfaces of its options, recursively, with their JSDoc.
 */
export function extractConfigReference(source: string): ConfigOption[] {
  const { program, comments } = parseSync('types.ts', source)
  const declarations = new Map<string, AstNode>()

  for (const statement of program.body as AstNode[]) {
    const declaration = statement.type === 'ExportNamedDeclaration'
      ? statement.declaration
      : statement

    if (declaration?.type === 'TSInterfaceDeclaration' || declaration?.type === 'TSTypeAliasDeclaration') {
      declarations.set(declaration.id.name, declaration)
    }
  }

  // The members of the inline objects are separated by line breaks: they become `;`
  function textOf(node: AstNode): string {
    return source.slice(node.start, node.end).split('\n').map(line => line.trim()).filter(Boolean).reduce((text, line) => {
      const separator = !text || /[{(,;|&]$/.test(text) || /^[})|&]/.test(line)
        ? ' '
        : '; '

      return text
        ? `${text}${separator}${line}`
        : line
    }, '')
  }

  /**
   * The values accepted by a type made of literals (`'unified' | 'selective'`,
   * an alias of them, `boolean`, an array of them), undefined otherwise
   */
  function literalValues(node: AstNode | undefined, seen: Set<string> = new Set()): string[] | undefined {
    switch (node?.type) {
      case 'TSLiteralType':
        return node.literal?.value === undefined
          ? undefined
          : [
              JSON.stringify(node.literal.value),
            ]
      case 'TSBooleanKeyword':
        return ['true', 'false']
      case 'TSParenthesizedType':
        return literalValues(node.typeAnnotation, seen)
      case 'TSArrayType':
        return literalValues(node.elementType, seen)
      case 'TSUnionType': {
        const values = node.types.map((type: AstNode) => literalValues(type, seen))
        return values.every(Boolean)
          ? [
              ...new Set<string>(values.flat()),
            ]
          : undefined
      }
      case 'TSTypeReference':
        return referenceValues(node, seen)
      default:
        return undefined
    }
  }

  /** The values of a reference: `Array<...>`, or a type alias of `types.ts` */
  function referenceValues(node: AstNode, seen: Set<string>): string[] | undefined {
    const name: string | undefined = node.typeName?.name

    if (name === 'Array') {
      return literalValues(node.typeArguments?.params?.[0], seen)
    }

    const declaration = name
      ? declarations.get(name)
      : undefined

    return name && !seen.has(name) && declaration?.type === 'TSTypeAliasDeclaration'
      ? literalValues(declaration.typeAnnotation, new Set([...seen, name]))
      : undefined
  }

  /** The values of a type that its text does not show (`VersionMode`), undefined otherwise */
  function hiddenValues(node: AstNode | undefined, text: string): string[] | undefined {
    const values = literalValues(node)
    const shown = (value: string) => text.includes(value) || text.includes(value.replaceAll('"', '\'')) || ((value === 'true' || value === 'false') && /\bboolean\b/.test(text))

    return values && !values.every(shown)
      ? values
      : undefined
  }

  function jsDocOf(member: AstNode): JsDoc | undefined {
    const comment = comments.filter(candidate => candidate.type === 'Block' && candidate.value.startsWith('*') && candidate.end <= member.start).at(-1)

    return comment && source.slice(comment.end, member.start).trim() === ''
      ? parseJsDoc(comment.value)
      : undefined
  }

  function membersOfReference(name: string | undefined, seen: Set<string>): AstNode[] {
    if (!name || seen.has(name) || !declarations.has(name)) {
      return []
    }

    return membersOf(declarations.get(name), new Set([...seen, name]))
  }

  /** Members of an object type: interface (with its local parents), type literal, intersection */
  function membersOf(node: AstNode | undefined, seen: Set<string>): AstNode[] {
    switch (node?.type) {
      case 'TSInterfaceDeclaration':
        return [
          ...(node.extends ?? []).flatMap((parent: AstNode) => membersOfReference(parent.expression?.name, seen)),
          ...node.body.body,
        ]
      case 'TSTypeAliasDeclaration':
        return membersOf(node.typeAnnotation, seen)
      case 'TSTypeLiteral':
        return node.members
      case 'TSIntersectionType':
        return node.types.flatMap((type: AstNode) => membersOf(type, seen))
      case 'TSTypeReference':
        return membersOfReference(node.typeName?.name, seen)
      default:
        return []
    }
  }

  function nestedReference(node: AstNode): NestedType[] {
    const name = node.typeName?.name
    const [argument, picked] = node.typeArguments?.params ?? []

    if (name === 'Partial' || name === 'Required') {
      return nestedTypes(argument)
    }

    if (name === 'Pick') {
      const keys = (picked.type === 'TSUnionType'
        ? picked.types
        : [picked]).map((key: AstNode) => key.literal?.value).filter(Boolean)

      return nestedTypes(argument).map(nested => ({ ...nested, keys }))
    }

    return declarations.has(name) && membersOf(declarations.get(name), new Set()).length > 0
      ? [
          { node, array: false },
        ]
      : []
  }

  /** Object types to document under a property: `BumpConfig`, `VersionGroup[]`, `boolean | TwitterConfig`, `Partial<X>`, `Pick<X, 'a'>`, inline objects */
  function nestedTypes(node: AstNode | undefined): NestedType[] {
    switch (node?.type) {
      case 'TSArrayType':
        return nestedTypes(node.elementType).map(nested => ({ ...nested, array: true }))
      case 'TSUnionType':
        return node.types.flatMap(nestedTypes)
      case 'TSTypeLiteral':
        return [
          { node, array: false },
        ]
      case 'TSTypeReference':
        return nestedReference(node)
      default:
        return []
    }
  }

  function toOption(member: AstNode, path: string): ConfigOption {
    const typeNode = member.typeAnnotation?.typeAnnotation
    const doc = jsDocOf(member)
    const tags = doc?.tags ?? {}

    const type = typeNode?.type === 'TSTypeLiteral'
      ? 'object'
      : textOf(typeNode)
    const values = hiddenValues(typeNode, type)

    return {
      path,
      type,
      ...(values
        ? { values }
        : {}),
      description: doc?.description ?? '',
      ...(tags.default === undefined
        ? {}
        : { default: tags.default }),
      ...(tags.deprecated === undefined
        ? {}
        : { deprecated: tags.deprecated || 'Deprecated' }),
      ...(tags.see
        ? { see: tags.see }
        : {}),
      docId: CONFIG_DOC_IDS[path.split('.')[0]!] ?? 'config/overview',
    }
  }

  const options: ConfigOption[] = []

  function visit(members: AstNode[], prefix: string, depth: number, seen: Set<string>): void {
    for (const member of members) {
      if (member.type !== 'TSPropertySignature' || member.key?.type !== 'Identifier') {
        continue
      }

      const path = prefix
        ? `${prefix}.${member.key.name}`
        : member.key.name

      options.push(toOption(member, path))

      if (depth < MAX_DEPTH) {
        visitNested(nestedTypes(member.typeAnnotation?.typeAnnotation), path, depth, seen)
      }
    }
  }

  function visitNested(nested: NestedType[], path: string, depth: number, seen: Set<string>): void {
    for (const { node, array, keys } of nested) {
      const name: string | undefined = node.typeName?.name

      if (!name || !seen.has(name)) {
        const members = membersOf(node, new Set(seen)).filter(nestedMember => !keys || keys.includes(nestedMember.key?.name))

        visit(members, array
          ? `${path}[]`
          : path, depth + 1, name
          ? new Set([...seen, name])
          : seen)
      }
    }
  }

  visit(membersOf(declarations.get('RelizyConfig'), new Set(['RelizyConfig'])), '', 0, new Set(['RelizyConfig']))

  // Several types can declare the same path (`boolean | TwitterConfig`): the first one wins
  return options.filter((option, index) => options.findIndex(other => other.path === option.path) === index)
}

function renderAgentRules(rules: string): { claudeRule: string, agentsMdSection: string } {
  return {
    claudeRule: `# relizy\n\n${rules.trim()}\n`,
    agentsMdSection: `## relizy\n\n${rules.trim()}\n`,
  }
}

function renderReadme(manifest: Manifest): string {
  const sections = docCategories.map((category) => {
    const docs = manifest.docs.filter(doc => doc.category === category)

    return [
      `## ${category}`,
      '',
      ...docs.map(doc => `- [${doc.title}](${doc.file}): ${doc.description}`),
    ].join('\n')
  })

  return [
    `# relizy ${manifest.version} docs for AI agents`,
    '',
    'These docs match the installed relizy. The MCP server (`relizy mcp`) serves them with search, the config reference and the preview of the next release.',
    '',
    '- Rules for the agents: `agents/claude-rule.md`',
    '- Config reference: the `config` entries of `manifest.json` (path, type, description, default)',
    '',
    sections.join('\n\n'),
    '',
  ].join('\n')
}

export function generateAgentDocs({ rootDir, outDir = join(rootDir, 'agent-docs') }: GenerateAgentDocsOptions): Manifest {
  const { version } = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as { version: string }
  const pages = readPages(join(rootDir, 'docs/src'))
  const rules = renderAgentRules(readFileSync(join(rootDir, 'src/mcp/content/rules.md'), 'utf8'))

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    name: 'relizy',
    version,
    homepage: HOMEPAGE,
    docs: pages.map(page => page.entry),
    config: extractConfigReference(readFileSync(join(rootDir, 'src/types.ts'), 'utf8')),
  }

  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true })
  }

  const write = (file: string, content: string) => {
    mkdirSync(dirname(join(outDir, file)), { recursive: true })
    writeFileSync(join(outDir, file), content)
  }

  for (const { entry, content } of pages) {
    write(entry.file, `${content}\n`)
  }

  write('agents/claude-rule.md', rules.claudeRule)
  write('agents/agents-md.md', rules.agentsMdSection)
  write('README.md', renderReadme(manifest))
  write('manifest.json', `${JSON.stringify(manifest)}\n`)

  return manifest
}
