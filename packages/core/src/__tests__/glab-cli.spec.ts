import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { getGlabCliToken } from '../glab-cli'

describe('Given the token of the GitLab CLI', () => {
  let bin: string

  /**
   * A glab logged in on gitlab.com only, with this token; with an expiry
   * date, `glab api` refreshes it to `refreshed-token` (and records the call)
   */
  function fakeGlab(token: string, expiry?: string) {
    writeFileSync(join(bin, 'glab'), `#!/bin/sh
host="$5"; [ "$1" = "api" ] && host="$4"
if [ "$host" != "gitlab.com" ]; then echo "not logged in" >&2; exit 1; fi
if [ "$1" = "api" ]; then touch "${bin}/refreshed"; exit 0; fi
if [ "$3" = "oauth2_expiry_date" ]; then echo "${expiry ?? ''}"; exit 0; fi
if [ -e "${bin}/refreshed" ]; then echo "refreshed-token"; else echo "${token}"; fi
`)
    chmodSync(join(bin, 'glab'), 0o755)
  }

  beforeEach(() => {
    bin = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-glab-')))
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH}`)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(bin, { recursive: true, force: true })
  })

  it('When glab is logged in on the host, Then returns its token', () => {
    fakeGlab('glpat-abc')

    expect(getGlabCliToken()).toBe('glpat-abc')
    expect(existsSync(join(bin, 'refreshed'))).toBe(false)
  })

  it('When glab is not logged in on the host, or not installed, Then returns none', () => {
    fakeGlab('glpat-abc')
    expect(getGlabCliToken('gitlab.acme.com')).toBeUndefined()

    vi.stubEnv('PATH', bin)
    rmSync(join(bin, 'glab'))
    expect(getGlabCliToken()).toBeUndefined()
  })

  it('When its OAuth token is still valid, Then returns it without an API call', () => {
    fakeGlab('oauth-token', new Date(Date.now() + 3_600_000).toISOString())

    expect(getGlabCliToken()).toBe('oauth-token')
    expect(existsSync(join(bin, 'refreshed'))).toBe(false)
  })

  it('When its OAuth token is expired, Then an API call of glab refreshes it and the refreshed token is returned', () => {
    fakeGlab('expired-token', new Date(Date.now() - 60_000).toISOString())

    expect(getGlabCliToken()).toBe('refreshed-token')
    expect(existsSync(join(bin, 'refreshed'))).toBe(true)
  })
})
