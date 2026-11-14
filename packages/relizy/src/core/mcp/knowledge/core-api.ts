import type { CoreExport, CoreExportKind } from './schema'
import type { AstNode } from './source'

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { moduleOfNode, parseModule } from './source'

/**
 * The API reference of `@relizy/core` for the agents: one page per domain,
 * generated from `src/index.ts` of core (the exports), the modules declaring
 * them (signature) and their JSDoc (description, params, return, example).
 */

export const CORE_PACKAGE_URL = 'https://www.npmjs.com/package/@relizy/core'

export interface CoreDomain {
  id: string
  title: string
  description: string
}

export const CORE_DOMAINS: CoreDomain[] = [
  { id: 'git', title: 'git', description: 'Run git without a shell, read refs, commits and tags (with a cache), commit, tag and push, check that the branch and the tags are safe to release.' },
  { id: 'commits', title: 'commits', description: 'Parse conventional commits, find the commits of a package (moves, catalogs, private packages) and credit the authors.' },
  { id: 'commitlint', title: 'commitlint', description: 'Lint commit messages against the conventional commits rules, suggest a fix, read the commits and the scopes of a workspace.' },
  { id: 'packages', title: 'packages', description: 'Read the packages of a workspace, their dependencies, catalogs, peer dependency ranges and the package manager.' },
  { id: 'versions', title: 'versions', description: 'Compute the release type and the new version of a package: semver bumps, prereleases, canary versions, graduation.' },
  { id: 'tags', title: 'tags', description: 'Name and find the git tags of the releases: repository and package tags, previous release, rewritten tags.' },
  { id: 'changelog', title: 'changelog', description: 'The data and the markdown of a changelog: range of a release, sections of the commits, compare link, contributors.' },
  { id: 'registry', title: 'registry (npm)', description: 'Registries and publishing: registry targets of a package, publish commands, trusted publishing, published versions.' },
  { id: 'providers', title: 'providers (GitHub, GitLab)', description: 'Repository URL parsing, GitHub and GitLab releases, authentication tokens.' },
  { id: 'ci-utils', title: 'ci and utils', description: 'CI detection and git identity, CI workflow files, formatting helpers, secret redaction and the logger type.' },
]

/** Domain of the exports declared by `src/types.ts` */
const TYPE_DOMAINS: Record<string, string> = {
  BumpReleaseType: 'versions',
  SemverBumpType: 'versions',
  CommitTypes: 'commits',
  GitCommit: 'commits',
  GitCommitAuthor: 'commits',
  RawGitCommit: 'commits',
  Reference: 'commits',
  GitProvider: 'providers',
  RepoConfig: 'providers',
  PackageBase: 'packages',
  PackageManager: 'packages',
  PrivatePackages: 'packages',
  ReadPackage: 'packages',
  RegistryTarget: 'registry',
  CoreLogger: 'ci-utils',
}

/** Domain of the exports of a module of core (path without extension, relative to `src/`) */
const MODULE_DOMAINS: Record<string, string> = {
  'git': 'git',
  'git-exec': 'git',
  'git-cache': 'git',
  'git-refs': 'git',
  'squash-simulation': 'git',
  'commits': 'commits',
  'package-commits': 'commits',
  'moved-packages': 'commits',
  'ai-attribution': 'commits',
  'workspace': 'packages',
  'package-filters': 'packages',
  'package-manager': 'packages',
  'dependencies': 'packages',
  'peers': 'packages',
  'catalogs': 'packages',
  'glob': 'packages',
  'paths': 'packages',
  'version': 'versions',
  'tags': 'tags',
  'rewritten-tags': 'tags',
  'changelog': 'changelog',
  'markdown': 'changelog',
  'registry': 'registry',
  'publish': 'registry',
  'npm-oidc': 'registry',
  'npm-versions': 'registry',
  'github-api': 'providers',
  'gitlab': 'providers',
  'gitlab-auth': 'providers',
  'gh-cli': 'providers',
  'repo-config': 'providers',
  'ci': 'ci-utils',
  'ci-env': 'ci-utils',
  'ci-workflow': 'ci-utils',
  'format': 'ci-utils',
  'redact': 'ci-utils',
}

export interface CoreApiEntry extends CoreExport {
  /** Markdown of the entry: signature, description, params, return, example */
  markdown: string
}

interface JsDocTag {
  name: string
  text: string
}

/** The JSDoc of a comment: its description and its tags, the lines of a tag keeping their indentation (an `@example` has code blocks) */
export function parseJsDocTags(comment: string): { description: string, tags: JsDocTag[] } {
  const lines = comment.replace(/^\*/, '').split('\n').map(line => line.replace(/^\s*\* ?/, '').trimEnd())
  const description: string[] = []
  const tags: JsDocTag[] = []

  for (const line of lines) {
    const name = /^@(\w+)/.exec(line.trim())?.[1]

    if (name) {
      tags.push({
        name,
        text: line.trim().slice(name.length + 1).trim(),
      })
    }
    else if (tags.length > 0) {
      tags.at(-1)!.text += `\n${line}`
    }
    else {
      description.push(line)
    }
  }

  return {
    description: description.join('\n').trim(),
    tags: tags.map(tag => ({
      ...tag,
      text: tag.text.trim(),
    })),
  }
}

/** The first sentence of a description, on one line */
function summarize(description: string): string {
  const paragraph = description.split(/\n\s*\n/)[0]!.replaceAll(/\s+/g, ' ').trim()
  const sentence = /^.*?[.!?](?=\s|$)/.exec(paragraph)?.[0] ?? paragraph

  return sentence.length > 240
    ? `${sentence.slice(0, 237).trimEnd()}...`
    : sentence
}

interface Declaration {
  kind: CoreExportKind
  /** The statement (with `export`) */
  statement: AstNode
  /** The declaration (without `export`) */
  node: AstNode
}

function kindOf(node: AstNode): CoreExportKind | undefined {
  switch (node.type) {
    case 'FunctionDeclaration':
    case 'TSDeclareFunction':
      return 'function'
    case 'ClassDeclaration':
      return 'class'
    case 'VariableDeclaration':
      return 'const'
    case 'TSInterfaceDeclaration':
      return 'interface'
    case 'TSTypeAliasDeclaration':
      return 'type'
    default:
      return undefined
  }
}

function nameOf(node: AstNode): string | undefined {
  return node.type === 'VariableDeclaration'
    ? node.declarations[0]?.id?.name
    : node.id?.name
}

/** The declaration of an export in a module of core, followed through the modules that re-export it */
function findDeclaration(file: string, name: string): { declaration: Declaration, file: string } | undefined {
  const { program } = parseModule(file, readFileSync(file, 'utf8'))

  for (const statement of program.body) {
    const node = statement.type === 'ExportNamedDeclaration'
      ? statement.declaration
      : undefined
    const kind = node && kindOf(node)

    if (node && kind && nameOf(node) === name) {
      return {
        declaration: { kind, statement, node },
        file,
      }
    }
  }

  for (const statement of program.body) {
    const reexport = statement.type === 'ExportNamedDeclaration' && statement.source
      && statement.specifiers.some((specifier: AstNode) => specifier.exported.name === name)

    if (reexport) {
      const target = resolveModule(dirname(file), statement.source.value)
      const found = target && findDeclaration(target, name)

      if (found) {
        return found
      }
    }
  }

  return undefined
}

function resolveModule(directory: string, specifier: string): string | undefined {
  const file = join(directory, `${specifier}.ts`)

  return existsSync(file)
    ? file
    : undefined
}

/** The JSDoc block above a statement, with nothing but line comments (`// eslint-disable-next-line`...) between them */
function jsDocOf(statement: AstNode): string | undefined {
  const { source, comments } = moduleOfNode.get(statement)!
  const comment = comments.filter(candidate => candidate.type === 'Block' && candidate.value.startsWith('*') && candidate.end <= statement.start).at(-1)

  return comment && source.slice(comment.end, statement.start).replaceAll(/\/\/[^\n]*/g, '').trim() === ''
    ? comment.value
    : undefined
}

const MAX_CONST_LENGTH = 200

/** The declaration as TypeScript, without `export` nor the body of a function */
function signatureOf({ kind, statement, node }: Declaration): string {
  const { source } = moduleOfNode.get(statement)!
  const text = (start: number, end: number) => source.slice(start, end).trim()

  switch (kind) {
    case 'function':
      return text(node.start, node.body?.start ?? node.end)
    case 'class': {
      const constructor = node.body.body.find((member: AstNode) => member.kind === 'constructor')

      return `${text(node.start, node.body.start)} {${constructor
        ? `\n  ${text(constructor.start, constructor.value.body.start)}\n`
        : ' '}...}`
    }
    case 'const': {
      const whole = text(node.start, node.end)

      if (whole.length <= MAX_CONST_LENGTH) {
        return whole
      }

      const declarator = node.declarations[0]

      return `${text(node.start, declarator.init?.start ?? node.end).trimEnd().replace(/=$/, '').trimEnd()} = ...`
    }
    default:
      return text(node.start, node.end)
  }
}

/** `- \`name\`: text` of a `@param name - text` */
function formatParam(text: string): string {
  const untyped = text.startsWith('{')
    ? text.slice(text.indexOf('}') + 1).trimStart()
    : text
  const end = untyped.search(/\s/)
  const name = end === -1
    ? untyped
    : untyped.slice(0, end)
  const description = untyped.slice(name.length).trimStart().replace(/^-\s*/, '').replaceAll(/\n\s*/g, ' ').trim()

  return `- \`${name}\`: ${description}`
}

function renderEntry(name: string, declaration: Declaration): { markdown: string, summary: string } {
  const jsDoc = jsDocOf(declaration.statement)
  const { description, tags } = jsDoc
    ? parseJsDocTags(jsDoc)
    : { description: '', tags: [] }
  const params = tags.filter(tag => tag.name === 'param')
  const returns = tags.find(tag => tag.name === 'returns' || tag.name === 'return')
  const examples = tags.filter(tag => tag.name === 'example')
  const throwsTags = tags.filter(tag => tag.name === 'throws')
  const deprecated = tags.find(tag => tag.name === 'deprecated')
  const sees = tags.filter(tag => tag.name === 'see')
  const code = signatureOf(declaration)

  const markdown = [
    `### ${name}`,
    ...(deprecated
      ? ['', `**Deprecated.** ${deprecated.text}`]
      : []),
    ...(description
      ? ['', description]
      : []),
    '',
    '```ts',
    code,
    '```',
    ...(params.length > 0
      ? [
          '',
          '**Parameters**',
          '',
          ...params.map(param => formatParam(param.text)),
        ]
      : []),
    ...(returns
      ? ['', `**Returns**: ${returns.text.replaceAll(/\n\s*/g, ' ')}`]
      : []),
    ...throwsTags.map(thrown => `\n**Throws**: ${thrown.text.replace(/^\{[^}]*\}\s*/, '').replaceAll(/\n\s*/g, ' ')}`),
    ...examples.flatMap(example => ['', '**Example**', '', example.text]),
    ...(sees.length > 0
      ? [
          '',
          ...sees.map(see => `See: ${see.text}`),
        ]
      : []),
  ].join('\n')

  return {
    markdown,
    summary: summarize(description),
  }
}

/** The exports of `src/index.ts` of core, with the markdown of each, grouped by domain by `renderCoreApiPages()` */
export function extractCoreApi(coreSrcDir: string): CoreApiEntry[] {
  const index = parseModule('index.ts', readFileSync(join(coreSrcDir, 'index.ts'), 'utf8'))
  const entries: CoreApiEntry[] = []

  for (const statement of index.program.body) {
    if (statement.type !== 'ExportNamedDeclaration' || !statement.source) {
      continue
    }

    const specifier = statement.source.value as string
    const moduleName = specifier.replace(/^\.\//, '')
    const file = resolveModule(coreSrcDir, moduleName)

    for (const exported of statement.specifiers) {
      const name = exported.exported.name as string
      const found = file && findDeclaration(file, name)

      if (!found) {
        throw new Error(`The export "${name}" of @relizy/core (${specifier}) has no declaration`)
      }

      const domain = moduleName === 'types'
        ? TYPE_DOMAINS[name]
        : MODULE_DOMAINS[moduleName] ?? (moduleName.startsWith('commitlint/')
          ? 'commitlint'
          : undefined)

      if (!domain) {
        throw new Error(`The export "${name}" of @relizy/core (${specifier}) has no domain: add it to core-api.ts`)
      }

      const { markdown, summary } = renderEntry(name, found.declaration)

      entries.push({
        name,
        kind: found.declaration.kind,
        domain,
        docId: `core/${domain}`,
        summary,
        markdown,
      })
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}

const SECTIONS: { title: string, kinds: CoreExportKind[] }[] = [
  {
    title: 'Functions',
    kinds: ['function'],
  },
  {
    title: 'Constants and classes',
    kinds: ['const', 'class'],
  },
  {
    title: 'Types',
    kinds: ['interface', 'type'],
  },
]

/** The pages of the reference: an overview and one page per domain */
export function renderCoreApiPages(entries: CoreApiEntry[], version: string): { id: string, title: string, description: string, markdown: string, names: string[] }[] {
  const domainPages = CORE_DOMAINS.map((domain) => {
    const own = entries.filter(entry => entry.domain === domain.id)
    const markdown = [
      `# @relizy/core ${domain.title}`,
      '',
      domain.description,
      '',
      'Every export is imported from `@relizy/core`.',
      ...SECTIONS.flatMap(({ title, kinds }) => {
        const section = own.filter(entry => kinds.includes(entry.kind))

        return section.length > 0
          ? [
              '',
              `## ${title}`,
              '',
              section.map(entry => entry.markdown).join('\n\n'),
            ]
          : []
      }),
    ].join('\n')

    return {
      id: `core/${domain.id}`,
      title: `@relizy/core ${domain.title}`,
      description: domain.description,
      markdown,
      names: own.map(entry => entry.name),
    }
  })

  const overview = [
    `# @relizy/core ${version}`,
    '',
    'The generic building blocks of relizy, published on their own: workspaces, catalogs, package managers and registries, git and CI helpers, commit parsing and linting, versions, tags, changelog data and markdown, GitHub and GitLab releases.',
    '',
    '## Use',
    '',
    '```sh',
    'pnpm add @relizy/core',
    '```',
    '',
    '- Every function takes plain parameters (`cwd`, paths, an options object): no config object, no global state. Read the signature and the options of an export with `get_doc({ id: "core/<domain>", sections: ["<name>"] })`.',
    '- A function reports what it does through an optional `logger` (`CoreLogger`, every method optional); without one it is silent. Nothing is written to stdout.',
    '- Git runs without a shell (`runGit`, `runGitSync`); the git reads of `cachedGitRead` are cached inside `withGitCache`.',
    '- The exports are listed in `src/index.ts` of the package.',
    '',
    '## Domains',
    '',
    ...domainPages.flatMap(page => [`- \`${page.id}\`: ${page.description} (${page.names.length} exports)`]),
  ].join('\n')

  return [
    {
      id: 'core/overview',
      title: `@relizy/core ${version}`,
      description: 'Overview of @relizy/core: install, conventions and the domains of its API.',
      markdown: overview,
      names: [],
    },
    ...domainPages,
  ]
}
