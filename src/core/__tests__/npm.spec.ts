import type { PackageBase } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import { existsSync, readFileSync } from 'node:fs'
import path, { join } from 'node:path'
import process from 'node:process'
import { input } from '@inquirer/prompts'
import { execPromise, logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import {
  detectPackageManager,
  determinePublishTag,
  getAuthCommand,
  getPackagesToPublishInIndependentMode,
  getPackagesToPublishInSelectiveMode,
  publishPackage,
} from '../npm'
import { getIndependentTag, resolveTags } from '../tags'
import { isInCI } from '../utils'
import { isPrerelease } from '../version'

vi.mock('node:fs')
vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path')
  return {
    ...actual,
    join: vi.fn((...args) => args.join('/')),
    default: {
      ...(actual.default as any),
      join: vi.fn((...args) => args.join('/')),
    },
  }
})
// Remove the node:process mock - we'll spy on globalThis.process directly
vi.mock('@inquirer/prompts')
vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils')
  return {
    ...actual,
    isInCI: vi.fn(),
  }
})

vi.mock('../version', async () => {
  const actual = await vi.importActual('../version')
  return {
    ...actual,
    isPrerelease: vi.fn(),
  }
})

vi.mock('../tags')

describe('Given detectPackageManager function', () => {
  let cwdSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    cwdSpy = vi.spyOn(globalThis.process, 'cwd').mockReturnValue('/project')
    vi.mocked(join).mockImplementation((...args) => args.join('/'))
    delete globalThis.process.env.npm_config_user_agent
  })

  afterEach(() => {
    cwdSpy.mockRestore()
    delete globalThis.process.env.npm_config_user_agent
  })

  describe('When package.json has packageManager field', () => {
    it('Then detects pnpm from packageManager field', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        packageManager: 'pnpm@8.0.0',
      }))

      const result = detectPackageManager()

      expect(result).toBe('pnpm')
    })

    it('Then detects yarn from packageManager field', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        packageManager: 'yarn@3.0.0',
      }))

      const result = detectPackageManager()

      expect(result).toBe('yarn')
    })

    it('Then detects npm from packageManager field', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        packageManager: 'npm@9.0.0',
      }))

      const result = detectPackageManager()

      expect(result).toBe('npm')
    })

    it('Then detects bun from packageManager field', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        packageManager: 'bun@1.0.0',
      }))

      const result = detectPackageManager()

      expect(result).toBe('bun')
    })

    it('Then ignores invalid package manager names', () => {
      vi.mocked(existsSync).mockReturnValueOnce(true).mockReturnValueOnce(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        packageManager: 'invalid@1.0.0',
      }))

      const result = detectPackageManager()

      expect(result).not.toBe('invalid')
    })
  })

  describe('When detecting from lockfiles', () => {
    it('Then detects pnpm from pnpm-lock.yaml', () => {
      vi.mocked(existsSync).mockImplementation((p: any) => {
        return p.includes('pnpm-lock.yaml')
      })
      vi.mocked(readFileSync).mockReturnValue('{}')

      const result = detectPackageManager()

      expect(result).toBe('pnpm')
    })

    it('Then detects yarn from yarn.lock', () => {
      vi.mocked(existsSync).mockImplementation((p: any) => {
        return p.includes('yarn.lock')
      })
      vi.mocked(readFileSync).mockReturnValue('{}')

      const result = detectPackageManager()

      expect(result).toBe('yarn')
    })

    it('Then detects npm from package-lock.json', () => {
      vi.mocked(existsSync).mockImplementation((p: any) => {
        return p.includes('package-lock.json')
      })
      vi.mocked(readFileSync).mockReturnValue('{}')

      const result = detectPackageManager()

      expect(result).toBe('npm')
    })

    it('Then detects bun from bun.lockb', () => {
      vi.mocked(existsSync).mockImplementation((p: any) => {
        return p.includes('bun.lockb')
      })
      vi.mocked(readFileSync).mockReturnValue('{}')

      const result = detectPackageManager()

      expect(result).toBe('bun')
    })

    it('Then prioritizes pnpm lockfile over others', () => {
      vi.mocked(existsSync).mockImplementation((p: any) => {
        return p.includes('pnpm-lock.yaml') || p.includes('yarn.lock')
      })
      vi.mocked(readFileSync).mockReturnValue('{}')

      const result = detectPackageManager()

      expect(result).toBe('pnpm')
    })
  })

  describe('When detecting from user agent', () => {
    it('Then detects pnpm from npm_config_user_agent', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      globalThis.process.env.npm_config_user_agent = 'pnpm/8.0.0 npm/? node/v18.0.0'

      const result = detectPackageManager()

      expect(result).toBe('pnpm')
    })

    it('Then detects yarn from npm_config_user_agent', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      globalThis.process.env.npm_config_user_agent = 'yarn/3.0.0 npm/? node/v18.0.0'

      const result = detectPackageManager()

      expect(result).toBe('yarn')
    })

    it('Then detects npm from npm_config_user_agent', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      globalThis.process.env.npm_config_user_agent = 'npm/9.0.0 node/v18.0.0'

      const result = detectPackageManager()

      expect(result).toBe('npm')
    })

    it('Then detects bun from npm_config_user_agent', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      globalThis.process.env.npm_config_user_agent = 'bun/1.0.0'

      const result = detectPackageManager()

      expect(result).toBe('bun')
    })
  })

  describe('When no package manager detected', () => {
    it('Then defaults to npm', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = detectPackageManager()

      expect(result).toBe('npm')
    })

    it('Then logs debug message when defaulting', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const loggerSpy = vi.spyOn(logger, 'debug')

      detectPackageManager()

      expect(loggerSpy).toHaveBeenCalledWith('No package manager detected, defaulting to npm')
    })
  })

  describe('When using custom cwd', () => {
    it('Then uses provided cwd path', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      detectPackageManager('/custom/path')

      expect(join).toHaveBeenCalledWith('/custom/path', 'package.json')
    })
  })

  describe('When errors occur', () => {
    it('Then catches and logs errors', () => {
      vi.mocked(existsSync).mockImplementation(() => {
        throw new Error('File system error')
      })
      const loggerSpy = vi.spyOn(logger, 'fail')

      const result = detectPackageManager()

      expect(result).toBe('npm')
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error detecting package manager'),
      )
    })

    it('Then handles JSON parse errors gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('invalid json')
      const loggerSpy = vi.spyOn(logger, 'debug')

      detectPackageManager()

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse package.json'),
      )
    })
  })
})

describe('Given determinePublishTag function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When version is stable', () => {
    it('Then returns latest tag by default', () => {
      vi.mocked(isPrerelease).mockReturnValue(false)

      const result = determinePublishTag('1.0.0')

      expect(result).toBe('latest')
    })

    it('Then returns config tag when provided', () => {
      vi.mocked(isPrerelease).mockReturnValue(false)

      const result = determinePublishTag('1.0.0', 'stable')

      expect(result).toBe('stable')
    })
  })

  describe('When version is prerelease', () => {
    it('Then returns next tag by default', () => {
      vi.mocked(isPrerelease).mockReturnValue(true)
      const loggerSpy = vi.spyOn(logger, 'warn')

      const result = determinePublishTag('1.0.0-beta.1')

      expect(result).toBe('next')
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('prerelease'),
      )
    })

    it('Then uses config tag when provided', () => {
      vi.mocked(isPrerelease).mockReturnValue(true)

      const result = determinePublishTag('1.0.0-alpha.1', 'canary')

      expect(result).toBe('canary')
    })

    it('Then warns when publishing prerelease with latest tag', () => {
      vi.mocked(isPrerelease).mockReturnValue(true)
      const loggerSpy = vi.spyOn(logger, 'warn')

      determinePublishTag('1.0.0-beta.1', 'latest')

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('about to publish a "prerelease" version with the "latest" tag'),
      )
    })

    it('Then returns latest when explicitly specified for prerelease', () => {
      vi.mocked(isPrerelease).mockReturnValue(true)

      const result = determinePublishTag('1.0.0-beta.1', 'latest')

      expect(result).toBe('latest')
    })
  })
})

describe('Given getPackagesToPublishInSelectiveMode function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(join).mockImplementation((...args) => args.join('/'))
  })

  describe('When filtering by root version', () => {
    it('Then returns packages matching root version', () => {
      const packages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', path: '/packages/a', version: '1.0.0' },
        { ...createMockPackageInfo(), name: 'pkg-b', path: '/packages/b', version: '1.0.0' },
        { ...createMockPackageInfo(), name: 'pkg-c', path: '/packages/c', version: '0.9.0' },
      ]
      vi.mocked(readFileSync)
        .mockReturnValueOnce(JSON.stringify({ version: '1.0.0' }))
        .mockReturnValueOnce(JSON.stringify({ version: '1.0.0' }))
        .mockReturnValueOnce(JSON.stringify({ version: '0.9.0' }))

      const result = getPackagesToPublishInSelectiveMode(packages, '1.0.0')

      expect(result).toHaveLength(2)
      expect(result.map(p => p.name)).toEqual(['pkg-a', 'pkg-b'])
    })

    it('Then returns empty array when no packages match', () => {
      const packages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', path: '/packages/a', version: '0.9.0' },
      ]
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: '0.9.0' }))

      const result = getPackagesToPublishInSelectiveMode(packages, '1.0.0')

      expect(result).toHaveLength(0)
    })

    it('Then handles all packages matching', () => {
      const packages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', path: '/packages/a', version: '2.0.0' },
        { ...createMockPackageInfo(), name: 'pkg-b', path: '/packages/b', version: '2.0.0' },
      ]
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: '2.0.0' }))

      const result = getPackagesToPublishInSelectiveMode(packages, '2.0.0')

      expect(result).toHaveLength(2)
    })
  })

  describe('When root version is undefined', () => {
    it('Then returns empty array', () => {
      const packages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', path: '/packages/a', version: '1.0.0' },
      ]
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: '1.0.0' }))

      const result = getPackagesToPublishInSelectiveMode(packages, undefined)

      expect(result).toHaveLength(0)
    })
  })
})

describe('Given getPackagesToPublishInIndependentMode function', () => {
  let config: ResolvedRelizyConfig

  beforeEach(() => {
    vi.clearAllMocks()
    config = createMockConfig({ bump: { type: 'patch' } })
    vi.mocked(resolveTags).mockResolvedValue({ from: 'v1.0.0', to: 'v1.1.0' })
  })

  describe('When filtering packages with commits', () => {
    it('Then returns packages with commits', async () => {
      const packages: PackageBase[] = [
        {
          ...createMockPackageInfo(),
          name: 'pkg-a',
          path: '/packages/a',
          version: '1.0.0',
          commits: [{ message: 'commit 1' } as any],
        },
        {
          ...createMockPackageInfo(),
          name: 'pkg-b',
          path: '/packages/b',
          version: '1.0.0',
          commits: [],
        },
      ]

      const result = await getPackagesToPublishInIndependentMode(packages, config)

      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('pkg-a')
    })

    it('Then excludes packages without commits', async () => {
      const packages: PackageBase[] = [
        {
          ...createMockPackageInfo(),
          name: 'pkg-a',
          path: '/packages/a',
          version: '1.0.0',
          commits: [],
        },
      ]

      const result = await getPackagesToPublishInIndependentMode(packages, config)

      expect(result).toHaveLength(0)
    })

    it('Then uses newVersion when available', async () => {
      const packages: PackageBase[] = [
        {
          ...createMockPackageInfo(),
          name: 'pkg-a',
          path: '/packages/a',
          version: '1.0.0',
          newVersion: '1.1.0',
          commits: [{ message: 'commit' } as any],
        },
      ]

      await getPackagesToPublishInIndependentMode(packages, config)

      expect(resolveTags).toHaveBeenCalledWith(
        expect.objectContaining({
          newVersion: '1.1.0',
        }),
      )
    })

    it('Then falls back to version when no newVersion', async () => {
      const packages: PackageBase[] = [
        {
          ...createMockPackageInfo(),
          name: 'pkg-a',
          path: '/packages/a',
          version: '1.0.0',
          newVersion: undefined,
          commits: [{ message: 'commit' } as any],
        },
      ]

      await getPackagesToPublishInIndependentMode(packages, config)

      expect(resolveTags).toHaveBeenCalledWith(
        expect.objectContaining({
          newVersion: '1.0.0',
        }),
      )
    })

    it('Then logs debug info for packages with commits', async () => {
      const packages: PackageBase[] = [
        {
          ...createMockPackageInfo(),
          name: 'pkg-a',
          path: '/packages/a',
          version: '1.0.0',
          commits: [{ message: 'c1' } as any, { message: 'c2' } as any],
        },
      ]
      const loggerSpy = vi.spyOn(logger, 'debug')

      await getPackagesToPublishInIndependentMode(packages, config)

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('pkg-a: 2 commit(s)'),
      )
    })
  })
})

describe('Given getAuthCommand function', () => {
  let config: ResolvedRelizyConfig

  beforeEach(() => {
    vi.clearAllMocks()
    config = createMockConfig({ bump: { type: 'patch' } })
    config.publish = { private: false, args: [], safetyCheck: false }
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'))
    vi.mocked(existsSync).mockReturnValue(false)
  })

  describe('When building auth command', () => {
    it('Then builds basic whoami command', () => {
      const result = getAuthCommand({ packageManager: 'npm', config })

      expect(result).toBe('npm whoami')
    })

    it('Then includes registry when specified', () => {
      config.publish.registry = 'https://registry.npmjs.org/'

      const result = getAuthCommand({ packageManager: 'npm', config })

      expect(result).toContain('--registry https://registry.npmjs.org/')
    })

    it('Then includes OTP when provided', () => {
      const result = getAuthCommand({
        packageManager: 'npm',
        config,
        otp: '123456',
      })

      expect(result).toContain('--otp 123456')
    })

    it('Then builds command for different package managers', () => {
      expect(getAuthCommand({ packageManager: 'pnpm', config })).toContain('pnpm')
      expect(getAuthCommand({ packageManager: 'yarn', config })).toContain('yarn')
      expect(getAuthCommand({ packageManager: 'bun', config })).toContain('bun')
    })
  })

  describe('When using publish token', () => {
    it('Then includes auth token for npm with registry', () => {
      config.publish.registry = 'https://registry.example.com/npm/'
      config.publish.token = 'secret-token'

      const result = getAuthCommand({ packageManager: 'npm', config })

      expect(result).toContain('//registry.example.com/npm/:_authToken=secret-token')
    })

    it('Then includes auth token for pnpm with registry', () => {
      config.publish.registry = 'https://registry.example.com/'
      config.publish.token = 'token123'

      const result = getAuthCommand({ packageManager: 'pnpm', config })

      expect(result).toContain('//registry.example.com/:_authToken=token123')
    })

    it('Then warns when token provided without registry', () => {
      config.publish.token = 'token123'
      const loggerSpy = vi.spyOn(logger, 'warn')

      getAuthCommand({ packageManager: 'npm', config })

      expect(loggerSpy).toHaveBeenCalledWith(
        'Publish token provided but no registry specified',
      )
    })

    it('Then warns when token used with yarn', () => {
      config.publish.registry = 'https://registry.example.com/'
      config.publish.token = 'token123'
      const loggerSpy = vi.spyOn(logger, 'warn')

      getAuthCommand({ packageManager: 'yarn', config })

      expect(loggerSpy).toHaveBeenCalledWith(
        'Publish token only supported for pnpm and npm',
      )
    })
  })
})

describe('Given publishPackage function', () => {
  let config: ResolvedRelizyConfig
  let pkg: PackageBase
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let chdirSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    config = createMockConfig({ bump: { type: 'patch' } })
    config.cwd = '/project'
    config.publish = { private: false, args: [], safetyCheck: false }
    pkg = {
      ...createMockPackageInfo(),
      name: 'test-package',
      path: '/packages/test',
      version: '1.0.0',
      newVersion: '1.0.1',
    }

    cwdSpy = vi.spyOn(globalThis.process, 'cwd').mockReturnValue('/project')
    chdirSpy = vi.spyOn(globalThis.process, 'chdir').mockImplementation(() => {})
    vi.mocked(isPrerelease).mockReturnValue(false)
    vi.mocked(getIndependentTag).mockReturnValue('test-package@1.0.1')
    vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'))
    vi.mocked(existsSync).mockReturnValue(false)
  })

  afterEach(() => {
    cwdSpy.mockRestore()
    chdirSpy.mockRestore()
  })

  describe('When publishing successfully', () => {
    it('Then publishes package with correct tag', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('publish'),
        expect.any(Object),
      )
    })

    it('Then changes to package directory', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(chdirSpy).toHaveBeenCalledWith('/packages/test')
    })

    it('Then restores original directory', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(chdirSpy).toHaveBeenCalledWith('/project')
    })

    it('Then logs publish start and completion', async () => {
      const loggerInfoSpy = vi.spyOn(logger, 'info')
      const loggerDebugSpy = vi.spyOn(logger, 'debug')

      await publishPackage({
        pkg,
        config,
        packageManager: 'yarn',
        dryRun: false,
      })

      expect(loggerInfoSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('Publishing test-package@1.0.1'),
      )
      expect(loggerDebugSpy).toHaveBeenNthCalledWith(
        2,
        'Publish stdout:',
        '',
      )
      expect(loggerDebugSpy).toHaveBeenNthCalledWith(
        3,
        'Publish stderr:',
        '',
      )
    })
  })

  describe('When running in dry-run mode', () => {
    describe('And using yarn', () => {
      it('Then logs dry-run messages', async () => {
        const loggerSpy = vi.spyOn(logger, 'info')

        await publishPackage({
          pkg,
          config,
          packageManager: 'yarn',
          dryRun: true,
        })

        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('[dry-run]'),
        )
        expect(execPromise).not.toHaveBeenCalled()
      })
    })

    describe('And using npm', () => {
      it('Then logs dry-run messages', async () => {
        const loggerSpy = vi.spyOn(logger, 'info')

        await publishPackage({
          pkg,
          config,
          packageManager: 'npm',
          dryRun: true,
        })

        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('[dry-run]'),
        )
        expect(execPromise).toHaveBeenCalledWith(
          'npm publish --tag latest --yes --dry-run',
          expect.anything(),
        )
      })
    })

    describe('And using pnpm', () => {
      it('Then logs dry-run messages', async () => {
        const loggerSpy = vi.spyOn(logger, 'info')

        await publishPackage({
          pkg,
          config,
          packageManager: 'pnpm',
          dryRun: true,
        })

        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('[dry-run]'),
        )
        expect(execPromise).toHaveBeenCalledWith(
          'pnpm publish --tag latest --no-git-checks --dry-run',
          expect.anything(),
        )
      })
    })

    describe('And using bun', () => {
      it('Then logs dry-run messages', async () => {
        const loggerSpy = vi.spyOn(logger, 'info')

        await publishPackage({
          pkg,
          config,
          packageManager: 'bun',
          dryRun: true,
        })

        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('[dry-run]'),
        )
        expect(execPromise).not.toHaveBeenCalled()
      })
    })

    it('Then does not execute publish command when using yarn', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'yarn',
        dryRun: true,
      })

      expect(execPromise).not.toHaveBeenCalled()
    })

    it('Then does not execute publish command when using bun', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'bun',
        dryRun: true,
      })

      expect(execPromise).not.toHaveBeenCalled()
    })

    it('Then does not execute publish command when using pnpm', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: true,
      })

      expect(execPromise).toHaveBeenCalledWith(expect.stringContaining('--dry-run'), expect.any(Object))
    })

    it('Then does not execute publish command when using npm', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: true,
      })

      expect(execPromise).toHaveBeenCalledWith(expect.stringContaining('--dry-run'), expect.any(Object))
    })
  })

  describe('When OTP error occurs', () => {
    it('Then retries with OTP in non-CI environment', async () => {
      vi.mocked(isInCI).mockReturnValue(false)
      vi.mocked(input).mockResolvedValue('123456')
      vi.mocked(execPromise)
        .mockRejectedValueOnce(new Error('OTP required'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(input).toHaveBeenCalled()
      expect(execPromise).toHaveBeenCalledTimes(2)
    })

    it('Then throws error in CI environment', async () => {
      vi.mocked(isInCI).mockReturnValue(true)
      vi.mocked(execPromise).mockRejectedValue(new Error('OTP required'))

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })).rejects.toThrow('OTP required in CI environment')
    })

    it('Then handles EOTP error code', async () => {
      vi.mocked(isInCI).mockReturnValue(false)
      vi.mocked(input).mockResolvedValue('123456')
      vi.mocked(execPromise)
        .mockRejectedValueOnce(new Error('Error EOTP'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(input).toHaveBeenCalled()
    })

    it('Then handles one-time password error message', async () => {
      vi.mocked(isInCI).mockReturnValue(false)
      vi.mocked(input).mockResolvedValue('123456')
      vi.mocked(execPromise)
        .mockRejectedValueOnce(new Error('One-time password required'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(input).toHaveBeenCalled()
    })
  })

  describe('When publish fails', () => {
    it('Then throws error and logs failure', async () => {
      const error = new Error('Publish failed')
      vi.mocked(execPromise).mockRejectedValue(error)
      const loggerSpy = vi.spyOn(logger, 'error')

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })).rejects.toThrow('Publish failed')

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to publish'),
        error,
      )
    })

    it('Then restores directory even on error', async () => {
      vi.mocked(execPromise).mockRejectedValue(new Error('Failed'))

      try {
        await publishPackage({
          pkg,
          config,
          packageManager: 'npm',
          dryRun: false,
        })
      }
      catch {
        // Expected
      }

      expect(process.chdir).toHaveBeenCalledWith('/project')
    })
  })

  describe('When using prerelease version', () => {
    it('Then uses next tag for prerelease', async () => {
      pkg.newVersion = '1.0.0-beta.1'
      vi.mocked(isPrerelease).mockReturnValue(true)

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('--tag next'),
        expect.any(Object),
      )
    })
  })

  describe('When using different package managers', () => {
    it('Then builds pnpm publish command', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('pnpm publish'),
        expect.any(Object),
      )
    })

    it('Then builds yarn publish command', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'yarn',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('yarn publish'),
        expect.any(Object),
      )
    })

    it('Then includes no-git-checks for pnpm', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('--no-git-checks'),
        expect.any(Object),
      )
    })

    it('Then includes non-interactive for yarn', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'yarn',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('--non-interactive'),
        expect.any(Object),
      )
    })

    it('Then includes yes flag for npm', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('--yes'),
        expect.any(Object),
      )
    })
  })
})
