import type { CommitlintResult } from '@relizy/core'
import { getTitleMode, resolvePullRequestLint, toWarnings } from '../commitlint/pull-request'

describe('Given getTitleMode function', () => {
  it.each([
    [undefined, 'auto'],
    [true, 'error'],
    [false, 'off'],
    ['auto', 'auto'],
    ['error', 'error'],
    ['warn', 'warn'],
    ['off', 'off'],
  ] as const)('When commitlint.title is %s, Then the mode is %s', (value, mode) => {
    expect(getTitleMode(value)).toBe(mode)
  })
})

describe('Given resolvePullRequestLint function', () => {
  describe('When the mode is set explicitly', () => {
    it.each(['error', 'warn', 'off'] as const)('Then lints the title as %s and the commits as errors, whatever the merge', (mode) => {
      expect(resolvePullRequestLint({
        mode,
        detection: { squash: true, reason: 'the repository only allows squash merges' },
      })).toEqual({ title: mode, commits: 'error' })
    })
  })

  describe('When the mode is auto', () => {
    it('Then lints the title as errors and the commits as warnings with a squash merge', () => {
      expect(resolvePullRequestLint({
        mode: 'auto',
        detection: { squash: true, reason: 'the repository only allows squash merges' },
        kind: 'merge request',
      })).toEqual({
        title: 'error',
        commits: 'warn',
        note: 'squash merge (the repository only allows squash merges): the merge only keeps the merge request title, the problems of its commits are warnings',
      })
    })

    it('Then does not lint the title without squash merge', () => {
      expect(resolvePullRequestLint({
        mode: 'auto',
        detection: { squash: false, reason: 'the repository does not allow squash merges' },
      })).toEqual({ title: 'off', commits: 'error' })
    })

    it('Then does not lint the title when the squash merge takes the message of the only commit', () => {
      expect(resolvePullRequestLint({
        mode: 'auto',
        detection: { squash: true, reason: 'the repository only allows squash merges' },
        titleFromCommit: true,
      })).toEqual({ title: 'off', commits: 'error' })
    })

    it('Then lints the title as warnings when the merge method is unknown', () => {
      expect(resolvePullRequestLint({
        mode: 'auto',
        detection: { reason: 'the repository allows several merge methods' },
      })).toEqual({
        title: 'warn',
        commits: 'error',
        note: 'merge method unknown (the repository allows several merge methods): the pull request title becomes the commit of a squash merge, its problems are warnings',
      })
    })

    it('Then lints the title as warnings outside a pull request pipeline it can read', () => {
      expect(resolvePullRequestLint({ mode: 'auto', kind: 'merge request' })).toEqual({
        title: 'warn',
        commits: 'error',
        note: 'merge method unknown (the merge method of the merge request is unknown): the merge request title becomes the commit of a squash merge, its problems are warnings',
      })
    })
  })
})

describe('Given toWarnings function', () => {
  const result = (severities: Array<'error' | 'warn'>): CommitlintResult => ({
    commit: {
      raw: 'fix: Typo',
      header: 'fix: Typo',
      body: '',
      footer: '',
      type: 'fix',
      scope: '',
      subject: 'Typo',
      isBreaking: false,
      references: [],
    },
    ignored: false,
    valid: !severities.includes('error'),
    problems: severities.map(severity => ({ rule: 'subject-case', severity, message: 'The subject starts with an uppercase letter' })),
  })

  describe('When the result has errors', () => {
    it('Then turns them into warnings and makes the result valid', () => {
      const warned = toWarnings(result(['error', 'warn']))

      expect(warned.valid).toBe(true)
      expect(warned.problems.map(problem => problem.severity)).toEqual(['warn', 'warn'])
    })
  })

  describe('When the result has no error', () => {
    it('Then returns it as is', () => {
      const valid = result(['warn'])

      expect(toWarnings(valid)).toBe(valid)
    })
  })
})
