import { Buffer } from 'node:buffer'
import { checkTrustedPublisher, getPublishAuth, getUnsupportedRunnerReason } from '../publish-auth'

const NPMJS = 'https://registry.npmjs.org/'
const GITHUB_OIDC = { GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example/?api-version=2.0', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token' }

function jwt(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
}

describe('Given getPublishAuth function', () => {
  it('Then is oidc on npmjs without token in a job that can get an ID token', () => {
    expect(getPublishAuth({ registry: NPMJS, token: undefined, env: GITHUB_OIDC })).toEqual({ mode: 'oidc', provider: 'GitHub Actions' })
    expect(getPublishAuth({
      registry: NPMJS,
      token: undefined,
      env: { GITLAB_CI: 'true', NPM_ID_TOKEN: 'jwt' },
    })).toEqual({ mode: 'oidc', provider: 'GitLab CI' })
    expect(getPublishAuth({
      registry: NPMJS,
      token: undefined,
      env: { CIRCLECI: 'true', NPM_ID_TOKEN: 'jwt' },
    })).toEqual({ mode: 'oidc', provider: 'CircleCI' })
  })

  it('Then is token with a token, and tells the token fallback when an ID token is also obtainable', () => {
    expect(getPublishAuth({ registry: NPMJS, token: 'npm_abc', env: {} })).toEqual({ mode: 'token' })
    expect(getPublishAuth({ registry: NPMJS, token: 'npm_abc', env: GITHUB_OIDC })).toEqual({ mode: 'token', provider: 'GitHub Actions', tokenFallback: true })
  })

  it('Then is npmrc without token nor ID token, and on another registry without token', () => {
    expect(getPublishAuth({ registry: NPMJS, token: undefined, env: {} })).toEqual({ mode: 'npmrc' })
    expect(getPublishAuth({ registry: 'https://npm.pkg.github.com/', token: undefined, env: GITHUB_OIDC })).toEqual({ mode: 'npmrc' })
    expect(getPublishAuth({ registry: 'https://npm.pkg.github.com/', token: 'ghp', env: GITHUB_OIDC })).toEqual({ mode: 'token' })
  })
})

describe('Given getUnsupportedRunnerReason function', () => {
  it('Then names GitHub self-hosted runners and GitLab self-managed instances', () => {
    expect(getUnsupportedRunnerReason({ GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' })).toContain('GitHub self-hosted runners')
    expect(getUnsupportedRunnerReason({ GITLAB_CI: 'true', CI_SERVER_HOST: 'gitlab.acme.dev' })).toContain('gitlab.acme.dev')
  })

  it('Then says nothing for hosted runners, gitlab.com and CircleCI', () => {
    expect(getUnsupportedRunnerReason({ GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' })).toBeUndefined()
    expect(getUnsupportedRunnerReason({ GITLAB_CI: 'true', CI_SERVER_HOST: 'gitlab.com' })).toBeUndefined()
    expect(getUnsupportedRunnerReason({ CIRCLECI: 'true' })).toBeUndefined()
    expect(getUnsupportedRunnerReason({})).toBeUndefined()
  })
})

describe('Given checkTrustedPublisher function', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function respond(status: number, body: unknown = {}) {
    return new Response(typeof body === 'string'
      ? body
      : JSON.stringify(body), { status })
  }

  it('Then asks GitHub for an ID token with the npm audience and exchanges it for the package', async () => {
    fetchMock
      .mockResolvedValueOnce(respond(200, { value: 'github-id-token' }))
      .mockResolvedValueOnce(respond(201, { token: 'secret-publish-token' }))
    const logger = {
      debug: vi.fn(),
    }

    const check = await checkTrustedPublisher({
      registry: NPMJS,
      packageName: '@scope/pkg',
      env: GITHUB_OIDC,
      logger,
    })

    expect(check).toEqual({ status: 'matched', httpStatus: 201 })
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://token.actions.example/?api-version=2.0&audience=npm%3Aregistry.npmjs.org')
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe('Bearer request-token')
    expect(fetchMock.mock.calls[1]![0]).toBe('https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@scope%2fpkg')
    expect(fetchMock.mock.calls[1]![1]).toEqual(expect.objectContaining({ method: 'POST' }))
    expect(fetchMock.mock.calls[1]![1].headers.Authorization).toBe('Bearer github-id-token')
    expect(JSON.stringify(check)).not.toContain('secret-publish-token')
    expect(JSON.stringify(logger.debug.mock.calls)).not.toContain('secret-publish-token')
  })

  it('Then uses NPM_ID_TOKEN first, as npm does', async () => {
    const idToken = jwt({ aud: 'npm:registry.npmjs.org' })
    fetchMock.mockResolvedValueOnce(respond(200, { token: 't' }))

    const check = await checkTrustedPublisher({
      registry: NPMJS,
      packageName: 'pkg',
      env: { GITLAB_CI: 'true', NPM_ID_TOKEN: idToken },
    })

    expect(check.status).toBe('matched')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${idToken}`)
  })

  it('Then reports a wrong audience of NPM_ID_TOKEN without asking npm', async () => {
    const check = await checkTrustedPublisher({
      registry: NPMJS,
      packageName: 'pkg',
      env: {
        GITLAB_CI: 'true',
        NPM_ID_TOKEN: jwt({ aud: 'https://gitlab.com' }),
      },
    })

    expect(check).toEqual({ status: 'no-match', message: 'the ID token has the audience "https://gitlab.com", npm expects "npm:registry.npmjs.org"' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Then reports no match with the status and the message of npm when the package exists', async () => {
    fetchMock
      .mockResolvedValueOnce(respond(404, { message: 'No matching trusted publisher' }))
      .mockResolvedValueOnce(respond(200, { versions: {} }))

    const check = await checkTrustedPublisher({
      registry: NPMJS,
      packageName: 'pkg',
      env: { NPM_ID_TOKEN: 'opaque' },
    })

    expect(check).toEqual({ status: 'no-match', httpStatus: 404, message: 'No matching trusted publisher' })
  })

  it('Then reports a missing package when the package is not on npm', async () => {
    fetchMock
      .mockResolvedValueOnce(respond(404, 'Not found'))
      .mockResolvedValueOnce(respond(404))

    const check = await checkTrustedPublisher({
      registry: NPMJS,
      packageName: 'pkg',
      env: { NPM_ID_TOKEN: 'opaque' },
    })

    expect(check).toEqual({ status: 'missing-package', httpStatus: 404, message: 'Not found' })
  })

  it('Then is unknown on a server error, a network error or without ID token', async () => {
    fetchMock
      .mockResolvedValueOnce(respond(503, ''))
      .mockResolvedValueOnce(respond(200))
    expect((await checkTrustedPublisher({
      registry: NPMJS,
      packageName: 'pkg',
      env: { NPM_ID_TOKEN: 'opaque' },
    })).status).toBe('unknown')

    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    const logger = {
      debug: vi.fn(),
    }
    expect(await checkTrustedPublisher({
      registry: NPMJS,
      packageName: 'pkg',
      env: { NPM_ID_TOKEN: 'opaque' },
      logger,
    })).toEqual({ status: 'unknown' })
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('ECONNRESET'))

    expect((await checkTrustedPublisher({ registry: NPMJS, packageName: 'pkg', env: {} })).status).toBe('unknown')

    fetchMock.mockResolvedValueOnce(respond(500))
    expect((await checkTrustedPublisher({ registry: NPMJS, packageName: 'pkg', env: GITHUB_OIDC })).status).toBe('unknown')
  })
})
