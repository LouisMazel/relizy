import type { GitCommit } from 'changelogen'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { createMockConfig } from '../../../tests/mocks'
import { getChangelogLinter, getChangelogTitle, renderChangelogEntry } from '../commitlint/changelog-entry'

function createCommit(overrides: Partial<GitCommit> = {}): GitCommit {
  return {
    message: 'feat(core): add the parser',
    body: 'Parses the messages.',
    shortHash: 'abc1234',
    author: { name: 'Test', email: 'test@example.com' },
    authors: [],
    description: 'add the parser',
    type: 'feat',
    scope: 'core',
    references: [],
    isBreaking: false,
    ...overrides,
  }
}

const INVALID_TS = '```ts\nai: {\n  global: \'a\',\n  slack: \'b\',\n}\n```'
const VALID_TS = '```ts\nexport default defineConfig({ ai: { slack: \'b\' } })\n```'

describe('Given getChangelogTitle function', () => {
  const config = createMockConfig({ types: { feat: { title: '🚀 Features', semver: 'minor' }, chore: false, wip: { title: '' } } })

  it.each([
    ['feat', '🚀 Features'],
    ['chore', undefined],
    ['wip', undefined],
    ['unknown', undefined],
  ])('Then returns the section of "%s"', (type, expected) => {
    expect(getChangelogTitle(type, config)).toBe(expected)
  })
})

describe('Given renderChangelogEntry function', () => {
  const config = createMockConfig({ types: { feat: { title: '🚀 Features', semver: 'minor' }, chore: false } })

  it('Then renders the commit with its body as in the CHANGELOG.md files', () => {
    expect(renderChangelogEntry(createCommit(), config)).toBe('### 🚀 Features\n\n- **core:** Add the parser\n\n  Parses the messages.')
  })

  it('Then lists a breaking commit in the breaking changes section too', () => {
    expect(renderChangelogEntry(createCommit({ isBreaking: true, body: '' }), config)).toBe('### 🚀 Features\n\n- **core:** ⚠️  Add the parser\n\n#### ⚠️ Breaking Changes\n\n- **core:** ⚠️  Add the parser')
  })

  it('Then renders nothing for a commit absent from the changelog', () => {
    expect(renderChangelogEntry(createCommit({ type: 'chore' }), config)).toBeUndefined()
  })
})

describe('Given getChangelogLinter function', () => {
  const directories: string[] = []

  function createProject(files: Record<string, string> = {}, { withEslint = false } = {}): string {
    const cwd = mkdtempSync(join(tmpdir(), 'relizy-commitlint-linter-'))
    directories.push(cwd)
    writeFileSync(join(cwd, 'package.json'), '{ "name": "project", "type": "module" }')
    if (withEslint) {
      mkdirSync(join(cwd, 'node_modules'))
      symlinkSync(realpathSync(join(process.cwd(), 'node_modules/eslint')), join(cwd, 'node_modules/eslint'))
    }
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(cwd, name), content)
    }
    return cwd
  }

  afterAll(() => {
    directories.forEach(directory => rmSync(directory, { recursive: true, force: true }))
  })

  describe('When the project has no ESLint', () => {
    it('Then uses the built-in parser, once per project', async () => {
      const cwd = createProject()
      const linter = await getChangelogLinter(cwd)

      expect(linter.name).toBe('oxc')
      expect(getChangelogLinter(cwd)).toBe(getChangelogLinter(cwd))
    })

    it.each([
      ['an invalid ts block', INVALID_TS, [/^Invalid ts code block: .+, on "slack: 'b',"$/]],
      ['a valid ts block', VALID_TS, []],
      ['a typescript block', '```typescript\nconst = 1\n```', [/^Invalid typescript code block/]],
      ['a valid tsx block', '```tsx\nexport const App = () => <div>{value}</div>\n```', []],
      ['an invalid js block', '```js\nconst = 1\n```', [/^Invalid js code block: .+, on "const = 1"/]],
      ['an invalid json block', '```json\n{ "a": 1, }\n```', [/^Invalid JSON code block: .+, in the block starting with "\{ "a": 1, \}"/]],
      ['a valid json block', '```json\n{ "a": 1 }\n```', []],
      ['a bash block', '```bash\nif then fi (\n```', []],
      ['a block without language', '```\nconst = 1\n```', []],
      ['a nested block', '- item\n\n  ```js\n  const = 1\n  ```', [/^Invalid js code block/]],
    ])('Then checks %s', async (_, markdown, expected) => {
      const problems = await (await getChangelogLinter(createProject())).lint(markdown)

      expect(problems).toHaveLength(expected.length)
      problems.forEach((problem, index) => expect(problem).toMatch(expected[index]!))
    })
  })

  describe('When the project ESLint lints the changelogs', () => {
    it('Then lints the entry with it, like the release formatting does', async () => {
      const linter = await getChangelogLinter(process.cwd())

      expect(linter.name).toBe('eslint')
      expect(await linter.lint(`# Changelog\n\n## v1.0.0\n\n### Features\n\n- Add the parser\n\n  ${INVALID_TS.replaceAll('\n', '\n  ')}\n`))
        .toEqual(['Parsing error: \';\' expected, on "slack: \'b\',"'])
      expect(await linter.lint(`# Changelog\n\n## v1.0.0\n\n### Features\n\n- Add the parser\n\n  ${VALID_TS.replaceAll('\n', '\n  ')}\n`))
        .toEqual([])
    }, 60_000)
  })

  describe('When the project ESLint does not lint the changelogs', () => {
    it.each([
      ['it only lints the JavaScript files', { 'eslint.config.mjs': 'export default [{ files: [\'**/*.js\'] }]' }],
      ['it ignores the changelogs', { 'eslint.config.mjs': 'export default [{ ignores: [\'CHANGELOG.md\'] }, { files: [\'**/*.md\'] }]' }],
      ['its config cannot be loaded', { 'eslint.config.mjs': 'throw new Error(\'broken config\')' }],
    ])('Then uses the built-in parser when %s', async (_, files) => {
      const linter = await getChangelogLinter(createProject(files, { withEslint: true }))

      expect(linter.name).toBe('oxc')
    }, 30_000)
  })

  describe('When oxc-parser cannot be loaded', () => {
    beforeEach(() => {
      vi.resetModules()
      vi.doMock('oxc-parser', () => {
        throw new Error('no binding')
      })
    })

    afterEach(() => {
      vi.doUnmock('oxc-parser')
    })

    it('Then warns and does not check the code blocks', async () => {
      const { getChangelogLinter: getLinter } = await import('../commitlint/changelog-entry')
      const linter = await getLinter(createProject())

      expect(await linter.lint('```json\n{ "a": 1, }\n```\n\n```ts\nconst = 1\n```')).toEqual([expect.stringMatching(/^Invalid JSON/)])
      expect(logger.warn).toHaveBeenCalledWith('commitlint: oxc-parser could not be loaded, the code blocks of the commit bodies are not checked')
    })
  })
})
