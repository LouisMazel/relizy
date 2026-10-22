import type { CommitlintResult } from '../commitlint/lint'
import { formatCommitResult, formatReleaseEffect, formatSummary, summarizeResults } from '../commitlint/report'

function createResult(overrides: Omit<Partial<CommitlintResult>, 'commit'> & { commit?: Partial<CommitlintResult['commit']> } = {}): CommitlintResult {
  const { commit, ...rest } = overrides
  return {
    ignored: false,
    valid: true,
    problems: [],
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
      hash: '0123456789abcdef',
      ...commit,
    },
  }
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

  it('Then marks the breaking commits and prints the hash in range mode', () => {
    const result = createResult({ commit: { isBreaking: true, scope: '', bump: 'major' } })

    expect(formatCommitResult(result, { showHash: true })).toEqual(['✔ 0123456 feat! → major bump, 🚀 Features'])
  })

  it('Then prints the header and every problem of an invalid commit', () => {
    const result = createResult({
      valid: false,
      problems: [
        { rule: 'subject-case', severity: 'error', message: 'Lowercase please' },
        { rule: 'scope-matches-files', severity: 'warn', message: 'Wrong package' },
      ],
    })

    expect(formatCommitResult(result)).toEqual([
      '✖ feat(core): add a thing',
      '  ✖ Lowercase please [subject-case]',
      '  ⚠ Wrong package [scope-matches-files]',
    ])
  })

  it('Then prints the warnings of a valid commit under its line', () => {
    const result = createResult({ problems: [{ rule: 'scope-matches-files', severity: 'warn', message: 'Wrong package' }] })

    expect(formatCommitResult(result)).toEqual([
      '✔ feat(core) → minor bump, 🚀 Features',
      '  ⚠ Wrong package [scope-matches-files]',
    ])
  })

  it('Then prints the header of a non conventional commit', () => {
    const result = createResult({ commit: { type: '', header: 'wip' }, problems: [{ rule: 'header-format', severity: 'warn', message: 'Bad' }] })

    expect(formatCommitResult(result)[0]).toBe('✔ wip → minor bump, 🚀 Features')
  })

  it('Then marks the ignored commits', () => {
    expect(formatCommitResult(createResult({ ignored: true, commit: { header: 'Merge branch \'main\'' } }), { showHash: true }))
      .toEqual(['○ 0123456 Merge branch \'main\' (ignored)'])
  })
})

describe('Given summarizeResults and formatSummary functions', () => {
  const results = [
    createResult({ problems: [{ rule: 'a', severity: 'error', message: '' }, { rule: 'b', severity: 'warn', message: '' }] }),
    createResult({ problems: [{ rule: 'c', severity: 'error', message: '' }] }),
  ]

  it('Then counts the errors and warnings', () => {
    expect(summarizeResults(results)).toEqual({ errorCount: 2, warningCount: 1 })
  })

  it('Then prints nothing without problem', () => {
    expect(formatSummary({ errorCount: 0, warningCount: 0 }, 'https://example.com')).toEqual([])
  })

  it('Then prints the counts with the help url when there are errors', () => {
    expect(formatSummary({ errorCount: 2, warningCount: 1 }, 'https://example.com/guidelines')).toEqual([
      '✖ 3 problems (2 errors, 1 warning)',
      'ⓘ Get help: https://example.com/guidelines',
    ])
  })

  it('Then prints only warnings without the help url', () => {
    expect(formatSummary({ errorCount: 0, warningCount: 1 }, 'https://example.com')).toEqual(['⚠ 1 problem (0 errors, 1 warning)'])
  })
})
