import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import * as core from '../../core'
import { publish, publishSafetyCheck } from '../publish'

logger.setLevel('error')

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
    executeHook: vi.fn(),
    getPackagesOrBumpedPackages: vi.fn(),
    detectPackageManager: vi.fn(),
    publishPackage: vi.fn(),
    topologicalSort: vi.fn(),
    readPackageJson: vi.fn(),
  }
})

describe('Given publishSafetyCheck function', () => {
  describe('When safety check is enabled', () => {
    it('Then throws error if not in CI', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.publish = { safetyCheck: true, private: false, args: [] }

      expect(() => publishSafetyCheck({ config })).toThrow('Safety check')
    })
  })

  describe('When safety check is disabled', () => {
    it('Then does not throw error', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.publish = { safetyCheck: false, private: false, args: [] }

      expect(() => publishSafetyCheck({ config })).not.toThrow()
    })
  })
})

describe('Given publish command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(core.loadRelizyConfig).mockResolvedValue(createMockConfig({ bump: { type: 'patch' } }))
    vi.mocked(core.executeHook).mockResolvedValue(undefined)
    vi.mocked(core.detectPackageManager).mockReturnValue('npm')
    vi.mocked(core.publishPackage).mockResolvedValue(undefined)
    vi.mocked(core.topologicalSort).mockImplementation(pkgs => pkgs)
    vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([])
    vi.mocked(core.readPackageJson).mockReturnValue({ name: 'test', version: '1.0.0' })
  })

  describe('When publishing with default options', () => {
    it('Then loads config and executes hooks', async () => {
      await publish({})

      expect(core.loadRelizyConfig).toHaveBeenCalled()
      expect(core.executeHook).toHaveBeenCalledWith('before:publish', expect.any(Object), false)
    })

    it('Then detects package manager', async () => {
      await publish({})

      expect(core.detectPackageManager).toHaveBeenCalled()
    })

    it('Then executes success hook', async () => {
      await publish({})

      expect(core.executeHook).toHaveBeenCalledWith('success:publish', expect.any(Object), false)
    })
  })

  describe('When publishing packages', () => {
    it('Then publishes in topological order', async () => {
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        { name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [], dependencies: [] },
        { name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [], dependencies: ['pkg-a'] },
      ])

      await publish({})

      expect(core.topologicalSort).toHaveBeenCalled()
      expect(core.publishPackage).toHaveBeenCalledTimes(2)
    })

    it('Then passes package manager to publish', async () => {
      vi.mocked(core.detectPackageManager).mockReturnValue('pnpm')
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        { name: 'pkg', version: '1.0.0', path: '/pkg', commits: [], dependencies: [] },
      ])

      await publish({})

      expect(core.publishPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          packageManager: 'pnpm',
        }),
      )
    })
  })

  describe('When in dry-run mode', () => {
    it('Then passes dryRun to hooks and publish', async () => {
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        { name: 'pkg', version: '1.0.0', path: '/pkg', commits: [], dependencies: [] },
      ])

      await publish({ dryRun: true })

      expect(core.executeHook).toHaveBeenCalledWith('before:publish', expect.any(Object), true)
      expect(core.publishPackage).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
      )
    })
  })

  describe('When error occurs', () => {
    it('Then executes error hook', async () => {
      vi.mocked(core.publishPackage).mockRejectedValue(new Error('Publish failed'))
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        { name: 'pkg', version: '1.0.0', path: '/pkg', commits: [], dependencies: [] },
      ])

      await expect(publish({})).rejects.toThrow('Publish failed')

      expect(core.executeHook).toHaveBeenCalledWith('error:publish', expect.any(Object), false)
    })
  })
})
