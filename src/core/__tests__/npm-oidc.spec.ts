import { execSync } from 'node:child_process'
import { assertTrustedPublishingNpm, getEnvNpmToken, getPublishingNpmVersion, getTrustedPublishing, getTrustedPublishingProvider, isNpmjsRegistry } from '../npm-oidc'

vi.mock('node:child_process', () => ({ execSync: vi.fn() }))

const GITHUB_OIDC = { GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.githubusercontent.com', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token' }

function mockVersions(versions: Record<string, string>) {
  vi.mocked(execSync).mockImplementation(((command: string) => {
    const tool = command.split(' ')[0]!
    if (!versions[tool]) {
      throw new Error(`${tool}: command not found`)
    }
    return `${versions[tool]}\n`
  }) as typeof execSync)
}

describe('Given npm trusted publishing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When the job can get an OIDC token', () => {
    it('Then detects GitHub Actions with the id-token permission', () => {
      expect(getTrustedPublishingProvider(GITHUB_OIDC)).toBe('GitHub Actions')
    })

    it('Then does not detect GitHub Actions without the id-token permission', () => {
      expect(getTrustedPublishingProvider({ GITHUB_ACTIONS: 'true' })).toBeUndefined()
    })

    it('Then detects GitLab CI with the NPM_ID_TOKEN id token', () => {
      expect(getTrustedPublishingProvider({ GITLAB_CI: 'true', NPM_ID_TOKEN: 'jwt' })).toBe('GitLab CI')
      expect(getTrustedPublishingProvider({ GITLAB_CI: 'true' })).toBeUndefined()
    })
  })

  describe('When a registry is published', () => {
    it('Then uses trusted publishing on npmjs.org without token', () => {
      expect(getTrustedPublishing({ registry: 'https://registry.npmjs.org/', token: undefined, env: GITHUB_OIDC })).toBe('GitHub Actions')
    })

    it('Then keeps the token when there is one', () => {
      expect(getTrustedPublishing({ registry: 'https://registry.npmjs.org/', token: 'npm_token', env: GITHUB_OIDC })).toBeUndefined()
    })

    it('Then never uses it on another registry', () => {
      expect(isNpmjsRegistry('https://npm.pkg.github.com/')).toBe(false)
      expect(getTrustedPublishing({ registry: 'https://npm.pkg.github.com/', token: undefined, env: GITHUB_OIDC })).toBeUndefined()
    })
  })

  describe('When the npm token comes from the environment', () => {
    it('Then ignores the placeholder of actions/setup-node', () => {
      expect(getEnvNpmToken({ NODE_AUTH_TOKEN: 'XXXXX-XXXXX-XXXXX-XXXXX' })).toBeUndefined()
      expect(getEnvNpmToken({ NPM_TOKEN: 'npm_token', NODE_AUTH_TOKEN: 'XXXXX-XXXXX-XXXXX-XXXXX' })).toBe('npm_token')
      expect(getEnvNpmToken({ RELIZY_NPM_TOKEN: 'relizy_token', NPM_TOKEN: 'npm_token' })).toBe('relizy_token')
    })
  })

  describe('When the npm of the job is checked', () => {
    it('Then reads npm for npm and for pnpm 10, which runs npm publish', () => {
      mockVersions({ npm: '11.6.0', pnpm: '10.18.0' })

      expect(getPublishingNpmVersion('npm', '/project')).toBe('11.6.0')
      expect(getPublishingNpmVersion('pnpm', '/project')).toBe('11.6.0')
    })

    it('Then does not need npm with pnpm 11, which publishes by itself', () => {
      mockVersions({ npm: '10.9.0', pnpm: '11.2.0' })

      expect(getPublishingNpmVersion('pnpm', '/project')).toBeUndefined()
    })

    it('Then throws with the fix when npm is too old', () => {
      mockVersions({ npm: '10.9.0' })

      expect(() => assertTrustedPublishingNpm({ packageManager: 'npm', cwd: '/project', provider: 'GitHub Actions' }))
        .toThrow(/needs npm 11\.5\.1 or later, the job has npm 10\.9\.0[\s\S]*npm install -g npm@latest/)
    })

    it('Then passes with a recent npm, or when npm cannot be read', () => {
      mockVersions({ npm: '11.5.1' })
      expect(() => assertTrustedPublishingNpm({ packageManager: 'npm', cwd: '/project', provider: 'GitHub Actions' })).not.toThrow()

      mockVersions({})
      expect(() => assertTrustedPublishingNpm({ packageManager: 'npm', cwd: '/project', provider: 'GitHub Actions' })).not.toThrow()
    })
  })
})
