import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { executeHook, github, gitlab, loadRelizyConfig } from '../../core'
import { providerRelease } from '../provider-release'

vi.mock('../../core/config', async () => {
  const actual = await vi.importActual('../../core/config')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
  }
})
vi.mock('../../core/gitlab', () => {
  return {
    gitlab: vi.fn(),
  }
})
vi.mock('../../core/github', () => {
  return {
    github: vi.fn(),
  }
})
vi.mock('../../core/utils', () => {
  return {
    executeHook: vi.fn(),
  }
})

describe('Given providerRelease command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({ bump: { type: 'patch' }, repo: { provider: 'github', domain: 'github.com', repo: 'user/repo' }, safetyCheck: false })
    vi.mocked(loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(executeHook).mockResolvedValue(undefined)
    vi.mocked(github).mockResolvedValue([])
    vi.mocked(gitlab).mockResolvedValue([])
  })

  describe('When creating GitHub release', () => {
    it('Then loads config and executes hooks', async () => {
      await providerRelease({})

      expect(loadRelizyConfig).toHaveBeenCalled()
      expect(executeHook).toHaveBeenCalledWith('before:provider-release', expect.any(Object), false)
    })

    it('Then calls github function', async () => {
      await providerRelease({})

      expect(github).toHaveBeenCalled()
    })

    it('Then executes success hook', async () => {
      await providerRelease({})

      expect(executeHook).toHaveBeenCalledWith('success:provider-release', expect.any(Object), false)
    })
  })

  describe('When creating GitLab release', () => {
    it('Then calls gitlab function', async () => {
      const config = createMockConfig({ bump: { type: 'patch' }, safetyCheck: false })
      config.repo = { provider: 'gitlab', domain: 'gitlab.com', repo: 'user/repo' }
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await providerRelease({
        provider: 'gitlab',
      })

      expect(gitlab).toHaveBeenCalled()
    })
  })

  describe('When in dry-run mode', () => {
    it('Then passes dryRun to hooks and provider function', async () => {
      await providerRelease({ dryRun: true })

      expect(executeHook).toHaveBeenCalledWith('before:provider-release', expect.any(Object), true)
      expect(github).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
      )
    })
  })

  describe('When error occurs', () => {
    it('Then executes error hook', async () => {
      vi.mocked(github).mockRejectedValue(new Error('Release failed'))

      await expect(providerRelease({})).rejects.toThrow('Release failed')

      expect(executeHook).toHaveBeenCalledWith('error:provider-release', expect.any(Object), false)
    })
  })

  describe('When provider is not supported', () => {
    it('Then throws error', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = { provider: 'bitbucket' as any, domain: 'bitbucket.org', repo: 'user/repo' }
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await expect(providerRelease({})).rejects.toThrow()
    })
  })
})
