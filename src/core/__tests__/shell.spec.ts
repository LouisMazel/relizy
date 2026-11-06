import { shellArg, shellSingleQuote } from '../shell'

describe('Given a value of a shell command', () => {
  it('Then keeps a plain ref as it is', () => {
    expect(shellArg('v1.0.0...HEAD')).toBe('v1.0.0...HEAD')
    expect(shellArg('+refs/heads/feat/a:refs/remotes/origin/feat/a')).toBe('+refs/heads/feat/a:refs/remotes/origin/feat/a')
    expect(shellArg('@scope/pkg@1.0.0')).toBe('@scope/pkg@1.0.0')
  })

  it('Then quotes a branch name that would run a command, valid for git', () => {
    // eslint-disable-next-line no-template-curly-in-string -- a branch name, not a template
    expect(shellArg('feat/a$(touch${IFS}/tmp/pwned)')).toBe('\'feat/a$(touch${IFS}/tmp/pwned)\'')
    expect(shellArg('feat/`id`')).toBe('\'feat/`id`\'')
  })

  it('Then escapes the single quotes', () => {
    expect(shellSingleQuote('it\'s')).toBe('\'it\'\\\'\'s\'')
  })
})
