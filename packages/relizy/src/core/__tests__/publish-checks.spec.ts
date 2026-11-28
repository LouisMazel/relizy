import { logger } from '@maz-ui/node'
import { withGitCache } from '@relizy/core'
import { createMockConfig } from '../../../tests/mocks'
import { getTrustedPublisherMismatchMessage, reportPublishAuth, runTrustedPublishingPreflight, TOKEN_DIRECT_PUBLISH_END } from '../publish-checks'

const NPMJS = 'https://registry.npmjs.org/'
const GITHUB_OIDC = { GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.example/?v=1', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token' }

function npmConfig(overrides: Parameters<typeof createMockConfig>[0] = {
  bump: { type: 'patch' },
}) {
  return createMockConfig({
    bump: { type: 'patch' },
    publish: {
      safetyCheck: true,
      args: [],
      packageManager: 'npm',
      registry: NPMJS,
    },
    tokens: { registry: undefined },
    safetyCheck: true,
    ...overrides,
  })
}

function stubEnv(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value)
  }
}

describe('Given the publish checks', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of [
      'GITHUB_ACTIONS',
      'GITLAB_CI',
      'CIRCLECI',
      'NPM_ID_TOKEN',
      'ACTIONS_ID_TOKEN_REQUEST_URL',
      'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
      'RUNNER_ENVIRONMENT',
      'GITHUB_REPOSITORY',
      'GITHUB_WORKFLOW_REF',
      'CI_PROJECT_PATH',
      'CI_CONFIG_PATH',
      'CI_ENVIRONMENT_NAME',
    ]) {
      vi.stubEnv(key, '')
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('When the auth of the registries is reported', () => {
    it('Then warns once per run that direct publishing with a token on npmjs ends in January 2027', () => {
      const config = npmConfig({
        bump: { type: 'patch' },
        tokens: { registry: 'npm_token' },
      })

      withGitCache(() => {
        reportPublishAuth({
          config,
          packages: [
            { name: 'a' },
            { name: 'b' },
          ],
        })
        reportPublishAuth({
          config,
          packages: [
            { name: 'a' },
          ],
        })
      })

      const warnings = vi.mocked(logger.warn).mock.calls.filter(call => String(call[0]).includes(TOKEN_DIRECT_PUBLISH_END.date))
      expect(warnings).toHaveLength(1)
      expect(warnings[0]![0]).toContain('move to trusted publishing ("relizy trust") or stage these versions')
      expect(warnings[0]![0]).toContain(TOKEN_DIRECT_PUBLISH_END.source)
    })

    it('Then never warns about tokens for another registry, without token, or when every version is staged', () => {
      reportPublishAuth({
        config: npmConfig({
          bump: { type: 'patch' },
          publish: { registry: 'https://npm.pkg.github.com/', args: [] },
          tokens: { registry: 'ghp' },
        }),
        packages: [
          { name: 'a' },
        ],
      })
      reportPublishAuth({
        config: npmConfig(),
        packages: [
          { name: 'a' },
        ],
      })
      reportPublishAuth({
        config: npmConfig({
          bump: { type: 'patch' },
          tokens: { registry: 'npm_token' },
        }),
        packages: [
          { name: 'a' },
        ],
        directPublish: false,
      })

      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.info).not.toHaveBeenCalled()
    })

    it('Then tells that a token beside trusted publishing is only a fallback', () => {
      stubEnv(GITHUB_OIDC)

      reportPublishAuth({
        config: npmConfig({
          bump: { type: 'patch' },
          tokens: { registry: 'npm_token' },
        }),
        packages: [
          { name: 'a' },
        ],
      })

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('npm tries trusted publishing (OIDC) from GitHub Actions first: once "relizy trust" is done, remove the secret'))
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('this token is only a fallback of trusted publishing and can be removed'))
    })

    it('Then only warns on a runner where npm does not support trusted publishing', () => {
      stubEnv({ ...GITHUB_OIDC, RUNNER_ENVIRONMENT: 'self-hosted' })

      reportPublishAuth({
        config: npmConfig(),
        packages: [
          { name: 'a' },
        ],
      })

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('GitHub self-hosted runners'))
    })
  })

  describe('When the trusted publishing pre-flight runs', () => {
    it('Then exchanges for the packages to publish only, and sums up the ones matched', async () => {
      stubEnv({ GITLAB_CI: 'true', NPM_ID_TOKEN: 'opaque' })
      fetchSpy.mockImplementation(() => Promise.resolve(new Response('{"token":"secret"}', { status: 201 })))

      await runTrustedPublishingPreflight({
        config: npmConfig(),
        packages: [
          { name: '@s/a' },
          { name: '@s/b' },
          { name: '@s/c' },
        ],
      })

      expect(fetchSpy.mock.calls.map(call => call[0])).toEqual([
        `${NPMJS}-/npm/v1/oidc/token/exchange/package/@s%2fa`,
        `${NPMJS}-/npm/v1/oidc/token/exchange/package/@s%2fb`,
        `${NPMJS}-/npm/v1/oidc/token/exchange/package/@s%2fc`,
      ])
      expect(logger.info).toHaveBeenCalledWith('Trusted publishing (OIDC) from GitLab CI: 3 packages matched')
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('Then warns once per answer of npm, naming the packages, the job and the fixes', async () => {
      stubEnv({ ...GITHUB_OIDC, GITHUB_REPOSITORY: 'acme/repo', GITHUB_WORKFLOW_REF: 'acme/repo/.github/workflows/release.yml@refs/heads/main' })
      fetchSpy.mockImplementation((url) => {
        const target = String(url)
        if (target.startsWith('https://token.example')) {
          return Promise.resolve(new Response('{"value":"id-token"}', { status: 200 }))
        }
        if (target.includes('/oidc/')) {
          return Promise.resolve(new Response('{"message":"no trusted publisher"}', { status: 404 }))
        }
        return Promise.resolve(new Response('{}', {
          status: target.endsWith('/new')
            ? 404
            : 200,
        }))
      })

      await runTrustedPublishingPreflight({
        config: npmConfig(),
        packages: [
          { name: 'a' },
          { name: 'b' },
          { name: 'new' },
        ],
      })

      expect(logger.warn).toHaveBeenCalledTimes(2)
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Not on npm yet: new. Trusted publishing cannot create a package: publish its first version from your npm login'))
      expect(logger.warn).toHaveBeenCalledWith('npm does not trust this job to publish a, b (acme/repo, workflow release.yml) (HTTP 404: no trusted publisher). Run "relizy trust" to set up its trusted publisher; it must name the calling workflow (not a reusable one) and the environment of the job. Created more than 2 days ago and never used? npm removed it: run "relizy trust" again. See https://relizy.dev/guide/trusted-publishing')
    })

    it('Then says nothing when npm cannot be asked', async () => {
      stubEnv({ GITLAB_CI: 'true', NPM_ID_TOKEN: 'opaque' })
      fetchSpy.mockRejectedValue(new Error('ECONNRESET'))

      await runTrustedPublishingPreflight({
        config: npmConfig(),
        packages: [
          { name: 'a' },
        ],
      })

      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.info).not.toHaveBeenCalled()
    })

    it('Then does nothing with a token, without trusted publishing, without the safety check, or without package', async () => {
      stubEnv(GITHUB_OIDC)

      await runTrustedPublishingPreflight({
        config: npmConfig({
          bump: { type: 'patch' },
          tokens: { registry: 'npm_token' },
        }),
        packages: [
          { name: 'a' },
        ],
      })
      await runTrustedPublishingPreflight({
        config: npmConfig({
          bump: { type: 'patch' },
          safetyCheck: false,
        }),
        packages: [
          { name: 'a' },
        ],
      })
      await runTrustedPublishingPreflight({
        config: npmConfig(),
        packages: [],
      })
      vi.unstubAllEnvs()
      await runTrustedPublishingPreflight({
        config: npmConfig(),
        packages: [
          { name: 'a' },
        ],
      })

      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  it('Then describes a GitLab job and an answer without status', () => {
    stubEnv({ CI_PROJECT_PATH: 'group/project', CI_CONFIG_PATH: '.gitlab-ci.yml', CI_ENVIRONMENT_NAME: 'npm' })

    expect(getTrustedPublisherMismatchMessage({
      packages: ['a'],
      check: { status: 'no-match', message: 'bad audience' },
    }))
      .toMatch(/^npm does not trust this job to publish a \(group\/project, CI file \.gitlab-ci\.yml, environment npm\) \(bad audience\)\. Run "relizy trust"/)
  })
})
