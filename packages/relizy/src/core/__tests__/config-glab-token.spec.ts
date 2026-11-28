import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { isInCI } from '@relizy/core'
import { loadRelizyConfig } from '../config'

// The setup file mocks this module: these tests run a fake glab
vi.unmock('../../../../core/src/glab-cli')
// Outside a CI, whatever runs the tests: a CI never asks glab
vi.mock('../../../../core/src/ci-env', async importOriginal => ({
  ...await importOriginal<typeof import('../../../../core/src/ci-env')>(),
  isInCI: vi.fn(() => false),
}))

describe('Given the token of the GitLab CLI in the config', () => {
  let bin: string

  /** A glab printing this token for gitlab.com, failing (not logged in) for the other hosts */
  function fakeGlab(token: string) {
    writeFileSync(join(bin, 'glab'), `#!/bin/sh\nif [ "$5" = "gitlab.com" ]; then echo "${token}"; else echo "not logged in" >&2; exit 1; fi\n`)
    chmodSync(join(bin, 'glab'), 0o755)
  }

  const load = () => loadRelizyConfig({
    overrides: {
      cwd: bin,
      repo: { provider: 'gitlab', domain: 'gitlab.com', repo: 'acme/app' },
    },
  })

  beforeEach(() => {
    bin = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-glab-')))
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH}`)
    for (const name of [
      'RELIZY_GITLAB_TOKEN',
      'GITLAB_TOKEN',
      'GITLAB_API_TOKEN',
      'CI_JOB_TOKEN',
    ]) {
      vi.stubEnv(name, undefined)
    }
    vi.mocked(isInCI).mockReturnValue(false)
    fakeGlab('glpat-abc')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(bin, { recursive: true, force: true })
  })

  it('When a local run has no GitLab token, Then it uses the token of glab', async () => {
    expect((await load()).tokens.gitlab).toBe('glpat-abc')
  })

  it('When GITLAB_TOKEN is set, Then it wins, and a CI never asks glab', async () => {
    vi.stubEnv('GITLAB_TOKEN', 'glpat-env')
    expect((await load()).tokens.gitlab).toBe('glpat-env')

    vi.stubEnv('GITLAB_TOKEN', undefined)
    vi.mocked(isInCI).mockReturnValue(true)
    expect((await load()).tokens.gitlab).toBeUndefined()
  })
})
