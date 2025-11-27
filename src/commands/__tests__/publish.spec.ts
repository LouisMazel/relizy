import { execPromise, logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { detectPackageManager, executeHook, getPackagesOrBumpedPackages, getPackagesToPublishInSelectiveMode, loadRelizyConfig, publishPackage, readPackageJson, topologicalSort } from '../../core'
import { publish, publishSafetyCheck } from '../publish'

logger.setLevel('silent')

vi.mock('@maz-ui/node', async () => {
  const actual = await vi.importActual('@maz-ui/node')
  return {
    ...actual,
    execPromise: vi.fn(),
  }
})

vi.mock('../../core/config', async () => {
  const actual = await vi.importActual('../../core/config')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
  }
})
vi.mock('../../core/utils', async (importActual) => {
  const actual = await importActual<typeof import('../../core/utils')>()
  return {
    ...actual,
    executeHook: vi.fn(),
    getPackagesOrBumpedPackages: vi.fn(),
  }
})
vi.mock('../../core/npm', async (importActual) => {
  const actual = await importActual<typeof import('../../core/npm')>()
  return {
    ...actual,
    detectPackageManager: vi.fn(),
    publishPackage: vi.fn(),
    getPackagesToPublishInSelectiveMode: vi.fn().mockReturnValue([]),
    getPackagesToPublishInIndependentMode: vi.fn().mockReturnValue([]),
  }
})
vi.mock('../../core/dependencies', () => {
  return {
    topologicalSort: vi.fn(),
  }
})
vi.mock('../../core/repo', () => {
  return {
    readPackageJson: vi.fn(),
  }
})

describe('Given publishSafetyCheck function', () => {
  let processExitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    processExitSpy.mockRestore()
  })

  describe('When package manager cannot be detected', () => {
    it('Then exits with code 1', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.publish = { safetyCheck: true, private: false, args: [] }
      config.safetyCheck = true
      config.release.publish = true
      vi.mocked(detectPackageManager).mockReturnValue(undefined as any)

      await publishSafetyCheck({ config })

      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('When auth check fails', () => {
    it('Then exits with code 1', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.publish = { safetyCheck: true, private: false, args: [] }
      config.safetyCheck = true
      config.release.publish = true
      vi.mocked(detectPackageManager).mockReturnValue('npm')
      vi.mocked(execPromise).mockRejectedValue(new Error('Auth failed'))

      await publishSafetyCheck({ config })

      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('When auth check succeeds', () => {
    it('Then does not exit', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.publish = { safetyCheck: true, private: false, args: [] }
      config.safetyCheck = true
      config.release.publish = true
      vi.mocked(detectPackageManager).mockReturnValue('npm')
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await publishSafetyCheck({ config })

      expect(processExitSpy).not.toHaveBeenCalled()
    })
  })

  describe('When safety check is disabled', () => {
    it('Then returns early without checking', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.publish = { safetyCheck: false, private: false, args: [] }

      await publishSafetyCheck({ config })

      expect(detectPackageManager).not.toHaveBeenCalled()
      expect(processExitSpy).not.toHaveBeenCalled()
    })
  })

  describe('When publish is disabled', () => {
    it('Then returns early without checking', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.publish = { safetyCheck: true, private: false, args: [] }
      config.safetyCheck = true
      config.release.publish = false

      await publishSafetyCheck({ config })

      expect(detectPackageManager).not.toHaveBeenCalled()
      expect(processExitSpy).not.toHaveBeenCalled()
    })
  })
})

describe('Given publish command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({ bump: { type: 'patch' } }))
    vi.mocked(executeHook).mockResolvedValue(undefined)
    vi.mocked(detectPackageManager).mockReturnValue('npm')
    vi.mocked(publishPackage).mockResolvedValue(undefined)
    vi.mocked(topologicalSort).mockImplementation(pkgs => pkgs)
    vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([])
    vi.mocked(readPackageJson).mockReturnValue({ name: 'test', version: '1.0.0', path: '/root', private: false })
  })

  describe('When publishing with default options', () => {
    it('Then loads config and executes hooks', async () => {
      await publish({})

      expect(loadRelizyConfig).toHaveBeenCalled()
      expect(executeHook).toHaveBeenCalledWith('before:publish', expect.any(Object), false)
    })

    it('Then detects package manager', async () => {
      await publish({})

      expect(detectPackageManager).toHaveBeenCalled()
    })

    it('Then executes success hook', async () => {
      vi.mocked(getPackagesToPublishInSelectiveMode).mockReturnValue([
        createMockPackageInfo({ name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [], dependencies: [] }),
        createMockPackageInfo({ name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [], dependencies: ['pkg-a'] }),
      ])

      await publish({})

      expect(executeHook).toHaveBeenCalledWith('success:publish', expect.any(Object), false)
    })
  })

  describe('When publishing packages', () => {
    it('Then publishes in topological order', async () => {
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        createMockPackageInfo({ name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [], dependencies: [] }),
        createMockPackageInfo({ name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [], dependencies: ['pkg-a'] }),
      ])

      await publish({})

      expect(topologicalSort).toHaveBeenCalled()
      expect(publishPackage).toHaveBeenCalledTimes(2)
    })

    it('Then passes package manager to publish', async () => {
      vi.mocked(detectPackageManager).mockReturnValue('pnpm')
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        createMockPackageInfo({ name: 'pkg', version: '1.0.0', path: '/pkg', commits: [], dependencies: [] }),
      ])

      await publish({})

      expect(publishPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          packageManager: 'pnpm',
        }),
      )
    })
  })

  describe('When in dry-run mode', () => {
    it('Then passes dryRun to hooks and publish', async () => {
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        createMockPackageInfo({ name: 'pkg', version: '1.0.0', path: '/pkg', commits: [], dependencies: [] }),
      ])

      await publish({ dryRun: true })

      expect(executeHook).toHaveBeenCalledWith('before:publish', expect.any(Object), true)
      expect(publishPackage).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
      )
    })
  })

  describe('When error occurs', () => {
    it('Then executes error hook', async () => {
      vi.mocked(publishPackage).mockRejectedValue(new Error('Publish failed'))
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        createMockPackageInfo({ name: 'pkg', version: '1.0.0', path: '/pkg', commits: [], dependencies: [] }),
      ])

      await expect(publish({})).rejects.toThrow('Publish failed')

      expect(executeHook).toHaveBeenCalledWith('error:publish', expect.any(Object), false)
    })
  })
})
