import type { logger } from '@maz-ui/node'
import { vi } from 'vitest'

// Mock changelogen module globally to avoid missing export errors
vi.mock('changelogen', async (importOriginal) => {
  const actual = await importOriginal<typeof import('changelogen')>()
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

vi.mock('@maz-ui/node', (importActual) => {
  return {
    ...importActual<typeof import('@maz-ui/node')>(),
    execPromise: vi.fn((param) => {
      if (param === `git tag --sort=-creatordate | grep -E '^[^0-9]*[0-9]+\\.[0-9]+\\.[0-9]+$' | head -n 1`) {
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
