import { execPromise, logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import * as core from '../../core'
import { publish, publishSafetyCheck } from '../publish'

logger.setLevel('error')

vi.mock('@maz-ui/node', async () => {
  const actual = await vi.importActual('@maz-ui/node')
  return {
    ...actual,
    execPromise: vi.fn(),
  }
})

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
      vi.mocked(core.detectPackageManager).mockReturnValue(null)

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
      vi.mocked(core.detectPackageManager).mockReturnValue('npm')
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
      vi.mocked(core.detectPackageManager).mockReturnValue('npm')
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

      expect(core.detectPackageManager).not.toHaveBeenCalled()
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

      expect(core.detectPackageManager).not.toHaveBeenCalled()
      expect(processExitSpy).not.toHaveBeenCalled()
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
