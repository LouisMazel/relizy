import type { Knowledge } from '../knowledge/load'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { getDefaultConfig } from '../../core'
import { cleanMarkdown, CONFIG_DOC_IDS, extractConfigReference, parseFrontmatter, parseJsDoc } from '../knowledge/generate'
import { loadKnowledge } from '../knowledge/load'
import { defaultBundleDir } from '../knowledge/paths'
import { cleanTempDirs, createTempDir, getBundleDir, getKnowledge, ROOT_DIR } from './helpers'

afterAll(() => {
  cleanTempDirs()
})

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))
}

/** Doc ids cited by the MCP server: tool descriptions, instructions, prompts and rules */
function citedDocIds(): string[] {
  const files = [
    ...listFiles(join(ROOT_DIR, 'src/mcp')).filter(file => file.endsWith('.ts') && !file.includes('__tests__')),
    join(ROOT_DIR, 'src/mcp/content/rules.md'),
  ]
  const ids = files.flatMap(file => [...readFileSync(file, 'utf8').matchAll(/["`]((?:guide|config|cli|commitlint|api)\/[a-z-]+)[#"`]/g)].map(match => match[1]!))

  return [...new Set([...ids, ...Object.values(CONFIG_DOC_IDS)])]
}

describe('Given the docs bundle generated from the sources', () => {
  let knowledge: Knowledge

  beforeAll(() => {
    knowledge = getKnowledge()
  })

  describe('When it is written', () => {
    it('Then it holds the manifest, the pages, the rules and an index', () => {
      const directory = getBundleDir()

      expect(existsSync(join(directory, 'manifest.json'))).toBe(true)
      expect(existsSync(join(directory, 'README.md'))).toBe(true)
      expect(readFileSync(join(directory, 'agents/claude-rule.md'), 'utf8')).toMatch(/^# relizy\n\nThis project releases with \*\*relizy\*\*/)
      expect(readFileSync(join(directory, 'agents/agents-md.md'), 'utf8')).toMatch(/^## relizy\n\n/)
      expect(knowledge.manifest.version).toBe(JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8')).version)
      expect(knowledge.docs.every(doc => existsSync(join(directory, doc.file)))).toBe(true)
    })

    it('Then the pages have unique ids and no VitePress syntax left', () => {
      const ids = knowledge.docs.map(doc => doc.id)

      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toEqual(expect.arrayContaining(['guide/getting-started', 'guide/version-groups', 'config/bump', 'cli/release', 'commitlint/rules', 'api/bump']))
      expect(ids).not.toContain('index')
      expect(ids).not.toContain('guide/contributing')
      expect(ids.some(id => id.startsWith('typedoc'))).toBe(false)

      for (const doc of knowledge.docs) {
        const content = knowledge.readDoc(doc.id)

        expect(content, doc.id).not.toContain('$frontmatter')
        expect(content, doc.id).not.toContain('v-pre')
        expect(content, doc.id).not.toContain('@include')
        expect(content, doc.id).not.toMatch(/\]\(\.{1,2}\/[^)]*\.md/)
      }
    })

    it('Then the links between pages point to existing doc ids', () => {
      const missing = knowledge.docs.flatMap(doc => [...knowledge.readDoc(doc.id).matchAll(/\]\(((?:guide|config|cli|commitlint|api)\/[a-z-]+)(?:#[^)]*)?\)/g)]
        .map(match => match[1]!)
        .filter(id => !knowledge.docsById.has(id))
        .map(id => `${doc.id} -> ${id}`))

      expect(missing).toEqual([])
    })
  })

  describe('When the config reference is read', () => {
    it('Then every top-level key of the default config is documented', () => {
      const documented = new Set(knowledge.config.map(option => option.path))

      expect(Object.keys(getDefaultConfig()).filter(key => !documented.has(key))).toEqual([])
    })

    it('Then the nested options are documented with their JSDoc', () => {
      expect(knowledge.configByPath.get('bump.outOfRangePeers')).toEqual(expect.objectContaining({ type: '\'bump\' | \'warn\' | \'error\'', default: '\'bump\'', docId: 'config/bump' }))
      expect(knowledge.configByPath.get('monorepo.groups[].versionMode')).toEqual(expect.objectContaining({ type: 'VersionMode', docId: 'config/monorepo' }))
      expect(knowledge.configByPath.get('monorepo.ignorePackageNames')?.deprecated).toContain('Use `ignored`')
      expect(knowledge.configByPath.has('monorepo.groups[].bump.capZeroMajor')).toBe(true)
      expect(knowledge.configByPath.has('monorepo.groups[].bump.type')).toBe(false)
      expect(knowledge.configByPath.get('scopeMap')?.docId).toBe('config/overview')
    })

    it('Then every option points to an existing doc page', () => {
      expect(knowledge.config.filter(option => !knowledge.docsById.has(option.docId)).map(option => `${option.path} -> ${option.docId}`)).toEqual([])
    })
  })

  describe('When the MCP server cites doc pages', () => {
    it('Then they all exist, so a renamed page fails here', () => {
      const ids = citedDocIds()

      expect(ids.length).toBeGreaterThan(15)
      expect(ids.filter(id => !knowledge.docsById.has(id))).toEqual([])
    })
  })

  describe('When a CLI command is added', () => {
    it('Then it has its page in the docs', () => {
      const commands = [...readFileSync(join(ROOT_DIR, 'src/cli.ts'), 'utf8').matchAll(/^program\n {2}\.command\('([a-z-]+)'/gm)].map(match => match[1]!)
      const pages = commands.map(command => command === 'commitlint' ? 'commitlint/cli' : `cli/${command}`)

      expect(commands.length).toBeGreaterThan(5)
      expect(pages.filter(page => !knowledge.docsById.has(page))).toEqual([])
    })
  })
})

describe('Given parseFrontmatter', () => {
  describe('When the page has a frontmatter', () => {
    it('Then it reads its fields, unquoted, and returns the body', () => {
      expect(parseFrontmatter('---\ntitle: "Bump"\ndescription: \'Bump versions\'\nkeywords: a, b\ntags: [x]\n---\n\n# Body')).toEqual({
        data: { title: 'Bump', description: 'Bump versions', keywords: 'a, b', tags: '[x]' },
        body: '\n# Body',
      })
    })
  })

  describe('When the page has no frontmatter', () => {
    it('Then the body is the whole page', () => {
      expect(parseFrontmatter('# Title\n---\n')).toEqual({ data: {}, body: '# Title\n---\n' })
    })
  })
})

describe('Given cleanMarkdown', () => {
  describe('When a page uses the VitePress syntax and links to other pages', () => {
    it('Then it replaces the variables and turns the links into doc ids', () => {
      const markdown = [
        '# {{ $frontmatter.title }}',
        '{{ $frontmatter.description }}',
        'Template <code v-pre>{{newVersion}}</code>.',
        'See [release](/cli/release#branch-safety), [bump](../config/bump.md), [start](./getting-started.md#install), [guide](/guide/), [home](/) and [GitHub](https://github.com).',
      ].join('\n')

      expect(cleanMarkdown(markdown, { title: 'Version groups', description: 'Release groups' }, 'guide/version-groups')).toBe([
        '# Version groups',
        'Release groups',
        'Template `{{newVersion}}`.',
        'See [release](cli/release#branch-safety), [bump](config/bump), [start](guide/getting-started#install), [guide](guide), [home](/) and [GitHub](https://github.com).',
      ].join('\n'))
    })

    it('Then the variables are emptied without frontmatter', () => {
      expect(cleanMarkdown('# {{ $frontmatter.title }}', {}, 'cli/bump')).toBe('#')
    })
  })
})

describe('Given parseJsDoc', () => {
  describe('When a comment has a description and tags on several lines', () => {
    it('Then it splits them', () => {
      expect(parseJsDoc('*\n * First line\n * second line\n *\n * @default true\n * @deprecated Use `b`\n *   instead\n * @see https://relizy.dev\n ')).toEqual({
        description: 'First line\nsecond line',
        tags: { default: 'true', deprecated: 'Use `b`\ninstead', see: 'https://relizy.dev' },
      })
    })
  })
})

describe('Given extractConfigReference', () => {
  describe('When the types use interfaces, aliases, arrays, unions, Pick and inline objects', () => {
    it('Then it documents every reachable option once', () => {
      const source = `
interface Base {
  /** Inherited option */
  base?: string
}
export interface Child {
  /**
   * Name of the child
   * @default 'a'
   */
  name: string
  /** @deprecated */
  old?: boolean
  /** Back to the parent */
  parent?: RelizyConfig
}
export type Options = { inline: number } & { other: string }
export interface Picked { keep: string, drop: string }
export interface RelizyConfig extends Base {
  /** Children */
  children?: Child[]
  options?: Partial<Options>
  either?: boolean | Child
  picked?: Pick<Picked, 'keep'>
  nested?: {
    /** Deep option */
    deep: string
  }
  'quoted-key'?: string
  scopeMap?: Record<string, string>
}
`
      const options = extractConfigReference(source)

      expect(options.map(option => option.path)).toEqual([
        'base',
        'children',
        'children[].name',
        'children[].old',
        'children[].parent',
        'options',
        'options.inline',
        'options.other',
        'either',
        'either.name',
        'either.old',
        'either.parent',
        'picked',
        'picked.keep',
        'nested',
        'nested.deep',
        'scopeMap',
      ])
      expect(options.find(option => option.path === 'children[].name')).toEqual({ path: 'children[].name', type: 'string', description: 'Name of the child', default: '\'a\'', docId: 'config/overview' })
      expect(options.find(option => option.path === 'children[].old')?.deprecated).toBe('Deprecated')
      expect(options.find(option => option.path === 'nested')?.type).toBe('object')
      expect(options.find(option => option.path === 'scopeMap')?.description).toBe('')
    })
  })

  describe('When a type hides its values behind an alias', () => {
    it('Then it lists the values, and only when the type does not show them', () => {
      const source = `
export type Mode = 'unified' | 'selective'
type Level = Mode | 'off' | 0
export interface RelizyConfig {
  mode?: Mode
  modes?: Mode[]
  items?: Array<Level>
  inline?: 'a' | 'b'
  enabled?: boolean
  either?: boolean | 'warn'
  other?: Mode | Record<string, string>
}
`
      const values = Object.fromEntries(extractConfigReference(source).map(option => [option.path, option.values]))

      expect(values).toEqual({
        mode: ['"unified"', '"selective"'],
        modes: ['"unified"', '"selective"'],
        items: ['"unified"', '"selective"', '"off"', '0'],
        inline: undefined,
        enabled: undefined,
        either: undefined,
        other: undefined,
      })
    })
  })
})

describe('Given loadKnowledge', () => {
  describe('When the bundle is missing', () => {
    it('Then it explains how to get it', () => {
      expect(() => loadKnowledge(createTempDir())).toThrow('The docs bundle of relizy is missing')
    })
  })

  describe('When the manifest is invalid', () => {
    it('Then it reports the problem', () => {
      const directory = createTempDir()
      writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ name: 'maz-ui' }))

      expect(() => loadKnowledge(directory)).toThrow('The docs bundle of relizy is invalid')
    })
  })

  describe('When RELIZY_AGENT_DOCS_DIR is set', () => {
    it('Then it reads the bundle of this folder', () => {
      vi.stubEnv('RELIZY_AGENT_DOCS_DIR', getBundleDir())

      expect(loadKnowledge().directory).toBe(getBundleDir())
      vi.unstubAllEnvs()
    })
  })

  describe('When a page is read twice or an unknown page is read', () => {
    it('Then the page is cached and an unknown id throws', () => {
      const knowledge = loadKnowledge(getBundleDir())
      const first = knowledge.readDoc('config/bump')

      expect(knowledge.readDoc('config/bump')).toBe(first)
      expect(() => knowledge.readDoc('config/nothing')).toThrow('Unknown doc "config/nothing"')
    })
  })
})

describe('Given defaultBundleDir', () => {
  describe('When it runs from the sources', () => {
    it('Then it finds the agent-docs folder at the root of the repository, or falls back to the package folder', () => {
      const directory = defaultBundleDir(join(ROOT_DIR, 'src/mcp/knowledge'))

      expect([join(ROOT_DIR, 'agent-docs'), join(ROOT_DIR, 'src/agent-docs')]).toContain(directory)
      expect(defaultBundleDir(join(process.cwd(), 'nowhere/a/b/c'))).toBe(join(process.cwd(), 'nowhere/a/b/agent-docs'))
    })
  })
})
