import type { LintCommitMessageOptions } from '../commitlint/lint'
import type { WorkspacePackage } from '../commitlint/workspace'
import type { CommitTypes, GitCommit } from '../types'
import { getChangelogTitle, lintCommitMessage } from '../commitlint/lint'
import { normalizeRuleConfig } from '../commitlint/rules'

const TYPES: CommitTypes = {
  feat: { title: '🚀 Features', semver: 'minor' },
  fix: { title: '🩹 Fixes', semver: 'patch' },
  revert: { title: '⏪ Reverts', semver: 'patch' },
  chore: false,
  wip: { title: '' },
}

const PACKAGES: WorkspacePackage[] = [
  {
    name: '@maz-ui/nuxt',
    path: 'packages/nuxt',
    scopes: ['nuxt', '@maz-ui/nuxt'],
  },
  {
    name: 'core',
    path: 'packages/core',
    scopes: ['core'],
  },
]

const BUMPS = { feat: 'minor', fix: 'patch' } as const

/** The bump of the commit types of TYPES, as a release tool would compute it */
function getBump(commit: GitCommit) {
  return BUMPS[commit.type as keyof typeof BUMPS]
}

describe('Given getChangelogTitle function', () => {
  it.each([
    ['feat', '🚀 Features'],
    ['chore', undefined],
    ['wip', undefined],
    ['unknown', undefined],
  ])('Then returns the section of "%s"', (type, expected) => {
    expect(getChangelogTitle(type, TYPES)).toBe(expected)
  })

  it('Then returns none without types', () => {
    expect(getChangelogTitle('feat', undefined)).toBeUndefined()
  })
})

describe('Given normalizeRuleConfig function', () => {
  it.each([
    [undefined, undefined],
    [
      'error',
      { severity: 'error', value: undefined },
    ],
    [
      'warn',
      { severity: 'warn', value: undefined },
    ],
    [
      'off',
      { severity: 'off', value: undefined },
    ],
    [
      0,
      { severity: 'off', value: undefined },
    ],
    [
      1,
      { severity: 'warn', value: undefined },
    ],
    [
      2,
      { severity: 'error', value: undefined },
    ],
    [
      ['error'],
      { severity: 'error', value: undefined },
    ],
    [
      ['error', 100],
      { severity: 'error', value: 100 },
    ],
    [
      [2, 'always', 100],
      { severity: 'error', value: 100 },
    ],
    [
      [2, 'always'],
      { severity: 'error', value: 'always' },
    ],
    [
      ['error', 'never'],
      { severity: 'error', value: 'never' },
    ],
  ])('Then normalizes %j', (config, expected) => {
    expect(normalizeRuleConfig('rule', config as never)).toEqual(expected)
  })

  it('Then warns that "never" is not supported', () => {
    const logger = {
      warn: vi.fn(),
    }

    expect(normalizeRuleConfig('subject-case', [
      2,
      'never',
      ['upper-case'],
    ], logger)).toEqual({
      severity: 'error',
      value: ['upper-case'],
    })
    expect(logger.warn).toHaveBeenCalledWith('commitlint: "never" is not supported (rule "subject-case"), the value of the rule is used as is')
  })

  it('Then rejects an invalid level', () => {
    expect(() => normalizeRuleConfig('rule', 'fatal' as never)).toThrow('commitlint: invalid level "fatal" for the rule "rule", use \'error\', \'warn\' or \'off\'')
  })
})

describe('Given lintCommitMessage function', () => {
  describe('When the message is valid', () => {
    it('Then reports no problem and parses it like the release', async () => {
      const result = await lintCommitMessage('feat(nuxt): add the module options (#12)', {
        types: TYPES,
        packages: PACKAGES,
        files: ['packages/nuxt/src/module.ts'],
        getBump,
      })

      expect(result.valid).toBe(true)
      expect(result.ignored).toBe(false)
      expect(result.problems).toEqual([])
      expect(result.changelogTitle).toBe('🚀 Features')
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
      expect(result.gitCommit).toEqual(expect.objectContaining({ type: 'feat', scope: 'nuxt', description: 'add the module options' }))
    })

    it('Then keeps the scope as written, before the scopeMap', async () => {
      const result = await lintCommitMessage('fix(ui): correct the nuxt module', {
        types: TYPES,
        packages: PACKAGES,
        scopeMap: { ui: 'nuxt' },
      })

      expect(result.commit.scope).toBe('ui')
      expect(result.gitCommit?.scope).toBe('nuxt')
      expect(result.valid).toBe(true)
    })

    it('Then has no bump without getBump, and no hash reference without hash', async () => {
      const result = await lintCommitMessage('feat: add the module options', { types: TYPES })

      expect(result.commit.bump).toBeUndefined()
      expect(result.commit.references).toEqual([])
      expect(result.commit.packages).toBeUndefined()
    })

    it('Then reads the hash of the commit being linted', async () => {
      const result = await lintCommitMessage('feat: add the module options', { types: TYPES, hash: 'abcdef1234567890' })

      expect(result.commit.hash).toBe('abcdef1234567890')
      expect(result.commit.references).toEqual([
        { type: 'hash', value: 'abcdef1' },
      ])
    })

    it('Then lints a message without any option', async () => {
      const result = await lintCommitMessage('feat: add the module options')

      expect(result.problems.map(problem => problem.rule)).toEqual(['type-enum'])
      expect(result.changelogTitle).toBeUndefined()
    })
  })

  describe('When the message is ignored', () => {
    it('Then does not lint merge commits and the release commits of the tool', async () => {
      const options = {
        types: TYPES,
        releaseCommitMessages: ['chore(release): bump version to {{newVersion}}'],
      }

      expect(await lintCommitMessage('Merge branch \'main\'', options)).toEqual(expect.objectContaining({ ignored: true, valid: true, problems: [] }))
      expect(await lintCommitMessage('chore(release): bump version to 1.0.0', options)).toEqual(expect.objectContaining({ ignored: true, valid: true, problems: [] }))
      expect((await lintCommitMessage('chore(release): something', options)).ignored).toBe(false)
    })

    it('Then applies ignores and defaultIgnores', async () => {
      expect((await lintCommitMessage('wip', {
        ignores: [/^wip$/],
      })).ignored).toBe(true)
      expect((await lintCommitMessage('Merge branch \'main\'', { defaultIgnores: false })).ignored).toBe(false)
    })

    it('Then still gives the section of the changelog of an ignored commit', async () => {
      const result = await lintCommitMessage('fix: Merge the pull request', {
        types: TYPES,
        ignores: [/^fix:/],
      })

      expect(result.ignored).toBe(true)
      expect(result.changelogTitle).toBe('🩹 Fixes')
    })
  })

  describe('When the types, the scopes and the rules come from the options', () => {
    it('Then knows only the types given', async () => {
      const result = await lintCommitMessage('perf: speed up the parser', { types: TYPES, packages: PACKAGES })

      expect(result.valid).toBe(false)
      expect(result.problems).toEqual([
        expect.objectContaining({
          rule: 'type-enum',
          message: 'The type "perf" is unknown to relizy',
          fix: 'use one of: feat, fix, revert, chore, wip',
          url: 'https://relizy.dev/commitlint/rules#type-enum',
        }),
      ])
    })

    it('Then allows the scopes of the packages, the scopeMap keys and scopes, and any scope without them', async () => {
      const options = {
        types: TYPES,
        packages: PACKAGES,
        scopeMap: { ui: 'nuxt' },
        scopes: ['ci'],
      }

      for (const scope of [
        'nuxt',
        '@maz-ui/nuxt',
        'core',
        'ui',
        'ci',
      ]) {
        expect((await lintCommitMessage(`fix(${scope}): correct the parser`, options)).problems).toEqual([])
      }
      expect((await lintCommitMessage('fix(docs): correct the parser', options)).problems.map(problem => problem.rule)).toEqual(['scope-enum'])
      expect((await lintCommitMessage('fix(docs): correct the parser', { types: TYPES })).problems).toEqual([])
    })

    it('Then suggests the write-in of a revert with the revert type only when it is known', async () => {
      const withRevert = await lintCommitMessage('Revert "feat: add a thing"', { types: TYPES })
      const withoutRevert = await lintCommitMessage('Revert "feat: add a thing"', {
        types: { feat: TYPES.feat },
      })

      expect(withRevert.problems[0]?.fix).toBe('write it as "revert: <reverted header>"')
      expect(withoutRevert.problems[0]?.fix).toContain('or add a "revert" type to the relizy types')
    })

    it('Then applies the level and the value of the rules', async () => {
      const result = await lintCommitMessage('feat: add a rather long description', {
        types: TYPES,
        rules: {
          'header-max-length': [2, 'always', 20],
          'subject-meaningful': 'off',
        },
      })

      expect(result.problems.map(problem => problem.message)).toEqual(['The header is 35 characters long, the maximum is 20'])
    })

    it('Then reports a warning without failing', async () => {
      const result = await lintCommitMessage('feat: Add a new thing', {
        types: TYPES,
        rules: { 'subject-case': 'warn' },
      })

      expect(result.valid).toBe(true)
      expect(result.problems).toEqual([
        expect.objectContaining({ rule: 'subject-case', severity: 'warn' }),
      ])
    })

    it('Then fails clearly when a rule misses its number', async () => {
      await expect(lintCommitMessage('feat: add a new thing', {
        types: TYPES,
        rules: {
          'header-max-length': [2, 'always'] as never,
        },
      }))
        .rejects
        .toThrow('commitlint: the rule "header-max-length" needs a number, e.g. [\'error\', 500] or [2, \'always\', 500], got "always"')
    })

    it('Then warns about the unknown rules once per rules object, not once per commit', async () => {
      const logger = {
        warn: vi.fn(),
      }
      const rules = { 'footer-empty': 'error' as const }

      await lintCommitMessage('feat: add a new thing', { types: TYPES, rules, logger })
      await lintCommitMessage('fix: correct a bug in the parser', { types: TYPES, rules, logger })

      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.warn).toHaveBeenCalledWith('commitlint: unknown rule "footer-empty" in commitlint.rules, it is ignored')
    })

    it('Then does not warn about a custom rule, nor without logger', async () => {
      const logger = {
        warn: vi.fn(),
      }

      await lintCommitMessage('feat: add a new thing', {
        types: TYPES,
        rules: { 'my-rule': 'warn' },
        customRules: {
          'my-rule': () => true,
        },
        logger,
      })
      await lintCommitMessage('feat: add a new thing', {
        types: TYPES,
        rules: { 'other-rule': 'warn' },
      })

      expect(logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('When the options have custom rules', () => {
    const config = { name: 'the-config-of-the-tool' }

    it('Then runs them with the commit, their value and the config of the tool as is', async () => {
      const rule = vi.fn(() => true)

      await lintCommitMessage('feat(nuxt): add the module options', {
        types: TYPES,
        packages: PACKAGES,
        customRules: { 'my-rule': rule },
        rules: {
          'my-rule': ['error', 42],
        },
        config,
      })

      expect(rule).toHaveBeenCalledWith(expect.objectContaining({ header: 'feat(nuxt): add the module options', type: 'feat' }), { value: 42, config })
    })

    it.each([
      ['false', false, 'The custom rule failed'],
      ['a message', 'Not like this', 'Not like this'],
      [
        'a failing tuple',
        [false, 'Tuple message'],
        'Tuple message',
      ],
      [
        'a failing tuple without message',
        [false],
        'The custom rule failed',
      ],
    ])('Then reports a problem when a rule returns %s', async (_label, outcome, message) => {
      const result = await lintCommitMessage('feat: add the module options', {
        types: TYPES,
        customRules: {
          'my-rule': () => outcome as never,
        },
      })

      expect(result.valid).toBe(false)
      expect(result.problems).toEqual([
        { rule: 'my-rule', severity: 'error', message },
      ])
    })

    it.each([
      ['true', true],
      [
        'a passing tuple',
        [true],
      ],
    ])('Then accepts a rule returning %s', async (_label, outcome) => {
      const result = await lintCommitMessage('feat: add the module options', {
        types: TYPES,
        customRules: {
          'my-rule': () => outcome as never,
        },
      })

      expect(result.problems).toEqual([])
    })

    it('Then waits for an asynchronous rule, and gives it the level of the rules', async () => {
      const result = await lintCommitMessage('feat: add the module options', {
        types: TYPES,
        customRules: {
          'my-rule': () => Promise.resolve('Async problem'),
        },
        rules: { 'my-rule': 'warn' },
      })

      expect(result.valid).toBe(true)
      expect(result.problems).toEqual([
        { rule: 'my-rule', severity: 'warn', message: 'Async problem' },
      ])
    })

    it('Then skips a custom rule that is off', async () => {
      const rule = vi.fn(() => false)

      await lintCommitMessage('feat: add the module options', {
        types: TYPES,
        customRules: { 'my-rule': rule },
        rules: { 'my-rule': 'off' },
      })

      expect(rule).not.toHaveBeenCalled()
    })
  })

  describe('When the options describe the changelog', () => {
    const BODY = 'Adds the option.\n\n```ts\nconst a = 1\n```'
    const message = `feat: add the module options\n\n${BODY}`

    it('Then checks the entry of a commit with a code block in its body, with the linter given', async () => {
      const lint = vi.fn(() => Promise.resolve(['Missing semicolon, on "const a = 1"']))
      const renderEntry = vi.fn((commit: GitCommit): string => `### 🚀 Features\n\n- ${commit.description}`)

      const result = await lintCommitMessage(message, {
        types: TYPES,
        changelog: {
          renderEntry,
          getLinter: () => Promise.resolve({ name: 'eslint', lint }),
        },
      })

      expect(renderEntry).toHaveBeenCalledWith(expect.objectContaining({ type: 'feat' }))
      expect(lint).toHaveBeenCalledWith('# Changelog\n\n## v0.0.0\n\n### 🚀 Features\n\n- add the module options\n')
      expect(result.problems).toEqual([
        {
          rule: 'body-changelog-lint',
          severity: 'error',
          message: 'The body would break the changelog formatting: Missing semicolon, on "const a = 1"',
          fix: 'fix the code block: the body is linted like the CHANGELOG.md files by the ESLint of the project',
          url: 'https://relizy.dev/commitlint/rules#body-changelog-lint',
        },
      ])
    })

    it('Then advises a complete program with the built-in linter', async () => {
      const result = await lintCommitMessage(message, {
        types: TYPES,
        changelog: {
          renderEntry: () => '### 🚀 Features',
          getLinter: () => Promise.resolve({
            name: 'oxc',
            lint: () => Promise.resolve(['Invalid ts code block', 'Invalid ts code block']),
          }),
        },
      })

      expect(result.problems).toHaveLength(1)
      expect(result.problems[0]?.fix).toContain('make the code block a complete program')
    })

    it.each<[string, Partial<LintCommitMessageOptions>, string]>([
      ['there is no changelog option', {}, message],
      [
        'the bodies are not in the changelog',
        {
          changelog: {
            includeCommitBody: false,
            renderEntry: () => 'entry',
            getLinter: () => Promise.reject(new Error('not called')),
          },
        },
        message,
      ],
      [
        'the body has no code block',
        {
          changelog: {
            renderEntry: () => 'entry',
            getLinter: () => Promise.reject(new Error('not called')),
          },
        },
        'feat: add the module options\n\nAdds the option.',
      ],
      [
        'the commit is not in the changelog',
        {
          changelog: {
            renderEntry: () => undefined,
            getLinter: () => Promise.reject(new Error('not called')),
          },
        },
        message,
      ],
    ])('Then checks nothing when %s', async (_label, options, text) => {
      const result = await lintCommitMessage(text, { types: TYPES, ...options })

      expect(result.problems).toEqual([])
    })
  })

  describe('When some errors of the header can be fixed', () => {
    it('Then suggests a fixed header, linted again', async () => {
      const result = await lintCommitMessage('Fix(nuxtt): Correct the module options.', { types: TYPES, packages: PACKAGES })

      expect(result.suggestion).toEqual({ header: 'fix(nuxt): Correct the module options', remainingRules: [] })
    })

    it('Then keeps the rest of the message, and lowercases the subject with subject-case', async () => {
      const result = await lintCommitMessage('fix(nuxtt): Correct the module options\n\nThe body.', {
        types: TYPES,
        packages: PACKAGES,
        rules: { 'subject-case': 'error' },
      })

      expect(result.suggestion).toEqual({ header: 'fix(nuxt): correct the module options', remainingRules: [] })
    })

    it('Then lists the errors the suggestion does not fix', async () => {
      const result = await lintCommitMessage('fix(nuxtt): Typo.', { types: TYPES, packages: PACKAGES })

      expect(result.suggestion).toEqual({
        header: 'fix(nuxt): Typo',
        remainingRules: ['subject-meaningful'],
      })
    })

    it('Then suggests nothing when asked not to, or when the errors are not in the header', async () => {
      expect((await lintCommitMessage('Fix(nuxtt): Correct the module options.', { types: TYPES, packages: PACKAGES, suggest: false })).suggestion).toBeUndefined()
      expect((await lintCommitMessage('feat: add a new thing\nThe body.', { types: TYPES })).suggestion).toBeUndefined()
    })
  })
})
