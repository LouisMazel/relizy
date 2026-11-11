import type { logger } from '@maz-ui/node'
import { vi } from 'vitest'

// The OIDC token of the CI job running the tests (npm trusted publishing): the tests that need it stub it
for (const variable of ['ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'NPM_ID_TOKEN']) {
  delete process.env[variable]
}

// The outputs and the summary of the CI job running the tests: each release of the tests would write its report there
for (const variable of ['GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY']) {
  delete process.env[variable]
}

// Mock the repository resolution globally: no test reads the remote of the relizy repository
vi.mock('../core/src/repo-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/src/repo-config')>()
  return {
    ...actual,
    resolveRepoConfig: vi.fn().mockResolvedValue({
      provider: 'github',
      domain: 'github.com',
      repo: 'test/repo',
      url: 'https://github.com/test/repo',
    }),
    getRepoConfig: vi.fn().mockReturnValue({
      provider: 'github',
      domain: 'github.com',
      repo: 'test/repo',
      url: 'https://github.com/test/repo',
    }),
  }
})

// The token of the GitHub CLI of the machine: none in the tests
vi.mock('../core/src/gh-cli', () => ({
  getGhCliToken: vi.fn(() => undefined),
}))

// The preparation of a CI clone runs git on the repository: none in the tests
vi.mock('../core/src/ci', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/src/ci')>()
  return {
    ...actual,
    prepareCiRepository: vi.fn(),
    ensureFullHistory: vi.fn(),
    attachCiBranch: vi.fn(),
    applyCiGitIdentity: vi.fn(),
    ensurePushAccess: vi.fn(() => Promise.resolve()),
  }
})

// The push access of the config: the push check of the CI is none in the tests
vi.mock('./src/core/ci', () => ({
  ensurePushAccess: vi.fn(() => Promise.resolve()),
}))

vi.mock('@maz-ui/node', async (importActual) => {
  return {
    ...await importActual<typeof import('@maz-ui/node')>(),
    execPromise: vi.fn((param) => {
      if (param === `git tag --sort=-creatordate | grep -E '^[^0-9@]*[0-9]+\\.[0-9]+\\.[0-9]+$' | head -n 1`) {
        return Promise.resolve({
          stdout: 'LAST_STABLE_TAG',
        })
      }

      if (param === `git tag --sort=-creatordate | head -n 1`) {
        return Promise.resolve({
          stdout: 'LAST_TAG',
        })
      }

      return Promise.resolve({
        stdout: '',
      })
    }),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
      box: vi.fn(),
      start: vi.fn(),
      fail: vi.fn(),
      trace: vi.fn(),
      verbose: vi.fn(),
      getLevel: vi.fn(),
      setLevel: vi.fn(),
      fatal: vi.fn(),
      ready: vi.fn(),
      silent: vi.fn(),
      divider: vi.fn(),
      addReporter: vi.fn(),
      removeReporter: vi.fn(),
      brand: vi.fn(),
      break: vi.fn(),
      clear: vi.fn(),
      eot: vi.fn(),
    } satisfies typeof logger,
  }
})
