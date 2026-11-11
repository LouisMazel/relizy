import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { getGhCliToken } from '../gh-cli'

describe('Given the token of the GitHub CLI', () => {
  let bin: string

  /** A gh printing this token for github.com, failing (not logged in) for the other hosts */
  function fakeGh(token: string) {
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\nif [ "$4" = "github.com" ]; then echo "${token}"; else echo "not logged in" >&2; exit 1; fi\n`)
    chmodSync(join(bin, 'gh'), 0o755)
  }

  beforeEach(() => {
    bin = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-gh-')))
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH}`)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(bin, { recursive: true, force: true })
  })

  it('When gh is logged in on the host, Then returns its token', () => {
    fakeGh('gho_abc')

    expect(getGhCliToken('github.com')).toBe('gho_abc')
  })

  it('When gh is not logged in on the host, or not installed, Then returns none', () => {
    fakeGh('gho_abc')
    expect(getGhCliToken('github.acme.com')).toBeUndefined()

    vi.stubEnv('PATH', bin)
    rmSync(join(bin, 'gh'))
    expect(getGhCliToken()).toBeUndefined()
  })
})
