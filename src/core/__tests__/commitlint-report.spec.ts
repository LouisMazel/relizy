import type { CommitlintProblem, CommitlintResult } from '../commitlint/lint'
import type { CommitlintReport, ReportEntry } from '../commitlint/report'
import process from 'node:process'
import {
  formatCommitResult,
  formatGithubAnnotations,
  formatHowToFix,
  formatJsonReport,
  formatReleaseEffect,
  formatTextReport,
  shouldUseColors,
  summarizeResults,
} from '../commitlint/report'

function createResult(overrides: Omit<Partial<CommitlintResult>, 'commit'> & { commit?: Partial<CommitlintResult['commit']> } = {}): CommitlintResult {
  const { commit, ...rest } = overrides
  const problems = rest.problems ?? []
  return {
    ignored: false,
    valid: problems.every(problem => problem.severity !== 'error'),
    problems,
    changelogTitle: '🚀 Features',
    ...rest,
    commit: {
      raw: 'feat(core): add a thing',
      header: 'feat(core): add a thing',
      body: '',
      footer: '',
      type: 'feat',
      scope: 'core',
      subject: 'add a thing',
      isBreaking: false,
      bump: 'minor',
      references: [],
      ...commit,
    },
  }
}

const SUBJECT_CASE: CommitlintProblem = {
  rule: 'subject-case',
  severity: 'error',
  message: 'The subject starts with an uppercase letter',
  fix: 'start it lowercase, relizy capitalizes it in the changelog',
  url: 'https://relizy.dev/commitlint/rules#subject-case',
}

const SCOPE_FILES: CommitlintProblem = {
  rule: 'scope-matches-files',
  severity: 'warn',
  message: 'The scope "core" designates packages/core, but it touches nuxt',
  fix: 'use the scope of the touched package, or split the commit per package',
  url: 'https://relizy.dev/commitlint/rules#scope-matches-files',
}

function commitEntry(hash: string, overrides: Parameters<typeof createResult>[0] = {}): ReportEntry {
  return { result: createResult({ ...overrides, commit: { hash: `${hash}${'0'.repeat(33)}`, ...overrides.commit } }), label: hash }
}

describe('Given formatReleaseEffect function', () => {
  it('Then describes the bump and the changelog section', () => {
    expect(formatReleaseEffect(createResult())).toBe('minor bump, 🚀 Features')
  })

  it('Then describes a commit without bump nor changelog entry', () => {
    expect(formatReleaseEffect(createResult({ changelogTitle: undefined, commit: { bump: undefined } }))).toBe('no bump, not in the changelog')
  })
})

describe('Given formatCommitResult function', () => {
  it('Then prints a single line for a valid commit', () => {
    expect(formatCommitResult(createResult())).toEqual(['✔ feat(core) → minor bump, 🚀 Features'])
  })

  it('Then marks the breaking commits and prints the label', () => {
    const result = createResult({ commit: { isBreaking: true, scope: '', bump: 'major' } })

    expect(formatCommitResult(result, { label: '0123456' })).toEqual(['✔ 0123456 feat! → major bump, 🚀 Features'])
  })

  it('Then prints the header, each problem with how to fix it, and the suggested header', () => {
    const result = createResult({
      commit: { header: 'feat(core): Add a thing.' },
      problems: [SUBJECT_CASE, { rule: 'subject-full-stop', severity: 'error', message: 'The subject ends with a period', fix: 'remove the final period' }],
      suggestion: { header: 'feat(core): add a thing', remainingRules: [] },
    })

    expect(formatCommitResult(result)).toEqual([
      '✖ feat(core): Add a thing.',
      '',
      '  ✖ subject-case       The subject starts with an uppercase letter',
      '                       → start it lowercase, relizy capitalizes it in the changelog',
      '  ✖ subject-full-stop  The subject ends with a period',
      '                       → remove the final period',
      '',
      '  Suggested header: feat(core): add a thing',
      '',
    ])
  })

  it('Then lists the rules a suggested header does not fix', () => {
    const result = createResult({ problems: [SUBJECT_CASE], suggestion: { header: 'fix(core): typo', remainingRules: ['subject-meaningful'] } })

    expect(formatCommitResult(result).slice(-3)).toEqual([
      '  Suggested header: fix(core): typo',
      '                    still to fix: subject-meaningful',
      '',
    ])
  })

  it('Then prints the warnings of a valid commit under its line', () => {
    expect(formatCommitResult(createResult({ problems: [SCOPE_FILES] }))).toEqual([
      '✔ feat(core) → minor bump, 🚀 Features',
      '',
      '  ⚠ scope-matches-files  The scope "core" designates packages/core, but it touches nuxt',
      '                         → use the scope of the touched package, or split the commit per package',
      '',
    ])
  })

  it('Then prints a problem without fix, like a custom rule', () => {
    const result = createResult({ problems: [{ rule: 'ticket', severity: 'error', message: 'Mention the ticket' }] })

    expect(formatCommitResult(result)).toEqual(['✖ feat(core): add a thing', '', '  ✖ ticket  Mention the ticket', ''])
  })

  it('Then wraps the long messages under their column', () => {
    const result = createResult({ problems: [{ rule: 'rule', severity: 'error', message: Array.from({ length: 40 }).fill('word').join(' ') }] })
    const lines = formatCommitResult(result)

    expect(lines.filter(line => line.includes('word')).length).toBeGreaterThan(1)
    expect(lines.every(line => line.length <= 120)).toBe(true)
    expect(lines[3]).toMatch(/^ {10}word/)
  })

  it('Then prints the header of a non conventional commit', () => {
    expect(formatCommitResult(createResult({ commit: { type: '', header: 'wip' } }))[0]).toBe('✔ wip → minor bump, 🚀 Features')
  })

  it('Then marks the ignored commits', () => {
    expect(formatCommitResult(createResult({ ignored: true, commit: { header: 'Merge branch \'main\'' } }), { label: '0123456' }))
      .toEqual(['○ 0123456 Merge branch \'main\' (ignored)'])
  })

  it('Then colors the output on demand', () => {
    const [first, , problem] = formatCommitResult(createResult({ problems: [SUBJECT_CASE] }), { colors: true })

    expect(first).toBe('\x1B[31m✖\x1B[0m \x1B[1mfeat(core): add a thing\x1B[0m')
    expect(problem).toContain('\x1B[36msubject-case  \x1B[0m')
  })
})

describe('Given formatTextReport function', () => {
  const SEPARATOR = '─'.repeat(72)

  it('Then prints only the line of a valid message', () => {
    expect(formatTextReport({ mode: 'edit', entries: [{ result: createResult() }] })).toEqual(['✔ feat(core) → minor bump, 🚀 Features'])
  })

  it('Then summarizes an invalid message being created, with the rule docs and how to commit again', () => {
    const report: CommitlintReport = {
      mode: 'edit',
      entries: [{ result: createResult({ problems: [SUBJECT_CASE, SCOPE_FILES] }) }],
      messageFile: '.git/COMMIT_EDITMSG',
      helpUrl: 'https://example.com/guidelines',
    }

    expect(formatTextReport(report).slice(-7)).toEqual([
      SEPARATOR,
      '✖ The commit message is invalid: 1 error, 1 warning',
      '  Rules: subject-case         https://relizy.dev/commitlint/rules#subject-case',
      '         scope-matches-files  https://relizy.dev/commitlint/rules#scope-matches-files',
      '  Help:  https://example.com/guidelines',
      '  Fix:   edit the message and commit again, it is kept in .git/COMMIT_EDITMSG:',
      '           $ git commit --edit --file .git/COMMIT_EDITMSG',
    ])
  })

  it('Then never wraps a command, to copy and paste it', () => {
    const file = `/tmp/${'a'.repeat(150)}/COMMIT_EDITMSG`
    const report: CommitlintReport = { mode: 'edit', entries: [{ result: createResult({ problems: [SUBJECT_CASE] }) }], messageFile: file }

    expect(formatTextReport(report).at(-1)).toBe(`           $ git commit --edit --file ${file}`)
  })

  it('Then summarizes a valid message with warnings, without help nor fix', () => {
    const report: CommitlintReport = { mode: 'message', entries: [{ result: createResult({ problems: [SCOPE_FILES] }) }], helpUrl: 'https://example.com' }

    expect(formatTextReport(report).slice(-3)).toEqual([
      SEPARATOR,
      '⚠ The commit message is valid, with 1 warning',
      '  Rules: scope-matches-files  https://relizy.dev/commitlint/rules#scope-matches-files',
    ])
  })

  it('Then confirms a valid range, with the ignored commits', () => {
    const report: CommitlintReport = {
      mode: 'range',
      entries: [commitEntry('aaaaaaa'), commitEntry('bbbbbbb', { ignored: true, commit: { header: 'Merge branch \'main\'' } })],
    }

    expect(formatTextReport(report)).toEqual([
      '✔ aaaaaaa feat(core) → minor bump, 🚀 Features',
      '○ bbbbbbb Merge branch \'main\' (ignored)',
      '✔ 2 commits checked, all valid (1 ignored)',
    ])
  })

  it('Then reports an empty range', () => {
    expect(formatTextReport({ mode: 'range', entries: [] })).toEqual(['No commit to lint'])
  })

  it('Then summarizes a range with warnings only', () => {
    const report: CommitlintReport = { mode: 'range', entries: [commitEntry('aaaaaaa', { problems: [SCOPE_FILES] })] }

    expect(formatTextReport(report)).toContain('⚠ 1 commit checked, all valid, with 1 warning')
  })

  it.each([
    ['one invalid commit', [commitEntry('aaaaaaa', { problems: [SUBJECT_CASE] }), commitEntry('bbbbbbb')], '✖ 1 of 2 commits is invalid: 1 error, 0 warnings'],
    ['two invalid commits', [commitEntry('aaaaaaa', { problems: [SUBJECT_CASE] }), commitEntry('bbbbbbb', { problems: [SUBJECT_CASE] })], '✖ 2 of 2 commits are invalid: 2 errors, 0 warnings'],
    ['an invalid title', [{ result: createResult({ problems: [SUBJECT_CASE] }), label: 'MR title' }, commitEntry('aaaaaaa')], '✖ the merge request title is invalid: 1 error, 0 warnings'],
    ['an invalid title and commit', [{ result: createResult({ problems: [SUBJECT_CASE] }), label: 'MR title' }, commitEntry('aaaaaaa', { problems: [SUBJECT_CASE] })], '✖ 1 of 1 commit and the merge request title are invalid: 2 errors, 0 warnings'],
  ])('Then gives the verdict of %s', (_, entries, verdict) => {
    const report: CommitlintReport = { mode: 'range', entries, from: 'v1.0.0', titleKind: 'merge request' }

    expect(formatTextReport(report)).toContain(verdict)
  })

  it('Then lists each failing rule once', () => {
    const report: CommitlintReport = { mode: 'range', entries: [commitEntry('aaaaaaa', { problems: [SUBJECT_CASE] }), commitEntry('bbbbbbb', { problems: [SUBJECT_CASE] })], from: 'v1.0.0' }

    expect(formatTextReport(report).filter(line => line.includes('rules#subject-case'))).toHaveLength(1)
  })

  it('Then only prints the commits with problems in quiet mode', () => {
    const report: CommitlintReport = { mode: 'range', entries: [commitEntry('aaaaaaa'), commitEntry('bbbbbbb', { problems: [SUBJECT_CASE] })], from: 'v1.0.0' }
    const lines = formatTextReport(report, { quiet: true })

    expect(lines[0]).toBe('✖ bbbbbbb feat(core): add a thing')
    expect(lines.some(line => line.includes('aaaaaaa'))).toBe(false)
  })

  it('Then prints the changelog entry of the previewed commits', () => {
    const report: CommitlintReport = { mode: 'message', entries: [{ result: createResult(), preview: '### 🚀 Features\n\n- **core:** Add a thing' }] }

    expect(formatTextReport(report)).toEqual([
      '✔ feat(core) → minor bump, 🚀 Features',
      '',
      '    ### 🚀 Features',
      '    ',
      '    - **core:** Add a thing',
      '',
    ])
  })
})

describe('Given formatHowToFix function', () => {
  it('Then has nothing to fix for valid commits or a given message', () => {
    expect(formatHowToFix({ mode: 'range', entries: [commitEntry('aaaaaaa')] })).toEqual([])
    expect(formatHowToFix({ mode: 'message', entries: [{ result: createResult({ problems: [SUBJECT_CASE] }) }] })).toEqual([])
  })

  it('Then rewords the commits from a shortened hash, a ref or the root', () => {
    const entries = [commitEntry('aaaaaaa', { problems: [SUBJECT_CASE] }), commitEntry('bbbbbbb', { problems: [SUBJECT_CASE] })]

    expect(formatHowToFix({ mode: 'range', entries, from: 'c'.repeat(40) })).toEqual([
      'reword aaaaaaa, bbbbbbb: mark them as "reword" in the rebase, then force-push:',
      '$ git rebase -i ccccccc',
      '$ git push --force-with-lease',
    ])
    expect(formatHowToFix({ mode: 'range', entries: entries.slice(0, 1), from: 'origin/main' }).slice(0, 2))
      .toEqual(['reword aaaaaaa: mark it as "reword" in the rebase, then force-push:', '$ git rebase -i origin/main'])
    expect(formatHowToFix({ mode: 'range', entries })[1]).toBe('$ git rebase -i --root')
  })

  it('Then explains how to update the title', () => {
    const entries = [{ result: createResult({ problems: [SUBJECT_CASE] }), label: 'PR title' }]

    expect(formatHowToFix({ mode: 'range', entries, titleKind: 'pull request' }))
      .toEqual(['edit the pull request title, then run a new pipeline (a retry keeps the old title)'])
  })

  it('Then defaults the message file of the commit being created', () => {
    expect(formatHowToFix({ mode: 'edit', entries: [{ result: createResult({ problems: [SUBJECT_CASE] }) }] }))
      .toEqual(['edit the message and commit again, it is kept in .git/COMMIT_EDITMSG:', '$ git commit --edit --file .git/COMMIT_EDITMSG'])
  })
})

describe('Given formatJsonReport function', () => {
  it('Then describes every entry, its problems, its suggestion and how to fix', () => {
    const report: CommitlintReport = {
      mode: 'range',
      entries: [
        { result: createResult({ problems: [SUBJECT_CASE], suggestion: { header: 'feat(core): add a thing', remainingRules: [] } }), label: 'PR title', preview: '### 🚀 Features' },
        commitEntry('aaaaaaa', { changelogTitle: undefined, commit: { type: '', scope: '', bump: undefined } }),
      ],
      from: 'v1.0.0',
      titleKind: 'pull request',
      helpUrl: 'https://example.com',
    }

    expect(JSON.parse(formatJsonReport(report))).toEqual({
      valid: false,
      errorCount: 1,
      warningCount: 0,
      helpUrl: 'https://example.com',
      entries: [
        {
          kind: 'title',
          header: 'feat(core): add a thing',
          ignored: false,
          valid: false,
          type: 'feat',
          scope: 'core',
          bump: 'minor',
          changelogSection: '🚀 Features',
          problems: [SUBJECT_CASE],
          suggestion: { header: 'feat(core): add a thing', remainingRules: [] },
          changelogEntry: '### 🚀 Features',
        },
        {
          kind: 'commit',
          hash: `aaaaaaa${'0'.repeat(33)}`,
          header: 'feat(core): add a thing',
          ignored: false,
          valid: true,
          type: null,
          scope: null,
          bump: null,
          changelogSection: null,
          problems: [],
        },
      ],
      howToFix: ['edit the pull request title, then run a new pipeline (a retry keeps the old title)'],
    })
  })

  it('Then describes a single message', () => {
    expect(JSON.parse(formatJsonReport({ mode: 'message', entries: [{ result: createResult() }] })).entries[0].kind).toBe('message')
  })
})

describe('Given formatGithubAnnotations function', () => {
  it('Then emits an escaped annotation per problem', () => {
    const report: CommitlintReport = {
      mode: 'range',
      entries: [commitEntry('aaaaaaa', { problems: [SUBJECT_CASE, { ...SCOPE_FILES, message: '100% wrong: really, yes' }] })],
    }

    expect(formatGithubAnnotations(report)).toEqual([
      '::error title=Commit aaaaaaa (subject-case)::feat(core): add a thing%0AThe subject starts with an uppercase letter%0A→ start it lowercase, relizy capitalizes it in the changelog',
      '::warning title=Commit aaaaaaa (scope-matches-files)::feat(core): add a thing%0A100%25 wrong: really, yes%0A→ use the scope of the touched package, or split the commit per package',
    ])
  })

  it('Then escapes the title and omits a missing fix', () => {
    const report: CommitlintReport = { mode: 'message', entries: [{ result: createResult({ problems: [{ rule: 'a:b,c', severity: 'error', message: 'Problem' }] }) }] }

    expect(formatGithubAnnotations(report)).toEqual(['::error title=Commit (a%3Ab%2Cc)::feat(core): add a thing%0AProblem'])
  })
})

describe('Given summarizeResults function', () => {
  it('Then counts the errors and warnings', () => {
    expect(summarizeResults([createResult({ problems: [SUBJECT_CASE, SCOPE_FILES] }), createResult({ problems: [SUBJECT_CASE] })]))
      .toEqual({ errorCount: 2, warningCount: 1 })
  })
})

describe('Given shouldUseColors function', () => {
  const NAMES = ['NO_COLOR', 'FORCE_COLOR', 'GITHUB_ACTIONS', 'GITLAB_CI']
  let saved: Record<string, string | undefined>

  beforeEach(() => {
    saved = Object.fromEntries(NAMES.map(name => [name, process.env[name]]))
    NAMES.forEach(name => delete process.env[name])
  })

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[name]
      }
      else {
        process.env[name] = value
      }
    }
  })

  it.each([
    ['a terminal', {}, true, true],
    ['a program reading the output, like an AI agent', {}, false, false],
    ['GitHub Actions', { GITHUB_ACTIONS: 'true' }, false, true],
    ['GitLab CI', { GITLAB_CI: 'true' }, false, true],
    ['NO_COLOR in a terminal', { NO_COLOR: '1' }, true, false],
    ['FORCE_COLOR without terminal', { FORCE_COLOR: '1' }, false, true],
    ['FORCE_COLOR=0 in a terminal', { FORCE_COLOR: '0' }, true, false],
  ])('Then decides for %s', (_, env, isTTY, expected) => {
    Object.assign(process.env, env)

    expect(shouldUseColors({ isTTY })).toBe(expected)
  })
})
