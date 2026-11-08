import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { isInCI } from '../ci-env'
import { loadRelizyConfig } from '../config'
import { getGhCliToken } from '../gh-cli'

// The setup file mocks this module: these tests run a fake gh
vi.unmock('../gh-cli')
// Outside a CI, whatever runs the tests: a CI never asks gh
vi.mock('../ci-env', async importOriginal => ({
  ...await importOriginal<typeof import('../ci-env')>(),
  isInCI: vi.fn(() => false),
}))

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

  describe('When the config is loaded', () => {
    const TOKEN_VARIABLES = [
      'RELIZY_GITHUB_TOKEN',
      'GITHUB_TOKEN',
      'GH_TOKEN',
    ]

    beforeEach(() => {
      for (const name of TOKEN_VARIABLES) {
        vi.stubEnv(name, undefined)
      }
      vi.mocked(isInCI).mockReturnValue(false)
      fakeGh('gho_abc')
    })

    it('Then a local run without GITHUB_TOKEN uses the token of gh', async () => {
      const config = await loadRelizyConfig({
        overrides: {
          cwd: bin,
          repo: { provider: 'github', domain: 'github.com', repo: 'acme/app' },
        },
      })

      expect(config.tokens.github).toBe('gho_abc')
    })

    it('Then GITHUB_TOKEN wins, and a CI never asks gh', async () => {
      vi.stubEnv('GITHUB_TOKEN', 'ghp_env')
      expect((await loadRelizyConfig({
        overrides: {
          cwd: bin,
          repo: { provider: 'github', domain: 'github.com', repo: 'acme/app' },
        },
      })).tokens.github).toBe('ghp_env')

      vi.stubEnv('GITHUB_TOKEN', undefined)
      vi.mocked(isInCI).mockReturnValue(true)
      expect((await loadRelizyConfig({
        overrides: {
          cwd: bin,
          repo: { provider: 'github', domain: 'github.com', repo: 'acme/app' },
        },
      })).tokens.github).toBeUndefined()
    })
  })
})
