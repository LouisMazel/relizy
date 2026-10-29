import type { GroupBumpResult } from '../../types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { executeHook, github, gitlab, loadRelizyConfig } from '../../core'
import { aiSafetyCheck } from '../../core/ai'
import { providerRelease, providerReleaseSafetyCheck } from '../provider-release'

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
vi.mock('../../core/ai', () => ({
  aiSafetyCheck: vi.fn(),
  applyAIOverride: vi.fn(),
  isAIProviderReleaseEnabled: vi.fn().mockImplementation((config: any) => !!config.ai?.providerRelease?.enabled),
}))

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
    it('Then executes error hook and returns error', async () => {
      vi.mocked(github).mockRejectedValue(new Error('Release failed'))

      const result = await providerRelease({})

      expect(result).toEqual({
        detectedProvider: 'github',
        postedReleases: [],
        error: 'Release failed',
      })
      expect(executeHook).toHaveBeenCalledWith('error:provider-release', expect.any(Object), false)
    })
  })

  describe('When provider is not supported', () => {
    it('Then returns error', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = { provider: 'bitbucket' as any, domain: 'bitbucket.org', repo: 'user/repo' }
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      const result = await providerRelease({})

      expect(result.error).toBeDefined()
    })
  })
})

describe('Given providerReleaseSafetyCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When AI provider release is enabled', () => {
    it('Then calls aiSafetyCheck', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        safetyCheck: true,
        release: { providerRelease: true, publish: false },
        repo: { provider: 'github', domain: 'github.com', repo: 'user/repo' },
        tokens: { github: 'test-token' },
        ai: { providerRelease: { enabled: true } },
      })

      await providerReleaseSafetyCheck({ config, provider: 'github' })

      expect(aiSafetyCheck).toHaveBeenCalledWith({ config })
    })
  })

  describe('When AI provider release is not enabled', () => {
    it('Then does not call aiSafetyCheck', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        safetyCheck: true,
        release: { providerRelease: true, publish: false },
        repo: { provider: 'github', domain: 'github.com', repo: 'user/repo' },
        tokens: { github: 'test-token' },
      })

      await providerReleaseSafetyCheck({ config, provider: 'github' })

      expect(aiSafetyCheck).not.toHaveBeenCalled()
    })
  })
})

describe('Given providerRelease command with version groups', () => {
  const mainGroup: GroupBumpResult = { name: 'main', versionMode: 'selective', bumped: true, newVersion: '7.0.0', fromTag: 'v6.19.1', bumpedPackages: [] }
  const headerGroup: GroupBumpResult = { name: 'header', versionMode: 'independent', bumped: true, bumpedPackages: [] }

  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({ bump: { type: 'patch' }, repo: { provider: 'github', domain: 'github.com', repo: 'user/repo' }, safetyCheck: false })
    config.monorepo = {
      groups: [
        { name: 'main', versionMode: 'selective', packages: ['packages/*'] },
        { name: 'header', versionMode: 'independent', packages: ['shared/*'] },
      ],
    }
    vi.mocked(loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(executeHook).mockResolvedValue(undefined)
  })

  it('Then posts the releases of each group with the config of the group', async () => {
    vi.mocked(github)
      .mockResolvedValueOnce([{ name: 'v7.0.0', tag: 'v7.0.0', prerelease: false, version: '7.0.0' }])
      .mockResolvedValueOnce([{ name: '@scope/nav@1.2.1', tag: '@scope/nav@1.2.1', prerelease: false, version: '1.2.1' }])

    const result = await providerRelease({
      provider: 'github',
      bumpResult: { bumped: true, bumpedPackages: [], groups: [mainGroup, headerGroup] },
    })

    expect(github).toHaveBeenNthCalledWith(1, expect.objectContaining({
      from: 'v6.19.1',
      bumpResult: mainGroup,
      config: expect.objectContaining({ monorepo: expect.objectContaining({ versionMode: 'selective' }) }),
    }))
    expect(github).toHaveBeenNthCalledWith(2, expect.objectContaining({
      bumpResult: headerGroup,
      config: expect.objectContaining({ monorepo: expect.objectContaining({ versionMode: 'independent' }) }),
    }))
    expect(result.postedReleases.map(release => release.tag)).toEqual(['v7.0.0', '@scope/nav@1.2.1'])
    expect(executeHook).toHaveBeenCalledTimes(2)
  })

  it('Then skips the groups that did not bump', async () => {
    vi.mocked(github).mockResolvedValue([])

    await providerRelease({
      provider: 'github',
      bumpResult: { bumped: true, bumpedPackages: [], groups: [headerGroup] },
    })

    expect(github).toHaveBeenCalledTimes(1)
    expect(github).toHaveBeenCalledWith(expect.objectContaining({ bumpResult: headerGroup }))
  })

  it('Then only releases the targeted groups', async () => {
    vi.mocked(gitlab).mockResolvedValue([])

    await providerRelease({ provider: 'gitlab', groups: ['header'] })

    expect(gitlab).toHaveBeenCalledTimes(1)
    expect(gitlab).toHaveBeenCalledWith(expect.objectContaining({
      bumpResult: undefined,
      config: expect.objectContaining({ monorepo: expect.objectContaining({ versionMode: 'independent' }) }),
    }))
  })

  it('Then returns an error when targeting groups on a config without groups', async () => {
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({ bump: { type: 'patch' }, safetyCheck: false }))

    const result = await providerRelease({ provider: 'github', groups: ['header'] })

    expect(result.error).toContain('the config has no monorepo.groups')
    expect(github).not.toHaveBeenCalled()
  })
})
