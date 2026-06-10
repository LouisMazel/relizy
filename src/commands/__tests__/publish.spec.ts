import { execPromise, logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { executeHook, getPackagesOrBumpedPackages, getPackagesToPublishInSelectiveMode, loadRelizyConfig, publishPackage, readPackageJson, topologicalSort } from '../../core'
import { publish, publishSafetyCheck } from '../publish'

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

  describe('When package manager is not pnpm or npm', () => {
    it('Then skips auth check', async () => {
      const config = createMockConfig({ bump: { type: 'patch' }, publish: { safetyCheck: true, private: false, args: [], packageManager: undefined as any }, safetyCheck: true, release: { publish: true } })

      await publishSafetyCheck({ config })

      expect(processExitSpy).not.toHaveBeenCalled()
    })
  })

  describe('When auth check fails', () => {
    it('Then exits with code 1', async () => {
      const config = createMockConfig({ bump: { type: 'patch' }, publish: { safetyCheck: true, private: false, args: [], packageManager: 'npm' }, safetyCheck: true, release: { publish: true } })
      vi.mocked(execPromise).mockRejectedValue(new Error('Auth failed'))

      await expect(() => publishSafetyCheck({ config })).rejects.toThrow()
    })
  })

  describe('When the auth check times out', () => {
    it('Then throws a clear timeout error mentioning --no-safety-check', async () => {
      const config = createMockConfig({ bump: { type: 'patch' }, publish: { safetyCheck: true, private: false, args: [], packageManager: 'npm', safetyCheckTimeout: 30000 }, safetyCheck: true, release: { publish: true } })
      // execPromise kills the command on timeout: error.killed is then true.
      vi.mocked(execPromise).mockRejectedValue(Object.assign(new Error('killed'), { killed: true }))

      await expect(() => publishSafetyCheck({ config })).rejects.toThrow(/timed out/i)
      await expect(() => publishSafetyCheck({ config })).rejects.toThrow(/--no-safety-check/)
    })

    it('Then passes the configured timeout to execPromise', async () => {
      const config = createMockConfig({ bump: { type: 'patch' }, publish: { safetyCheck: true, private: false, args: [], packageManager: 'npm', safetyCheckTimeout: 12345 }, safetyCheck: true, release: { publish: true } })
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await publishSafetyCheck({ config })

      expect(execPromise).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 12345 }),
      )
    })
  })

  describe('When the registry is slow to respond', () => {
    it('Then logs a patience message before the timeout', async () => {
      vi.useFakeTimers()
      try {
        const config = createMockConfig({ bump: { type: 'patch' }, publish: { safetyCheck: true, private: false, args: [], packageManager: 'npm', safetyCheckTimeout: 15000 }, safetyCheck: true, release: { publish: true } })
        let resolveExec: (value: { stdout: string, stderr: string }) => void = () => {}
        vi.mocked(execPromise).mockReturnValue(new Promise((resolve) => {
          resolveExec = resolve
        }))

        const promise = publishSafetyCheck({ config })
        await vi.advanceTimersByTimeAsync(5000)

        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('longer than expected'))

        resolveExec({ stdout: '', stderr: '' })
        await promise
      }
      finally {
        vi.useRealTimers()
      }
    })
  })

  describe('When auth check succeeds', () => {
    it('Then does not exit', async () => {
      const config = createMockConfig({ bump: { type: 'patch' }, publish: { safetyCheck: true, private: false, args: [], packageManager: 'npm' }, safetyCheck: true, release: { publish: true } })
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await publishSafetyCheck({ config })

      expect(processExitSpy).not.toHaveBeenCalled()
    })
  })

  describe('When safety check is disabled', () => {
    it('Then returns early without checking', async () => {
      const config = createMockConfig({ bump: { type: 'patch' }, publish: { safetyCheck: false, private: false, args: [] }, safetyCheck: true, release: { publish: true } })

      await publishSafetyCheck({ config })

      expect(processExitSpy).not.toHaveBeenCalled()
    })
  })

  describe('When publish is disabled', () => {
    it('Then returns early without checking', async () => {
      const config = createMockConfig({ bump: { type: 'patch' }, publish: { safetyCheck: true, private: false, args: [] }, safetyCheck: true, release: { publish: false } })

      await publishSafetyCheck({ config })

      expect(processExitSpy).not.toHaveBeenCalled()
    })
  })
})

describe('Given publish command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({ bump: { type: 'patch' }, publish: { packageManager: 'npm' } }))
    vi.mocked(executeHook).mockResolvedValue(undefined)
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
      vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({ bump: { type: 'patch' }, publish: { packageManager: 'pnpm' } }))
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

  describe('When the discovered list contains private packages', () => {
    it('Then excludes them from the publish flow even when includePrivates is enabled', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
        bump: { type: 'patch' },
        publish: { packageManager: 'npm' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'], includePrivates: true },
      }))
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        createMockPackageInfo({ name: '@scope/public', version: '1.0.0', path: '/pub', private: false, commits: [], dependencies: [] }),
        createMockPackageInfo({ name: '@scope/private', version: '1.0.0', path: '/priv', private: true, commits: [], dependencies: [] }),
      ])

      await publish({})

      expect(publishPackage).toHaveBeenCalledTimes(1)
      expect(publishPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          pkg: expect.objectContaining({ name: '@scope/public' }),
        }),
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
