import { createMockConfig } from '../../../tests/mocks'
import { isIgnoredCommitMessage, splitCommitMessage, stripGitComments } from '../commitlint/message'

describe('Given stripGitComments function', () => {
  it('Then removes the comment lines git adds to the edited message', () => {
    const message = 'feat: add a thing\n\nBody line\n# Please enter the commit message\n# On branch main'

    expect(stripGitComments(message)).toBe('feat: add a thing\n\nBody line')
  })

  it('Then removes everything after the scissors line of git commit --verbose', () => {
    const message = 'feat: add a thing\n\n# ------------------------ >8 ------------------------\n# Do not modify\ndiff --git a/file b/file\n+added'

    expect(stripGitComments(message)).toBe('feat: add a thing\n')
  })

  it('Then uses the configured comment character', () => {
    expect(stripGitComments('feat: add a thing\n; comment\n# kept', ';')).toBe('feat: add a thing\n# kept')
  })

  it('Then normalizes Windows line endings', () => {
    expect(stripGitComments('feat: add a thing\r\n\r\nBody\r\n# comment')).toBe('feat: add a thing\n\nBody')
  })
})

describe('Given splitCommitMessage function', () => {
  it('Then splits a header-only message', () => {
    expect(splitCommitMessage('feat: add a thing\n')).toEqual({
      raw: 'feat: add a thing',
      header: 'feat: add a thing',
      body: '',
      footer: '',
      hasLeadingBlank: true,
    })
  })

  it('Then splits the header, body paragraphs and footer', () => {
    const parts = splitCommitMessage('feat: add a thing\n\nFirst paragraph.\n\nSecond paragraph.\n\nCloses #12\nBREAKING CHANGE: the thing changed\n')

    expect(parts.header).toBe('feat: add a thing')
    expect(parts.body).toBe('First paragraph.\n\nSecond paragraph.')
    expect(parts.footer).toBe('Closes #12\nBREAKING CHANGE: the thing changed')
    expect(parts.hasLeadingBlank).toBe(true)
  })

  it('Then keeps a last paragraph with regular text in the body', () => {
    const parts = splitCommitMessage('fix: correct a bug\n\nThe fix: we now check the input.\nIt works.')

    expect(parts.body).toBe('The fix: we now check the input.\nIt works.')
    expect(parts.footer).toBe('')
  })

  it('Then accepts the token #value footer form and BREAKING-CHANGE', () => {
    expect(splitCommitMessage('fix: correct a bug\n\nRefs #12\nBREAKING-CHANGE: removed').footer).toBe('Refs #12\nBREAKING-CHANGE: removed')
  })

  it('Then keeps a footer value continuing on the next lines', () => {
    const parts = splitCommitMessage('feat!: remove the mixins\n\nThe mixins are gone.\n\nBREAKING CHANGE: the removed mixins are no longer\navailable. Use the replacements of the migration guide.')

    expect(parts.body).toBe('The mixins are gone.')
    expect(parts.footer).toBe('BREAKING CHANGE: the removed mixins are no longer\navailable. Use the replacements of the migration guide.')
  })

  it('Then reports a missing blank line after the header', () => {
    expect(splitCommitMessage('feat: add a thing\nBody right after').hasLeadingBlank).toBe(false)
  })

  it('Then treats a footer-only message as a footer', () => {
    const parts = splitCommitMessage('fix: correct a bug\n\nCloses #12')

    expect(parts.body).toBe('')
    expect(parts.footer).toBe('Closes #12')
  })
})

describe('Given isIgnoredCommitMessage function', () => {
  const config = createMockConfig({ templates: { commitMessage: 'chore(release): bump version to {{newVersion}}' } })

  it.each([
    'Merge pull request #12 from org/branch',
    'Merge branch \'main\' into develop',
    'fixup! feat: add a thing',
    'squash! feat: add a thing',
    'amend! feat: add a thing',
    'chore(release): bump version to 1.2.3',
  ])('Then ignores "%s" by default', (message) => {
    expect(isIgnoredCommitMessage(message, config)).toBe(true)
  })

  it.each([
    'feat: add a thing',
    'Revert "feat: add a thing"',
    'chore(release): prepare the next release',
  ])('Then lints "%s"', (message) => {
    expect(isIgnoredCommitMessage(message, config)).toBe(false)
  })

  it('Then matches the release commits of a custom template', () => {
    const custom = createMockConfig({ templates: { commitMessage: 'release: {{packageCount}} packages ({{rootVersion}})' } })

    expect(isIgnoredCommitMessage('release: 3 packages (1.0.0)', custom)).toBe(true)
    expect(isIgnoredCommitMessage('release: everything', custom)).toBe(false)
  })

  it('Then escapes the regular expression characters of the template', () => {
    const custom = createMockConfig({ templates: { commitMessage: 'chore(release): v{{newVersion}} [skip ci]' } })

    expect(isIgnoredCommitMessage('chore(release): v1.0.0 [skip ci]', custom)).toBe(true)
    expect(isIgnoredCommitMessage('chore(release): v1.0.0 s', custom)).toBe(false)
  })

  it('Then lints everything with defaultIgnores disabled', () => {
    const strict = createMockConfig({ commitlint: { defaultIgnores: false }, templates: { commitMessage: 'chore(release): bump version to {{newVersion}}' } })

    expect(isIgnoredCommitMessage('Merge branch \'main\'', strict)).toBe(false)
    expect(isIgnoredCommitMessage('chore(release): bump version to 1.2.3', strict)).toBe(false)
  })

  it('Then applies the ignores of the config: regular expressions on the header and functions on the message', () => {
    const custom = createMockConfig({
      commitlint: {
        ignores: [/^Initial commit$/, (message: string) => message.includes('[skip lint]')],
      },
    })

    expect(isIgnoredCommitMessage('Initial commit', custom)).toBe(true)
    expect(isIgnoredCommitMessage('wip\n\n[skip lint]', custom)).toBe(true)
    expect(isIgnoredCommitMessage('wip', custom)).toBe(false)
  })
})
