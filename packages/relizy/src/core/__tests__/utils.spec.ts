import { execPromise, logger } from '@maz-ui/node'
import { vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { RelizyCancelError } from '../errors'
import { executeBuildCmd, executeHook, getHookContext, getPackagesOrBumpedPackages } from '../utils'

vi.mock('../repo', () => ({
  getPackages: vi.fn().mockResolvedValue([
    { name: 'pkg-a', version: '1.0.0' },
    { name: 'pkg-b', version: '2.0.0' },
  ]),
}))

describe('Given executeHook function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When hook is not found', () => {
    it('Then returns undefined and logs debug message', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
      })

      const result = await executeHook('before:bump', config, false)

      expect(result).toBeUndefined()
      expect(logger.debug).toHaveBeenCalledWith('Hook before:bump not found')
    })
  })

  describe('When the hook fails', () => {
    it('Then the error names the hook', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      config.hooks = {
        'before:publish': () => {
          throw new Error('Published files missing after the build:\nmaz-ui: dist/index.js')
        },
      }

      await expect(executeHook('before:publish', config, false)).rejects.toThrow('before:publish hook failed: Published files missing after the build:\nmaz-ui: dist/index.js')
    })

    it('Then the error of a command names the hook, and a cancellation is kept', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      const cancel = new RelizyCancelError('Cancelled')
      config.hooks = {
        'before:publish': 'pnpm build',
        'before:bump': () => Promise.reject(cancel),
      }
      vi.mocked(execPromise).mockRejectedValueOnce('build failed')

      await expect(executeHook('before:publish', config, false)).rejects.toThrow('before:publish hook failed: build failed')
      await expect(executeHook('before:bump', config, false)).rejects.toBe(cancel)
    })
  })

  describe('When hook is a function', () => {
    it('Then executes function hook and returns result', async () => {
      const hookFn = vi.fn().mockResolvedValue('hook-result')
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      config.hooks = { 'before:bump': hookFn }

      const result = await executeHook('before:bump', config, false)

      expect(hookFn).toHaveBeenCalledWith(config, false, undefined)
      expect(logger.info).toHaveBeenCalledWith('Executing hook before:bump')
      expect(logger.debug).toHaveBeenCalledWith('Hook before:bump returned: hook-result')
      expect(logger.info).toHaveBeenCalledWith('Hook before:bump executed')
      expect(result).toBe('hook-result')
    })

    it('Then executes function hook with params', async () => {
      const hookFn = vi.fn().mockResolvedValue(null)
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      config.hooks = { 'success:bump': hookFn }
      const params = { version: '1.0.1' }

      await executeHook('success:bump', config, true, params)

      expect(hookFn).toHaveBeenCalledWith(config, true, params)
    })

    it('Then does not log debug when hook returns falsy value', async () => {
      const hookFn = vi.fn().mockResolvedValue(null)
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      config.hooks = { 'before:changelog': hookFn }

      await executeHook('before:changelog', config, false)

      expect(logger.debug).not.toHaveBeenCalledWith(expect.stringContaining('returned'))
    })
  })

  describe('When hook is a string command', () => {
    it('Then executes string command and returns result', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: 'command-output', stderr: '' })
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      config.hooks = { 'before:publish': 'echo "test"' }

      const result = await executeHook('before:publish', config, false)

      expect(execPromise).toHaveBeenCalledWith('echo "test"', {
        logLevel: config.logLevel,
        cwd: config.cwd,
        noStderr: true,
        noStdout: true,
      })
      expect(logger.info).toHaveBeenCalledWith('Executing hook before:publish')
      expect(logger.debug).toHaveBeenCalledWith('Hook before:publish returned: {"stdout":"command-output","stderr":""}')
      expect(logger.info).toHaveBeenCalledWith('Hook before:publish executed')
      expect(result).toEqual({ stdout: 'command-output', stderr: '' })
    })

    it('Then executes string command in dry run mode', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      config.hooks = { 'success:release': 'npm run deploy' }

      await executeHook('success:release', config, false)

      expect(execPromise).toHaveBeenCalled()
    })

    it('Then logs debug when command returns empty string', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      config.hooks = { 'before:changelog': 'ls' }

      await executeHook('before:changelog', config, false)

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('returned'))
    })
  })
})

describe('Given executeBuildCmd function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When buildCmd is configured', () => {
    it('Then executes build command successfully', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: { buildCmd: 'npm run build', args: [], safetyCheck: false },
      })

      await executeBuildCmd({ config, dryRun: false })

      expect(logger.info).toHaveBeenCalledWith('Running build command')
      expect(logger.debug).toHaveBeenCalledWith('Running build command: npm run build')
      expect(execPromise).toHaveBeenCalledWith('npm run build', {
        noStderr: true,
        noStdout: true,
        logLevel: config.logLevel,
        cwd: config.cwd,
      })
      expect(logger.info).toHaveBeenCalledWith('Build completed')
    })

    it('Then skips execution in dry run mode', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: { buildCmd: 'pnpm build', args: [], safetyCheck: false },
      })

      await executeBuildCmd({ config, dryRun: true })

      expect(logger.info).toHaveBeenCalledWith('[dry-run] exec build command: ', 'pnpm build')
      expect(execPromise).not.toHaveBeenCalled()
    })

    it('Then throws error when build command fails', async () => {
      vi.mocked(execPromise).mockRejectedValue(new Error('Build failed'))
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: { buildCmd: 'npm run build', args: [], safetyCheck: false },
      })

      await expect(executeBuildCmd({ config, dryRun: false })).rejects.toThrow()
    })
  })

  describe('When buildCmd is not configured', () => {
    it('Then logs debug message and returns', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: { buildCmd: '', args: [], safetyCheck: false },
      })

      await executeBuildCmd({ config, dryRun: false })

      expect(logger.debug).toHaveBeenCalledWith('No build command specified')
      expect(execPromise).not.toHaveBeenCalled()
    })
  })
})

describe('Given getPackagesOrBumpedPackages function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When bumpResult has bumpedPackages', () => {
    it('Then returns bumped packages from bumpResult', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      const bumpedPackages = [
        {
          ...createMockPackageInfo({ name: 'pkg-a', newVersion: '1.0.1' }),
          oldVersion: '1.0.0',
        },
        {
          ...createMockPackageInfo({ name: 'pkg-b', newVersion: '2.0.1' }),
          oldVersion: '2.0.0',
        },
      ]
      const bumpResult = {
        bumpedPackages,
        detectedReleaseType: 'patch' as const,
        oldVersion: '1.0.0',
        newVersion: '1.0.1',
        bumped: true as const,
      }

      const result = await getPackagesOrBumpedPackages({
        config,
        bumpResult,
        suffix: undefined,
        force: false,
      })

      expect(result).toEqual(bumpedPackages)
    })

    it('Then does not call getPackages when bumpResult has packages', async () => {
      const { getPackages } = await import('../repo')
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      const bumpedPackages = [
        {
          ...createMockPackageInfo(),
          oldVersion: '1.0.0',
        },
      ]
      const bumpResult = {
        bumpedPackages,
        detectedReleaseType: 'patch' as const,
        oldVersion: '1.0.0',
        newVersion: '1.0.1',
        bumped: true as const,
      }

      await getPackagesOrBumpedPackages({
        config,
        bumpResult,
        suffix: undefined,
        force: false,
      })

      expect(getPackages).not.toHaveBeenCalled()
    })
  })

  describe('When bumpResult is undefined', () => {
    it('Then calls getPackages and returns all packages', async () => {
      const { getPackages } = await import('../repo')
      const config = createMockConfig({
        bump: { type: 'patch' },
      })

      const result = await getPackagesOrBumpedPackages({
        config,
        bumpResult: undefined,
        suffix: undefined,
        force: false,
      })

      expect(getPackages).toHaveBeenCalledWith({
        config,
        suffix: undefined,
        force: false,
        dryRun: false,
      })
      expect(result).toEqual([
        { name: 'pkg-a', version: '1.0.0' },
        { name: 'pkg-b', version: '2.0.0' },
      ])
    })

    it('Then calls getPackages with suffix parameter', async () => {
      const { getPackages } = await import('../repo')
      const config = createMockConfig({
        bump: { type: 'patch' },
      })

      await getPackagesOrBumpedPackages({
        config,
        bumpResult: undefined,
        suffix: 'beta',
        force: true,
      })

      expect(getPackages).toHaveBeenCalledWith({
        config,
        suffix: 'beta',
        force: true,
        dryRun: false,
      })
    })
  })

  describe('When bumpResult has empty bumpedPackages array', () => {
    it('Then calls getPackages instead', async () => {
      const { getPackages } = await import('../repo')
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      const bumpResult = {
        bumpedPackages: [],
        detectedReleaseType: 'patch' as const,
        oldVersion: '1.0.0',
        newVersion: '1.0.1',
        bumped: true as const,
      }

      await getPackagesOrBumpedPackages({
        config,
        bumpResult,
        suffix: undefined,
        force: false,
      })

      expect(getPackages).toHaveBeenCalled()
    })
  })
})

describe('Given getHookContext function', () => {
  it('Then is undefined without bump result', () => {
    expect(getHookContext(createMockConfig({
      bump: { type: 'release' },
    }), undefined)).toBeUndefined()
  })

  it('Then gives the bump result and the overview of the release', () => {
    const config = createMockConfig({
      bump: { type: 'release' },
      projectName: 'my-lib',
      monorepo: { versionMode: 'unified' },
    })
    const bumpResult = {
      bumped: true as const,
      newVersion: '2.0.0',
      oldVersion: '1.0.0',
      bumpedPackages: [],
    }

    expect(getHookContext(config, bumpResult)).toEqual({
      bumpResult,
      release: {
        projectName: 'my-lib',
        groups: [
          expect.objectContaining({ versionMode: 'unified', version: '2.0.0', tag: 'v2.0.0' }),
        ],
      },
    })
  })
})
