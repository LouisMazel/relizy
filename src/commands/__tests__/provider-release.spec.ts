import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import * as core from '../../core'
import { providerRelease } from '../provider-release'

logger.setLevel('error')

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
    executeHook: vi.fn(),
    github: vi.fn(),
    gitlab: vi.fn(),
  }
})

describe('Given providerRelease command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({ bump: { type: 'patch' } })
    config.repo = { provider: 'github', domain: 'github.com', repo: 'user/repo' }
    vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(core.executeHook).mockResolvedValue(undefined)
    vi.mocked(core.github).mockResolvedValue([])
    vi.mocked(core.gitlab).mockResolvedValue([])
  })

  describe('When creating GitHub release', () => {
    it('Then loads config and executes hooks', async () => {
      await providerRelease({})

      expect(core.loadRelizyConfig).toHaveBeenCalled()
      expect(core.executeHook).toHaveBeenCalledWith('before:provider-release', expect.any(Object), false)
    })

    it('Then calls github function', async () => {
      await providerRelease({})

      expect(core.github).toHaveBeenCalled()
    })

    it('Then executes success hook', async () => {
      await providerRelease({})

      expect(core.executeHook).toHaveBeenCalledWith('success:provider-release', expect.any(Object), false)
    })
  })

  describe('When creating GitLab release', () => {
    it('Then calls gitlab function', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = { provider: 'gitlab', domain: 'gitlab.com', repo: 'user/repo' }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await providerRelease({})

      expect(core.gitlab).toHaveBeenCalled()
    })
  })

  describe('When in dry-run mode', () => {
    it('Then passes dryRun to hooks and provider function', async () => {
      await providerRelease({ dryRun: true })

      expect(core.executeHook).toHaveBeenCalledWith('before:provider-release', expect.any(Object), true)
      expect(core.github).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
      )
    })
  })

  describe('When error occurs', () => {
    it('Then executes error hook', async () => {
      vi.mocked(core.github).mockRejectedValue(new Error('Release failed'))

      await expect(providerRelease({})).rejects.toThrow('Release failed')

      expect(core.executeHook).toHaveBeenCalledWith('error:provider-release', expect.any(Object), false)
    })
  })

  describe('When provider is not supported', () => {
    it('Then throws error', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = { provider: 'bitbucket' as any, domain: 'bitbucket.org', repo: 'user/repo' }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await expect(providerRelease({})).rejects.toThrow()
    })
  })
})
