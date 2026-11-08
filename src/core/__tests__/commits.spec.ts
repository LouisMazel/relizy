import type { RawGitCommit } from '../../types'
import { parseCommits, parseGitCommit } from '../commits'

/**
 * Cases ported from the tests of changelogen 0.6.2 (MIT, Pooya Parsa):
 * https://github.com/unjs/changelogen/blob/v0.6.2/test/git.test.ts
 */

const config = { scopeMap: {} }
const jannchie = { email: 'jannchie@gmail.com', name: 'Jannchie' }
const pooya = { email: 'pooya@pi0.io', name: 'Pooya Parsa' }

function raw(message: string, shortHash: string, body = '', author = pooya): RawGitCommit {
  return { message, shortHash, body, author }
}

function withoutAuthors(commits: ReturnType<typeof parseCommits>) {
  return commits.map(({ body: _, author: __, authors: ___, ...rest }) => rest)
}

describe('Given parseCommits', () => {
  describe('When the commits start with an emoji', () => {
    it('Then it parses the unicode and the text emojis', () => {
      const parsed = parseCommits([
        raw('🚀 feat: add emoji support', '0000000', 'this is a emoji commit', jannchie),
        raw(':bug: fix: this is a text emoji', '0000001', 'this is a emoji commit', jannchie),
        raw(':bug: fix(scope): this is a text emoji with scope', '0000001', 'this is a emoji commit', jannchie),
      ], config)

      expect(withoutAuthors(parsed)).toEqual([
        {
          message: '🚀 feat: add emoji support',
          shortHash: '0000000',
          description: 'add emoji support',
          type: 'feat',
          scope: '',
          references: [
            { value: '0000000', type: 'hash' },
          ],
          isBreaking: false,
        },
        {
          message: ':bug: fix: this is a text emoji',
          shortHash: '0000001',
          description: 'this is a text emoji',
          type: 'fix',
          scope: '',
          references: [
            { value: '0000001', type: 'hash' },
          ],
          isBreaking: false,
        },
        {
          message: ':bug: fix(scope): this is a text emoji with scope',
          shortHash: '0000001',
          description: 'this is a text emoji with scope',
          type: 'fix',
          scope: 'scope',
          references: [
            { value: '0000001', type: 'hash' },
          ],
          isBreaking: false,
        },
      ])
    })
  })

  describe('When the body has Co-authored-by trailers', () => {
    it('Then the co-authors follow the author', () => {
      const [parsed] = parseCommits([
        raw('🚀 feat: add emoji support', '0000000', 'Co-authored-by: Pooya Parsa <pooya@pi0.io>', jannchie),
      ], config)

      expect(parsed?.authors).toEqual([jannchie, pooya])
    })
  })

  describe('When the body has a BREAKING CHANGE footer', () => {
    it('Then the commit is breaking', () => {
      const [parsed] = parseCommits([
        raw('💥 feat: added a breaking change', '0000000', 'BREAKING CHANGE: added a breaking change.', jannchie),
      ], config)

      expect(parsed).toEqual(expect.objectContaining({
        description: 'added a breaking change',
        type: 'feat',
        scope: '',
        isBreaking: true,
      }))
    })
  })

  describe('When a history is parsed', () => {
    it('Then it extracts the type, the scope, the breaking mark and the references', () => {
      const parsed = parseCommits([
        raw('chore(release): v0.3.5', '3828bda'),
        raw('fix(scope)!: breaking change example, close #123 (#134)', '20e622e'),
        raw('feat: infer github config from package.json (resolves #37)', 'c0febf1'),
        raw('fix: consider docs and refactor as semver patch for bump', '648ccf1'),
        raw('feat: expose `determineSemverChange` and `bumpVersion`', '5451f18'),
        raw('chore(deps): update all non-major dependencies (#42)', 'a80e372', '', { email: '29139614+renovate[bot]@users.noreply.github.com', name: 'renovate[bot]' }),
      ], config)

      expect(withoutAuthors(parsed)).toEqual([
        {
          description: 'v0.3.5',
          isBreaking: false,
          message: 'chore(release): v0.3.5',
          references: [
            { type: 'hash', value: '3828bda' },
          ],
          scope: 'release',
          shortHash: '3828bda',
          type: 'chore',
        },
        {
          description: 'breaking change example, close #123',
          isBreaking: true,
          message: 'fix(scope)!: breaking change example, close #123 (#134)',
          references: [
            { type: 'pull-request', value: '#134' },
            { type: 'issue', value: '#123' },
            { type: 'hash', value: '20e622e' },
          ],
          scope: 'scope',
          shortHash: '20e622e',
          type: 'fix',
        },
        {
          description: 'infer github config from package.json',
          isBreaking: false,
          message: 'feat: infer github config from package.json (resolves #37)',
          references: [
            { type: 'pull-request', value: '#37' },
            { type: 'hash', value: 'c0febf1' },
          ],
          scope: '',
          shortHash: 'c0febf1',
          type: 'feat',
        },
        {
          description: 'consider docs and refactor as semver patch for bump',
          isBreaking: false,
          message: 'fix: consider docs and refactor as semver patch for bump',
          references: [
            { type: 'hash', value: '648ccf1' },
          ],
          scope: '',
          shortHash: '648ccf1',
          type: 'fix',
        },
        {
          description: 'expose `determineSemverChange` and `bumpVersion`',
          isBreaking: false,
          message: 'feat: expose `determineSemverChange` and `bumpVersion`',
          references: [
            { type: 'hash', value: '5451f18' },
          ],
          scope: '',
          shortHash: '5451f18',
          type: 'feat',
        },
        {
          description: 'update all non-major dependencies',
          isBreaking: false,
          message: 'chore(deps): update all non-major dependencies (#42)',
          references: [
            { type: 'pull-request', value: '#42' },
            { type: 'hash', value: 'a80e372' },
          ],
          scope: 'deps',
          shortHash: 'a80e372',
          type: 'chore',
        },
      ])
    })
  })

  describe('When a commit does not follow the conventional commits', () => {
    it('Then it is left out', () => {
      expect(parseCommits([
        raw('Merge branch develop', 'aaaaaaa'),
        raw('fix: bug', 'bbbbbbb'),
      ], config).map(commit => commit.shortHash)).toEqual(['bbbbbbb'])
    })
  })
})

describe('Given parseGitCommit', () => {
  describe('When the scope is in the scopeMap', () => {
    it('Then the scope is renamed', () => {
      expect(parseGitCommit(raw('feat(ui): button', 'aaaaaaa'), {
        scopeMap: { ui: 'components' },
      })?.scope).toBe('components')
    })
  })

  describe('When there is no scopeMap', () => {
    it('Then the scope is kept', () => {
      expect(parseGitCommit(raw('feat(ui): button', 'aaaaaaa'), {})?.scope).toBe('ui')
    })
  })

  describe('When the type is uppercase', () => {
    it('Then the type is kept as written', () => {
      expect(parseGitCommit(raw('FEAT: button', 'aaaaaaa'), config)?.type).toBe('FEAT')
    })
  })
})
