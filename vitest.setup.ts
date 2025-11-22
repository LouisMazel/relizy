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
