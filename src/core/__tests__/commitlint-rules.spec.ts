import type { DeepPartial } from '@maz-ui/utils/ts-helpers/DeepPartial'
import type { CommitlintCommit, RelizyConfig } from '../../types'
import type { WorkspacePackage } from '../commitlint/workspace'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { createMockConfig } from '../../../tests/mocks'
import { lintCommitMessage } from '../commitlint/lint'
import { normalizeRuleConfig } from '../commitlint/rules'

const PACKAGES: WorkspacePackage[] = [
  { name: '@maz-ui/nuxt', path: 'packages/nuxt', scopes: ['nuxt', '@maz-ui/nuxt'] },
  { name: 'core', path: 'packages/core', scopes: ['core'] },
]

// A directory without ESLint: the code blocks are checked with the built-in parser
const cwd = mkdtempSync(join(tmpdir(), 'relizy-commitlint-rules-'))

afterAll(() => {
  rmSync(cwd, { recursive: true, force: true })
})

function lint(message: string, { config, files, packages = PACKAGES }: {
  config?: DeepPartial<RelizyConfig>
  files?: string[]
  packages?: WorkspacePackage[]
} = {}) {
  return lintCommitMessage(message, { config: createMockConfig({ cwd, ...config }), files, packages })
}

async function rulesOf(message: string, options?: Parameters<typeof lint>[1]) {
  return (await lint(message, options)).problems.map(problem => problem.rule)
}

async function messagesOf(message: string, options?: Parameters<typeof lint>[1]) {
  return (await lint(message, options)).problems.map(problem => problem.message)
}

/** What is wrong and how to fix it */
async function problemsOf(message: string, options?: Parameters<typeof lint>[1]) {
  return (await lint(message, options)).problems.map(({ message, fix }) => ({ message, fix }))
}

describe('Given lintCommitMessage function', () => {
  describe('When the message is valid', () => {
    it('Then reports no problem and parses it like relizy', async () => {
      const result = await lint('feat(nuxt): add the module options (#12)', { files: ['packages/nuxt/src/module.ts'] })

      expect(result.valid).toBe(true)
      expect(result.problems).toEqual([])
      expect(result.changelogTitle).toBe('🚀 Enhancements')
      expect(result.commit).toEqual(expect.objectContaining({
        type: 'feat',
        scope: 'nuxt',
        subject: 'add the module options (#12)',
        bump: 'minor',
        isBreaking: false,
        files: ['packages/nuxt/src/module.ts'],
        packages: ['@maz-ui/nuxt'],
      }))
      expect(result.commit.references).toContainEqual({ type: 'pull-request', value: '#12' })
    })

    it('Then keeps the scope as written, before the scopeMap', async () => {
      const result = await lint('fix(ui): correct the nuxt module', { config: { scopeMap: { ui: 'nuxt' } } })

      expect(result.commit.scope).toBe('ui')
      expect(result.valid).toBe(true)
    })
  })

  describe('When some errors of the header can be fixed', () => {
    it('Then suggests a fixed header, linted again', async () => {
      const result = await lint('Fix(nuxtt): Correct the module options.')

      expect(result.suggestion).toEqual({ header: 'fix(nuxt): correct the module options', remainingRules: [] })
    })

    it('Then lists the errors the suggestion does not fix', async () => {
      expect((await lint('fix(nuxtt): Typo.')).suggestion).toEqual({ header: 'fix(nuxt): typo', remainingRules: ['subject-meaningful'] })
    })

    it.each([
      ['the errors are not in the header', 'feat: add a new thing\nThe body.'],
      ['nothing can be fixed', 'wip'],
      ['the fix changes nothing', 'fix: wip'],
    ])('Then suggests nothing when %s', async (_, message) => {
      expect((await lint(message)).suggestion).toBeUndefined()
    })
  })

  describe('When the commit is ignored', () => {
    it('Then lints nothing', async () => {
      const result = await lint('Merge branch \'main\' into develop')

      expect(result).toEqual(expect.objectContaining({ ignored: true, valid: true, problems: [] }))
    })
  })

  describe('When the header is not a conventional commit', () => {
    it('Then only reports the header and the body problems', async () => {
      expect(await rulesOf('wip\nbody')).toEqual(['header-format', 'body-leading-blank'])
    })
  })

  describe('When computing the bump like relizy', () => {
    it.each([
      ['feat: add a new thing', 'minor'],
      ['fix: correct a bug in the parser', 'patch'],
      ['perf: speed up the parser', 'patch'],
      ['chore: tidy the scripts up', undefined],
      ['test: cover the parser better', undefined],
      ['feat!: drop the legacy option', 'major'],
      ['chore!: drop node 18 support', undefined],
      ['fix: correct a bug in the parser\n\nBREAKING CHANGE: the output changed', 'major'],
      ['chore(deps): upgrade the dependencies', undefined],
      ['build(deps): upgrade the dependencies', 'patch'],
    ])('Then "%s" bumps %s', async (message, bump) => {
      expect((await lint(message)).commit.bump).toBe(bump)
    })

    it('Then follows the types of the config', async () => {
      const config = { types: { feat: { title: 'Features', semver: 'patch' as const }, chore: false as const } }

      expect((await lint('feat: add a new thing', { config })).commit.bump).toBe('patch')
      expect((await lint('chore: tidy the scripts up', { config })).changelogTitle).toBeUndefined()
    })
  })

  describe('When checking the header format', () => {
    const FORMAT = 'write "type(scope): subject", e.g. "feat(core): add the parser"'

    it.each([
      [' feat: add a new thing', 'The header starts or ends with whitespace', 'remove the spaces around the header'],
      ['feat: add a new thing ', 'The header starts or ends with whitespace', 'remove the spaces around the header'],
      ['Revert "feat: add a new thing"', 'The header is the default revert message of git', 'rewrite it as a conventional commit, e.g. "fix(core): revert the parser change", or add a "revert" type to the relizy types'],
      ['feat:add a new thing', 'A space is missing after the colon', FORMAT],
      ['feat : add a new thing', 'There is a space before the colon', FORMAT],
      ['Feat: add a new thing', 'The type "Feat" is not lowercase', 'write "feat"'],
      ['fEat(core): add a new thing', 'The type "fEat" is not lowercase', 'write "feat"'],
      ['feat(): add a new thing', 'The scope is empty or contains spaces', 'use a single word, e.g. "feat(core): add the parser"'],
      ['feat(my scope): add a new thing', 'The scope is empty or contains spaces', 'use a single word, e.g. "feat(core): add the parser"'],
      ['✨ feat: add a new thing', 'The header is not a conventional commit', FORMAT],
      ['add a new thing', 'The header is not a conventional commit', FORMAT],
    ])('Then rejects "%s"', async (message, expected, fix) => {
      expect(await problemsOf(message)).toContainEqual({ message: expected, fix })
    })

    it('Then reports a type in the wrong case once', async () => {
      expect(await rulesOf('Feat: add a new thing')).toEqual(['header-format'])
    })

    it('Then advises "revert:" when the relizy types have a revert type', async () => {
      const types = { revert: { title: 'Reverts', semver: 'patch' as const } }

      expect((await problemsOf('Revert "feat: add a new thing"', { config: { types } }))[0])
        .toEqual({ message: 'The header is the default revert message of git', fix: 'write it as "revert: <reverted header>"' })
    })

    it('Then accepts the breaking marker', async () => {
      expect(await rulesOf('feat(core)!: drop the legacy option')).toEqual([])
    })
  })

  describe('When checking the header length', () => {
    it('Then allows 500 characters by default', async () => {
      expect(await rulesOf(`feat: ${'a'.repeat(494)}`)).toEqual([])
      expect(await rulesOf(`feat: ${'a'.repeat(495)}`)).toEqual(['header-max-length'])
    })

    it('Then uses the configured length', async () => {
      expect(await problemsOf('feat: add a rather long description', { config: { commitlint: { rules: { 'header-max-length': ['error', 20] } } } }))
        .toEqual([{ message: 'The header is 35 characters long, the maximum is 20', fix: 'shorten the subject and move the details to the body' }])
    })
  })

  describe('When checking the type', () => {
    it('Then rejects a type unknown to relizy', async () => {
      expect(await problemsOf('feature: add a new thing')).toEqual([{
        message: 'The type "feature" is unknown to relizy',
        fix: 'use one of: feat, perf, fix, refactor, docs, build, types, chore, examples, test, style, ci',
      }])
    })

    it('Then suggests the closest type of a typo', async () => {
      expect((await problemsOf('feta: add a new thing'))[0]?.fix).toMatch(/^did you mean "feat"\? use one of: /)
    })

    it('Then accepts the extra types of the rule value', async () => {
      expect(await rulesOf('wip: start the new parser', { config: { commitlint: { rules: { 'type-enum': ['error', ['wip']] } } } })).toEqual([])
    })
  })

  describe('When checking the scope', () => {
    it.each(['nuxt', '@maz-ui/nuxt', 'core', 'ui', 'ci'])('Then accepts the scope "%s"', async (scope) => {
      expect(await rulesOf(`fix(${scope}): correct the options`, { config: { scopeMap: { ui: 'nuxt' }, commitlint: { scopes: ['ci'] } } })).toEqual([])
    })

    it('Then rejects a scope designating nothing', async () => {
      expect(await problemsOf('fix(nuxtt): correct the options', { config: { commitlint: { scopes: ['ci'] } } }))
        .toEqual([{ message: 'The scope "nuxtt" is not allowed', fix: 'did you mean "nuxt"? use a workspace package or one of: nuxt, @maz-ui/nuxt, core, ci' }])
    })

    it('Then truncates a long list of allowed scopes', async () => {
      const scopes = Array.from({ length: 30 }, (_, index) => `scope-${index}`)
      const [problem] = await problemsOf('fix(other): correct the options', { packages: [], config: { commitlint: { scopes } } })

      expect(problem?.fix).toMatch(/scope-19, \.\.\.$/)
    })

    it('Then lists the explicit scopes in standalone mode', async () => {
      expect(await problemsOf('fix(other): correct the options', { packages: [], config: { commitlint: { scopes: ['ci', 'deps'] } } }))
        .toEqual([{ message: 'The scope "other" is not allowed', fix: 'use one of: ci, deps' }])
    })

    it('Then allows any scope in standalone mode without explicit list', async () => {
      expect(await rulesOf('fix(anything): correct the options', { packages: [] })).toEqual([])
    })
  })

  describe('When requiring the scope', () => {
    const withRule = (value?: string) => ({ commitlint: { rules: { 'scope-required': value ? ['error', value] as ['error', string] : 'error' as const } } })

    it('Then does not require it by default', async () => {
      expect(await rulesOf('feat: add a new thing')).toEqual([])
    })

    it('Then requires it always when enabled without value', async () => {
      expect(await problemsOf('chore: tidy the scripts up', { config: withRule() }))
        .toEqual([{ message: 'The scope is missing', fix: 'add one, e.g. "chore(core): tidy the scripts up"' }])
      expect(await rulesOf('chore(core): tidy the scripts up', { config: withRule() })).toEqual([])
    })

    it('Then forbids it with "never"', async () => {
      expect(await problemsOf('feat(core): add a new thing', { config: withRule('never') }))
        .toEqual([{ message: 'The scope is not allowed in this project', fix: 'remove "(core)"' }])
      expect(await rulesOf('feat: add a new thing', { config: withRule('never') })).toEqual([])
    })

    describe('When it is required when bumping', () => {
      it('Then requires it for a bumping commit touching a package', async () => {
        expect(await problemsOf('feat: add a new thing', { config: withRule('when-bumping'), files: ['packages/nuxt/src/index.ts'] }))
          .toEqual([{ message: 'The scope is missing on a minor commit touching @maz-ui/nuxt', fix: 'add the scope of the package: "feat(nuxt): add a new thing"' }])
      })

      it.each([
        ['a commit without bump', 'chore: tidy the scripts up', ['packages/nuxt/index.ts']],
        ['a commit touching no package', 'fix: correct the root script', ['scripts/build.ts']],
        ['unknown files', 'fix: correct the root script', undefined],
        ['no staged file', 'fix: correct the root script', []],
      ])('Then does not require it for %s', async (_, message, files) => {
        expect(await rulesOf(message, { config: withRule('when-bumping'), files })).toEqual([])
      })

      it('Then shortens a long list of touched packages', async () => {
        const packages = Array.from({ length: 6 }, (_, index) => ({ name: `pkg-${index}`, path: `packages/pkg-${index}`, scopes: [`pkg-${index}`] }))
        const files = packages.map(pkg => `${pkg.path}/index.ts`)

        expect(await problemsOf('build: upgrade the dependencies', { config: withRule('when-bumping'), files, packages })).toEqual([{
          message: 'The scope is missing on a patch commit touching pkg-0, pkg-1, pkg-2 and 3 more',
          fix: 'add the scope of the main package, e.g. "build(pkg-0): upgrade the dependencies", or split the commit per package',
        }])
      })

      it('Then requires it for every bumping commit in standalone mode', async () => {
        expect(await problemsOf('fix: correct a bug in the parser', { config: withRule('when-bumping'), packages: [] }))
          .toEqual([{ message: 'The scope is missing on a commit that bumps the version (patch)', fix: 'add one, e.g. "fix(core): correct a bug in the parser"' }])
      })
    })
  })

  describe('When matching the scope with the files', () => {
    it('Then warns when the scope designates an untouched package', async () => {
      const result = await lint('fix(nuxt): correct the options', { files: ['packages/core/index.ts'] })

      expect(result.valid).toBe(true)
      expect(result.problems).toEqual([{
        rule: 'scope-matches-files',
        severity: 'warn',
        message: 'The scope "nuxt" designates packages/nuxt, but it touches core',
        fix: 'use the scope of the touched package, or split the commit per package',
        url: 'https://relizy.dev/commitlint/rules#scope-matches-files',
      }])
    })

    it('Then explains when no package is touched', async () => {
      expect(await messagesOf('fix(nuxt): correct the options', { files: ['README.md'] }))
        .toEqual(['The scope "nuxt" designates packages/nuxt, but it only touches files outside the packages'])
    })

    it.each([
      ['the package is touched', 'fix(nuxt): correct the options', ['packages/nuxt/index.ts', 'packages/core/index.ts']],
      ['the scope is not a package', 'fix(ci): correct the workflow', ['packages/core/index.ts']],
      ['the files are unknown', 'fix(nuxt): correct the options', undefined],
    ])('Then does not warn when %s', async (_, message, files) => {
      expect(await rulesOf(message, { files, config: { commitlint: { scopes: ['ci'] } } })).toEqual([])
    })
  })

  describe('When checking the subject', () => {
    it.each([
      ['feat: Add a new thing', ['subject-case']],
      ['feat: add a new thing.', ['subject-full-stop']],
      ['feat: API changes for the parser', []],
      ['feat: `parse` handles the emojis', []],
      ['feat: add a new thing...', []],
      ['fix: typo', ['subject-meaningful']],
      ['fix: WIP', ['subject-meaningful']],
      ['fix: typo!', ['subject-meaningful']],
      ['fix: parser', ['subject-meaningful']],
      ['fix: internationalization', []],
      ['fix: parser crash', []],
    ])('Then "%s" has the problems %j', async (message, expected) => {
      expect(await rulesOf(message)).toEqual(expected)
    })

    it('Then uses the configured minimum of words', async () => {
      const config = { commitlint: { rules: { 'subject-meaningful': ['error', { minWords: 3, minLength: 100 }] as ['error', unknown] } } }

      expect(await problemsOf('fix: parser crash', { config }))
        .toEqual([{ message: 'The subject "parser crash" is too short', fix: 'describe what changed, in at least 3 words or 100 characters' }])
    })
  })

  describe('When checking the body', () => {
    it.each([
      ['a blank line is missing after the header', 'feat: add a new thing\nThe body.', ['body-leading-blank']],
      ['an ATX heading', 'feat: add a new thing\n\n## Usage\n\nThe body.', ['body-no-headings']],
      ['a setext heading', 'feat: add a new thing\n\nUsage\n=====', ['body-no-headings']],
      ['an unclosed code block', 'feat: add a new thing\n\n```bash\nrelizy commitlint', ['body-markdown']],
      ['a link without url', 'feat: add a new thing\n\nSee [the docs]().', ['body-markdown']],
      ['a valid body', 'feat: add a new thing\n\nUse `relizy commitlint`, see [the docs](https://relizy.dev).\n\n- one\n- two', []],
    ])('Then detects %s', async (_, message, expected) => {
      expect(await rulesOf(message)).toEqual(expected)
    })
  })

  describe('When checking the changelog rendering of the body', () => {
    const INVALID = 'feat: scope the guidelines per target\n\nNow an object:\n\n```ts\nai: {\n  extraGuidelines: {\n    global: \'a\',\n    slack: \'b\',\n  },\n}\n```'

    it('Then rejects a code block that is not a complete program, like the one that broke a release', async () => {
      const [problem] = await problemsOf(INVALID)

      expect(problem?.message).toMatch(/^The body would break the changelog formatting: Invalid ts code block: .+, on "slack: 'b',"$/)
      expect(problem?.fix).toBe('make the code block a complete program, e.g. "export default defineConfig({ ... })" rather than a bare object')
    })

    it('Then accepts a complete program', async () => {
      expect(await rulesOf('feat: scope the guidelines per target\n\n```ts\nexport default defineConfig({\n  ai: { extraGuidelines: { slack: \'b\' } },\n})\n```')).toEqual([])
    })

    it('Then reports the problems of a breaking commit once, although it is listed twice in the changelog', async () => {
      expect(await rulesOf(INVALID.replace('feat:', 'feat!:'))).toEqual(['body-changelog-lint'])
    })

    it.each([
      ['the commit is not in the changelog', { types: { feat: false as const } }],
      ['the changelog omits the bodies', { changelog: { includeCommitBody: false } }],
    ])('Then skips the check when %s', async (_, config) => {
      expect(await rulesOf(INVALID, { config })).toEqual([])
    })
  })

  describe('When checking the breaking changes', () => {
    it('Then rejects a mention of a breaking change outside the footer', async () => {
      const result = await lint('fix: correct a bug in the parser\n\nThis is not a breaking change: the output is the same.')

      expect(result.problems.map(problem => problem.rule)).toEqual(['body-breaking-change'])
      expect(result.commit.bump).toBe('major')
    })

    it('Then rejects a breaking change footer that is not uppercase', async () => {
      expect(await rulesOf('fix: correct a bug in the parser\n\nThe body.\n\nBreaking change: the output changed')).toEqual(['body-breaking-change'])
    })

    it('Then accepts a BREAKING CHANGE footer spanning several lines', async () => {
      expect(await rulesOf('refactor(core)!: remove the legacy mixins\n\nThe mixins are gone.\n\nBREAKING CHANGE: the removed mixins are no longer\navailable. Use the replacements of the migration guide.')).toEqual([])
    })

    it('Then accepts the BREAKING CHANGE footer', async () => {
      expect(await rulesOf('fix: correct a bug in the parser\n\nThe body.\n\nBREAKING CHANGE: the output changed')).toEqual([])
    })

    it('Then forbids breaking changes with no-breaking', async () => {
      const config = { commitlint: { rules: { 'no-breaking': 'error' as const } } }

      expect(await rulesOf('feat!: drop the legacy option', { config })).toEqual(['no-breaking'])
      expect(await rulesOf('fix: correct a bug in the parser\n\nBREAKING CHANGE: changed', { config })).toEqual(['no-breaking'])
      expect(await rulesOf('fix: correct a bug in the parser', { config })).toEqual([])
    })
  })

  describe('When configuring the rule levels', () => {
    it('Then turns an error into a warning that keeps the commit valid', async () => {
      const result = await lint('feat: Add a new thing', { config: { commitlint: { rules: { 'subject-case': 'warn' } } } })

      expect(result.valid).toBe(true)
      expect(result.problems).toEqual([expect.objectContaining({ rule: 'subject-case', severity: 'warn' })])
    })

    it('Then disables a rule', async () => {
      expect(await rulesOf('feat: Add a new thing', { config: { commitlint: { rules: { 'subject-case': 0 } } } })).toEqual([])
    })

    it('Then accepts the commitlint tuples', async () => {
      expect(await messagesOf('feat: add a rather long description', { config: { commitlint: { rules: { 'header-max-length': [2, 'always', 20] } } } }))
        .toEqual(['The header is 35 characters long, the maximum is 20'])
    })

    it('Then warns about the unknown rules once per config, not once per commit', async () => {
      const config = createMockConfig({ cwd, commitlint: { rules: { 'footer-empty': 'error' } } })
      vi.mocked(logger.warn).mockClear()

      await lintCommitMessage('feat: add a new thing', { config, packages: PACKAGES })
      await lintCommitMessage('fix: correct a bug in the parser', { config, packages: PACKAGES })

      expect(vi.mocked(logger.warn).mock.calls.filter(([message]) => String(message).includes('footer-empty'))).toHaveLength(1)
    })

    it('Then warns about the unknown rules', async () => {
      await lint('feat: add a new thing', { config: { commitlint: { rules: { 'footer-max-line-length': [0] } } } })

      expect(logger.warn).toHaveBeenCalledWith('commitlint: unknown rule "footer-max-line-length" in commitlint.rules, it is ignored')
    })
  })

  describe('When running custom rules', () => {
    it.each([
      ['true', () => true, []],
      ['a valid tuple', () => [true] as [boolean], []],
      ['false', () => false, ['The custom rule failed']],
      ['an error message', () => 'Mention the ticket', ['Mention the ticket']],
      ['an invalid tuple with a message', () => [false, 'Mention the ticket'] as [boolean, string], ['Mention the ticket']],
      ['an invalid tuple without message', () => [false] as [boolean], ['The custom rule failed']],
      ['a promise', () => Promise.resolve('Async problem'), ['Async problem']],
    ])('Then handles a rule returning %s', async (_, rule, expected) => {
      expect(await messagesOf('feat: add a new thing', { config: { commitlint: { customRules: { 'my-rule': rule } } } })).toEqual(expected)
    })

    it('Then passes the enriched commit, the value and the config', async () => {
      const rule = vi.fn(() => true)
      await lint('feat(nuxt): add a new thing', {
        files: ['packages/nuxt/index.ts'],
        config: { commitlint: { customRules: { 'my-rule': rule }, rules: { 'my-rule': ['warn', { ticket: 'ABC' }] } } },
      })

      expect(rule).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'feat', scope: 'nuxt', bump: 'minor', packages: ['@maz-ui/nuxt'], files: ['packages/nuxt/index.ts'] }),
        expect.objectContaining({ value: { ticket: 'ABC' }, config: expect.objectContaining({ cwd }) }),
      )
    })

    it('Then applies the configured level', async () => {
      const config = { commitlint: { customRules: { 'my-rule': () => 'Problem' }, rules: { 'my-rule': 'warn' as const } } }
      const result = await lint('feat: add a new thing', { config })

      expect(result.valid).toBe(true)
      expect(result.problems).toEqual([{ rule: 'my-rule', severity: 'warn', message: 'Problem' }])
      expect(await rulesOf('feat: add a new thing', { config: { commitlint: { customRules: { 'my-rule': () => 'Problem' }, rules: { 'my-rule': 'off' } } } })).toEqual([])
    })

    it('Then runs on the non conventional commits too', async () => {
      expect(await rulesOf('wip', { config: { commitlint: { customRules: { 'my-rule': (commit: CommitlintCommit) => commit.type !== '' || 'Not conventional' } } } }))
        .toEqual(['header-format', 'my-rule'])
    })
  })
})

describe('Given normalizeRuleConfig function', () => {
  it.each([
    [undefined, undefined],
    ['error', { severity: 'error', value: undefined }],
    ['warn', { severity: 'warn', value: undefined }],
    ['off', { severity: 'off', value: undefined }],
    [0, { severity: 'off', value: undefined }],
    [1, { severity: 'warn', value: undefined }],
    [2, { severity: 'error', value: undefined }],
    [['error'], { severity: 'error', value: undefined }],
    [['error', 100], { severity: 'error', value: 100 }],
    [[2, 'always', 100], { severity: 'error', value: 100 }],
    [[2, 'always'], { severity: 'error', value: 'always' }],
    [['error', 'never'], { severity: 'error', value: 'never' }],
  ])('Then normalizes %j', (config, expected) => {
    expect(normalizeRuleConfig('rule', config as never)).toEqual(expected)
  })

  it('Then warns that "never" is not supported', () => {
    expect(normalizeRuleConfig('subject-case', [2, 'never', ['upper-case']])).toEqual({ severity: 'error', value: ['upper-case'] })
    expect(logger.warn).toHaveBeenCalledWith('commitlint: "never" is not supported (rule "subject-case"), the value of the rule is used as is')
  })

  it('Then rejects an invalid level', () => {
    expect(() => normalizeRuleConfig('rule', 'fatal' as never)).toThrow('commitlint: invalid level "fatal" for the rule "rule", use \'error\', \'warn\' or \'off\'')
  })
})
