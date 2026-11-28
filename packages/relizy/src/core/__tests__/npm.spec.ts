import type { PackageBase } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path, { join } from 'node:path'
import process from 'node:process'
import { execPromise, logger } from '@maz-ui/node'
import { getIndependentTag, isInCI, isPrerelease, packAndUpload, withGitCache } from '@relizy/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { RelizyCancelError } from '../errors'
import { runWithEvents } from '../events'
import { determinePublishTag, getAuthCommand, publishPackage } from '../npm'
import { detectPackageManager, getNpmRegistry, resolveRegistryTargetsForPackage, withRegistryNpmrc } from '../npm-registry'
import { askText } from '../prompts'
import { getAlreadyStagedVersions, getStagedVersions, markStagedExplicit } from '../staging'
import { recordPublishedPackage } from '../step-data'

vi.mock('node:child_process')
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
vi.mock('../prompts')
vi.mock('../../../../core/src/ci-env', async () => {
  const actual = await vi.importActual('../../../../core/src/ci-env')
  return {
    ...actual,
    isInCI: vi.fn(),
  }
})

vi.mock('@relizy/core', async (importActual) => {
  const actual = await importActual<typeof import('@relizy/core')>()
  return {
    ...actual,
    isPrerelease: vi.fn(),
    getIndependentTag: vi.fn(),
    packAndUpload: vi.fn(),
  }
})

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
    it.each([
      ['pnpm', 'pnpm@8.0.0'],
      ['yarn', 'yarn@3.0.0'],
      ['npm', 'npm@9.0.0'],
      ['bun', 'bun@1.0.0'],
    ])('Then detects %s from packageManager field', (expected, field) => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ packageManager: field }))

      const result = detectPackageManager()

      expect(result).toBe(expected)
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
    it.each([
      ['pnpm', 'pnpm-lock.yaml'],
      ['yarn', 'yarn.lock'],
      ['npm', 'package-lock.json'],
      ['bun', 'bun.lockb'],
    ])('Then detects %s from %s', (expected, lockfile) => {
      vi.mocked(existsSync).mockImplementation((p: any) => p.includes(lockfile))
      vi.mocked(readFileSync).mockReturnValue('{}')

      const result = detectPackageManager()

      expect(result).toBe(expected)
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
    it.each([
      ['pnpm', 'pnpm/8.0.0 npm/? node/v18.0.0'],
      ['yarn', 'yarn/3.0.0 npm/? node/v18.0.0'],
      ['npm', 'npm/9.0.0 node/v18.0.0'],
      ['bun', 'bun/1.0.0'],
    ])('Then detects %s from npm_config_user_agent', (expected, userAgent) => {
      vi.mocked(existsSync).mockReturnValue(false)
      globalThis.process.env.npm_config_user_agent = userAgent

      const result = detectPackageManager()

      expect(result).toBe(expected)
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

describe('Given getAuthCommand function', () => {
  let config: ResolvedRelizyConfig

  beforeEach(() => {
    vi.clearAllMocks()
    config = createMockConfig({
      bump: { type: 'patch' },
      publish: { args: [], safetyCheck: false },
    })
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'))
    vi.mocked(existsSync).mockReturnValue(false)
  })

  describe('When building auth command', () => {
    it('Then builds basic whoami command', () => {
      const result = getAuthCommand({ packageManager: 'npm', config })

      expect(result).toBe('npm whoami')
    })

    it('Then leaves out the arguments of publish.args', () => {
      config.publish.args = ['--provenance']

      expect(getAuthCommand({ packageManager: 'npm', config })).toBe('npm whoami')
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

  describe('When a publish token is configured', () => {
    it('Then never puts the auth token in the command (it is injected via .npmrc)', () => {
      config.publish.registry = 'https://registry.example.com/npm/'
      config.tokens.registry = 'secret-token'

      const result = getAuthCommand({ packageManager: 'npm', config })

      // pnpm 12+ rejects `--//host:_authToken=` as an unexpected argument, so
      // the token must never be a CLI flag - it goes through withRegistryNpmrc.
      expect(result).toBe('npm whoami --registry https://registry.example.com/npm/')
      expect(result).not.toContain('secret-token')
      expect(result).not.toContain('_authToken')
    })
  })
})

describe('Given withRegistryNpmrc function', () => {
  const config = createMockConfig({
    cwd: '/project',
    bump: { type: 'patch' },
    publish: { args: [] },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'))
    vi.mocked(writeFileSync).mockReset()
    vi.mocked(rmSync).mockReset()
  })

  describe('When a token is configured and the file does not exist', () => {
    it('Then writes the auth token to .npmrc, runs fn, then removes the file it created', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      let contentDuringFn: string | undefined
      vi.mocked(writeFileSync).mockImplementation((_path, content) => {
        contentDuringFn = content as string
      })

      const result = await withRegistryNpmrc({
        config,
        registryTarget: { name: 'nexus', registry: 'https://nexus.internal/repo/', token: 'tok-123' },
        packageManager: 'pnpm',
        fn: () => Promise.resolve('done'),
      })

      expect(result).toBe('done')
      expect(contentDuringFn).toContain('//nexus.internal/repo/:_authToken=tok-123')
      expect(rmSync).toHaveBeenCalledWith('/project/.npmrc', { force: true })
    })
  })

  describe('When the process stops while the token is on disk', () => {
    const target = { name: 'npm', registry: 'https://registry.npmjs.org/', token: 'npm_secret' }

    it('Then removes the .npmrc it created on exit (process.exit)', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      await withRegistryNpmrc({
        config,
        registryTarget: target,
        packageManager: 'npm',
        fn: () => {
          process.emit('exit', 0)
          expect(rmSync).toHaveBeenCalledWith('/project/.npmrc', { force: true })
          return Promise.resolve()
        },
      })

      // Once
      expect(rmSync).toHaveBeenCalledTimes(1)
    })

    it('Then restores the original .npmrc on a signal (Ctrl+C, kill), then lets the signal stop the process', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('legacy-peer-deps=true\n' as any)
      const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)

      await withRegistryNpmrc({
        config,
        registryTarget: target,
        packageManager: 'npm',
        fn: () => {
          process.emit('SIGINT', 'SIGINT')
          return Promise.resolve()
        },
      })

      expect(writeFileSync).toHaveBeenLastCalledWith('/project/.npmrc', 'legacy-peer-deps=true\n')
      expect(kill).toHaveBeenCalledWith(process.pid, 'SIGINT')
      kill.mockRestore()
    })

    it('Then leaves no listener once done', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const listeners = () => ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP'].map(event => process.listenerCount(event))
      const before = listeners()

      await withRegistryNpmrc({
        config,
        registryTarget: target,
        packageManager: 'npm',
        fn: () => Promise.resolve(),
      })
      await withRegistryNpmrc({
        config,
        registryTarget: target,
        packageManager: 'npm',
        fn: () => Promise.reject(new Error('E403')),
      }).catch(() => {})

      expect(listeners()).toEqual(before)
    })
  })

  describe('When publishing a scoped package', () => {
    it('Then writes both the scope registry override and the auth token', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      let content = ''
      vi.mocked(writeFileSync).mockImplementation((_path, c) => {
        content = c as string
      })

      await withRegistryNpmrc({
        config,
        registryTarget: { name: 'jfrog', registry: 'https://jfrog.internal/repo/', token: 't' },
        packageName: '@accor/foo',
        packageManager: 'pnpm',
        fn: () => Promise.resolve(undefined),
      })

      expect(content).toContain('@accor:registry=https://jfrog.internal/repo/')
      expect(content).toContain('//jfrog.internal/repo/:_authToken=t')
    })
  })

  describe('When a .npmrc already exists', () => {
    it('Then preserves unrelated user lines, overrides only managed keys, and restores the original afterwards', async () => {
      const original = 'legacy-peer-deps=true\n@accor:registry=https://old.internal/\n'
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(original as any)
      const writes: string[] = []
      vi.mocked(writeFileSync).mockImplementation((_path, c) => {
        writes.push(c as string)
      })

      await withRegistryNpmrc({
        config,
        registryTarget: { name: 'jfrog', registry: 'https://jfrog.internal/repo/' },
        packageName: '@accor/foo',
        packageManager: 'pnpm',
        fn: () => Promise.resolve(undefined),
      })

      // During fn: unrelated line kept, @accor:registry overridden to the target.
      expect(writes[0]).toContain('legacy-peer-deps=true')
      expect(writes[0]).toContain('@accor:registry=https://jfrog.internal/repo/')
      expect(writes[0]).not.toContain('old.internal')
      // Afterwards: restored to the exact original content, file not removed.
      expect(writes[writes.length - 1]).toBe(original)
      expect(rmSync).not.toHaveBeenCalled()
    })

    it('Then restores the original .npmrc even when fn throws', async () => {
      const original = 'registry=https://user.internal/\n'
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(original as any)
      const writes: string[] = []
      vi.mocked(writeFileSync).mockImplementation((_path, c) => {
        writes.push(c as string)
      })

      await expect(withRegistryNpmrc({
        config,
        registryTarget: { name: 'nexus', registry: 'https://nexus.internal/repo/', token: 'tok' },
        packageManager: 'pnpm',
        fn: () => Promise.reject(new Error('publish failed')),
      })).rejects.toThrow('publish failed')

      expect(writes[writes.length - 1]).toBe(original)
    })
  })

  describe('When there is nothing to inject', () => {
    it('Then leaves the .npmrc untouched and runs fn as-is', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const fn = vi.fn().mockResolvedValue('ok')

      const result = await withRegistryNpmrc({
        config,
        // Unscoped package, no token: nothing for relizy to inject.
        registryTarget: { name: 'default', registry: 'https://registry.npmjs.org/' },
        packageManager: 'pnpm',
        fn,
      })

      expect(result).toBe('ok')
      expect(writeFileSync).not.toHaveBeenCalled()
      expect(rmSync).not.toHaveBeenCalled()
    })
  })

  describe('When the package manager does not read .npmrc (yarn)', () => {
    it('Then does not touch .npmrc and warns that the token is unsupported', async () => {
      const warnSpy = vi.spyOn(logger, 'warn')
      const fn = vi.fn().mockResolvedValue(undefined)

      await withRegistryNpmrc({
        config,
        registryTarget: { name: 'nexus', registry: 'https://nexus.internal/repo/', token: 'tok' },
        packageManager: 'yarn',
        fn,
      })

      expect(writeFileSync).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith('Publish token only supported for npm, pnpm and bun')
      expect(fn).toHaveBeenCalled()
    })
  })

  describe('When a token is provided without a registry', () => {
    it('Then warns and does not write .npmrc', async () => {
      const warnSpy = vi.spyOn(logger, 'warn')

      await withRegistryNpmrc({
        config,
        registryTarget: { name: 'x', registry: '', token: 'tok' },
        packageManager: 'pnpm',
        fn: () => Promise.resolve(undefined),
      })

      expect(warnSpy).toHaveBeenCalledWith('Publish token provided but no registry specified')
      expect(writeFileSync).not.toHaveBeenCalled()
    })
  })
})

describe('Given getNpmRegistry function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When npm config returns a registry', () => {
    it('Then returns it trimmed (e.g. a .npmrc proxy)', () => {
      vi.mocked(execSync).mockReturnValue('https://my-proxy.example/\n' as any)

      expect(getNpmRegistry('/project')).toBe('https://my-proxy.example/')
    })
  })

  describe('When npm config fails', () => {
    it('Then falls back to the public npm registry', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('npm not found')
      })

      expect(getNpmRegistry('/project')).toBe('https://registry.npmjs.org/')
    })
  })

  describe('When npm config returns an empty value', () => {
    it('Then falls back to the public npm registry', () => {
      vi.mocked(execSync).mockReturnValue('\n' as any)

      expect(getNpmRegistry('/project')).toBe('https://registry.npmjs.org/')
    })
  })
})

describe('Given resolveRegistryTargetsForPackage function', () => {
  let pkg: PackageBase

  beforeEach(() => {
    vi.clearAllMocks()
    pkg = {
      ...createMockPackageInfo(),
      name: 'test-package',
    }
  })

  describe('When only the legacy registry is configured', () => {
    it('Then returns a single target built from the legacy fields', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: { args: [], registry: 'https://registry.npmjs.org/', tag: 'latest' },
        tokens: { registry: 'legacy-token' },
      })

      const result = resolveRegistryTargetsForPackage(pkg, config)

      expect(result).toEqual([
        {
          name: 'default',
          registry: 'https://registry.npmjs.org/',
          token: 'legacy-token',
          tag: 'latest',
          access: undefined,
          otp: undefined,
        },
      ])
    })
  })

  describe('When an explicit registry has no packages filter', () => {
    it('Then mirrors it to every package alongside the legacy registry', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          args: [],
          registry: 'https://registry.npmjs.org/',
          registries: [
            { name: 'nexus', registry: 'https://nexus.internal/repo/', token: 'nexus-token' },
          ],
        },
      })

      const result = resolveRegistryTargetsForPackage(pkg, config)

      expect(result.map(t => t.name)).toEqual(['default', 'nexus'])
    })
  })

  describe('When an explicit registry is scoped with a packages glob', () => {
    it('Then includes it only for a package matching the pattern', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          args: [],
          registry: 'https://registry.npmjs.org/',
          registries: [
            {
              name: 'jfrog',
              registry: 'https://jfrog.internal/repo/',
              packageFilter: ['@scope/*'],
            },
          ],
        },
      })

      const scopedPkg = {
        ...createMockPackageInfo(),
        name: '@scope/foo',
      }

      const result = resolveRegistryTargetsForPackage(scopedPkg, config)

      expect(result.map(t => t.name)).toEqual(['default', 'jfrog'])
    })

    it('Then excludes it for a package not matching the pattern', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          args: [],
          registry: 'https://registry.npmjs.org/',
          registries: [
            {
              name: 'jfrog',
              registry: 'https://jfrog.internal/repo/',
              packageFilter: ['@scope/*'],
            },
          ],
        },
      })

      const result = resolveRegistryTargetsForPackage(pkg, config)

      expect(result.map(t => t.name)).toEqual(['default'])
    })
  })

  describe('When an explicit registry duplicates the legacy registry URL', () => {
    it('Then keeps only the first occurrence (legacy wins)', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          args: [],
          registry: 'https://registry.npmjs.org/',
          registries: [
            { name: 'duplicate', registry: 'https://registry.npmjs.org/' },
          ],
        },
      })

      const result = resolveRegistryTargetsForPackage(pkg, config)

      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('default')
    })

    it('Then still deduplicates when only the trailing slash differs', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          args: [],
          registry: 'https://registry.npmjs.org', // no trailing slash
          registries: [
            { name: 'duplicate', registry: 'https://registry.npmjs.org/' },
          ], // trailing slash
        },
      })

      const result = resolveRegistryTargetsForPackage(pkg, config)

      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('default')
    })
  })

  describe('When a matching registry is marked exclusive', () => {
    it('Then skips the default registry and publishes only to the matching registries', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          args: [],
          registry: 'https://registry.npmjs.org/',
          registries: [
            {
              name: 'jfrog',
              registry: 'https://jfrog.internal/repo/',
              packageFilter: ['@scope/*'],
              exclusive: true,
            },
          ],
        },
      })

      const scopedPkg = {
        ...createMockPackageInfo(),
        name: '@scope/foo',
      }

      const result = resolveRegistryTargetsForPackage(scopedPkg, config)

      expect(result.map(t => t.name)).toEqual(['jfrog'])
    })

    it('Then still publishes non-matching packages to the default registry', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          args: [],
          registry: 'https://registry.npmjs.org/',
          registries: [
            {
              name: 'jfrog',
              registry: 'https://jfrog.internal/repo/',
              packageFilter: ['@scope/*'],
              exclusive: true,
            },
          ],
        },
      })

      const result = resolveRegistryTargetsForPackage(pkg, config) // name: 'test-package'

      expect(result.map(t => t.name)).toEqual(['default'])
    })

    it('Then keeps a non-exclusive global mirror alongside an exclusive scoped registry', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          args: [],
          registry: 'https://registry.npmjs.org/',
          registries: [
            { name: 'nexus', registry: 'https://nexus.internal/repo/' },
            {
              name: 'jfrog',
              registry: 'https://jfrog.internal/repo/',
              packageFilter: ['@scope/*'],
              exclusive: true,
            },
          ],
        },
      })

      const scopedPkg = {
        ...createMockPackageInfo(),
        name: '@scope/foo',
      }

      const result = resolveRegistryTargetsForPackage(scopedPkg, config)

      // exclusive only suppresses the *default* registry, not other explicit mirrors.
      expect(result.map(t => t.name)).toEqual(['nexus', 'jfrog'])
    })
  })

  describe('When no default registry is configured but explicit registries are', () => {
    it('Then omits the empty legacy target and publishes only to the explicit registries', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          args: [],
          registries: [
            { name: 'nexus', registry: 'https://nexus.internal/repo/', token: 'nexus-token' },
            { name: 'jfrog', registry: 'https://jfrog.internal/repo/', token: 'jfrog-token' },
          ],
        },
      })

      const result = resolveRegistryTargetsForPackage(pkg, config)

      expect(result.map(t => t.name)).toEqual(['nexus', 'jfrog'])
      // No phantom target pointing at the ambient .npmrc registry.
      expect(result.some(t => t.registry === '')).toBe(false)
    })

    it('Then keeps the empty legacy target as the .npmrc fallback when no explicit registry covers the package', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          args: [],
          registries: [
            {
              name: 'jfrog',
              registry: 'https://jfrog.internal/repo/',
              packageFilter: ['@scope/*'],
            },
          ],
        },
      })

      vi.mocked(execSync).mockReturnValue('https://my-proxy.example/\n' as any)

      // pkg name is 'test-package', not matched by '@scope/*'.
      const result = resolveRegistryTargetsForPackage(pkg, config)

      expect(result.map(t => t.name)).toEqual(['default'])
      expect(result[0]?.registry).toBe('https://my-proxy.example/')
    })

    it('Then reads the .npmrc registry once per config', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          args: [],
          registries: [
            {
              name: 'jfrog',
              registry: 'https://jfrog.internal/repo/',
              packageFilter: ['@scope/*'],
            },
          ],
        },
      })

      vi.mocked(execSync).mockReturnValue('https://my-proxy.example/\n' as any)

      resolveRegistryTargetsForPackage(pkg, config)
      resolveRegistryTargetsForPackage({ ...pkg, name: 'other-package' }, config)

      expect(vi.mocked(execSync).mock.calls.filter(([command]) => command === 'npm config get registry')).toHaveLength(1)
    })
  })

  describe('When neither a default registry nor explicit registries are configured', () => {
    it('Then keeps the empty legacy target so the .npmrc-resolved registry is used', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: { args: [] },
      })

      const result = resolveRegistryTargetsForPackage(pkg, config)

      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('default')
      expect(result[0]?.registry).toBe('')
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
    config = createMockConfig({
      cwd: '/project',
      bump: { type: 'patch' },
      tokens: {
        gitlab: 'test-token',
      },
      repo: {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      },
      publish: { args: [], safetyCheck: false },
    })
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
    // clearAllMocks keeps mock implementations; reset the fs mocks so a
    // per-test implementation (e.g. the dry-run version-restore tests, or the
    // withRegistryNpmrc tests) does not leak into this suite. readFileSync must
    // return a valid package.json for the dry-run temp-version-write path.
    vi.mocked(writeFileSync).mockReset()
    vi.mocked(rmSync).mockReset()
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: 'test-package', version: '1.0.0' }))
    // The proactive existence check may fall back to a direct HTTP request when
    // `view` is inconclusive. Default it to inconclusive so tests exercising the
    // error-matching safety net keep their behavior; specific tests override it.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch not configured')))
  })

  afterEach(() => {
    cwdSpy.mockRestore()
    chdirSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  describe('When publishing without staging', () => {
    const GITHUB_OIDC = { GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.example', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token' }

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it.each([
      ['npm', false, 'npm publish --tag latest --registry https://registry.npmjs.org/ --access public --yes --provenance'],
      ['pnpm', false, 'pnpm publish --tag latest --registry https://registry.npmjs.org/ --access public --no-git-checks --provenance'],
      ['npm', true, 'npm publish --tag latest --registry https://registry.npmjs.org/ --access public --yes --provenance --dry-run'],
      ['pnpm', true, 'pnpm publish --tag latest --registry https://registry.npmjs.org/ --access public --no-git-checks --provenance --dry-run'],
      ['yarn', false, 'yarn publish --tag latest --registry https://registry.npmjs.org/ --access public --non-interactive --provenance'],
      ['bun', false, 'bun publish --tag latest --registry https://registry.npmjs.org/ --access public --provenance'],
    ] as const)('Then keeps the %s command (dry run: %s) and its options', async (packageManager, dryRun, command) => {
      config.publish = {
        ...config.publish,
        registry: 'https://registry.npmjs.org/',
        access: 'public',
        args: ['--provenance'],
      }

      await publishPackage({ pkg, config, packageManager, dryRun })

      expect(execPromise).toHaveBeenCalledTimes(1)
      expect(execPromise).toHaveBeenCalledWith(command, {
        noStderr: true,
        noStdout: true,
        noSuccess: true,
        noError: true,
        logLevel: config.logLevel,
        cwd: '/packages/test',
      })
    })

    it('Then still skips the command of yarn and bun in a dry run, also under trusted publishing', async () => {
      for (const [key, value] of Object.entries(GITHUB_OIDC)) {
        vi.stubEnv(key, value)
      }
      config.publish = { ...config.publish, registry: 'https://registry.npmjs.org/' }

      await publishPackage({
        pkg,
        config,
        packageManager: 'bun',
        dryRun: true,
      })
      await publishPackage({
        pkg,
        config,
        packageManager: 'yarn',
        dryRun: true,
      })

      expect(execPromise).not.toHaveBeenCalled()
    })

    it('Then keeps the native publish of bun and yarn classic with a token, even when an ID token is obtainable', async () => {
      for (const [key, value] of Object.entries(GITHUB_OIDC)) {
        vi.stubEnv(key, value)
      }
      config.publish = { ...config.publish, registry: 'https://registry.npmjs.org/' }
      config.tokens = { ...config.tokens, registry: 'npm_token' }

      await publishPackage({
        pkg,
        config,
        packageManager: 'bun',
        dryRun: false,
      })
      await publishPackage({
        pkg,
        config,
        packageManager: 'yarn',
        dryRun: false,
      })

      expect(vi.mocked(execPromise).mock.calls.map(call => call[0])).toEqual([
        'bun publish --tag latest --registry https://registry.npmjs.org/',
        'yarn publish --tag latest --registry https://registry.npmjs.org/ --non-interactive',
      ])
    })
  })

  describe('When the versions are staged', () => {
    const STAGE_ID = '2f1c7b8e-1d2a-4c5b-9e8f-0a1b2c3d4e5f'

    beforeEach(() => {
      config.publish = {
        ...config.publish,
        registry: 'https://registry.npmjs.org/',
        access: 'public',
        staged: true,
      }
      config.tokens = { ...config.tokens, registry: 'npm_token' }
      vi.mocked(execPromise).mockResolvedValue({
        stdout: JSON.stringify({
          'test-package': { name: 'test-package', stageId: STAGE_ID },
        }),
        stderr: '',
      })
      vi.mocked(packAndUpload).mockResolvedValue({ stdout: `+ test-package@1.0.1 (staged with id ${STAGE_ID})`, tarball: '/cache/package.tgz' })
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    /** Runs in a run of its own, as a command does: the staged versions are kept in its state */
    function inRun<T>(run: () => Promise<T>): Promise<T> {
      return runWithEvents(undefined, () => withGitCache(run))
    }

    it('Then stages with npm, without one-time password, and records the stage id', async () => {
      config.publish.otp = '123456'

      const { statuses, staged } = await inRun(async () => ({
        statuses: await publishPackage({
          pkg,
          config,
          packageManager: 'npm',
          dryRun: false,
        }),
        staged: getStagedVersions(),
      }))

      expect(statuses).toEqual(['staged'])
      expect(execPromise).toHaveBeenCalledWith('npm stage publish --tag latest --registry https://registry.npmjs.org/ --access public --json', expect.objectContaining({ cwd: '/packages/test', noStdout: true }))
      expect(staged).toEqual([
        {
          name: 'test-package',
          version: '1.0.1',
          tag: 'latest',
          registry: 'https://registry.npmjs.org/',
          stageId: STAGE_ID,
        },
      ])
    })

    it('Then stages with pnpm 11.3 or later by itself, and packs with older pnpm, yarn and bun', async () => {
      vi.mocked(execSync).mockReturnValue('11.3.0\n' as never)
      await inRun(() => publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: false,
      }))
      expect(execPromise).toHaveBeenCalledWith('pnpm stage publish --tag latest --registry https://registry.npmjs.org/ --access public --no-git-checks --json', expect.anything())

      vi.mocked(execSync).mockReturnValue('10.18.0\n' as never)
      const statuses = await inRun(async () => [
        ...await publishPackage({
          pkg,
          config,
          packageManager: 'pnpm',
          dryRun: false,
        }),
        ...await publishPackage({
          pkg,
          config,
          packageManager: 'bun',
          dryRun: false,
        }),
        ...await publishPackage({
          pkg,
          config,
          packageManager: 'yarn',
          dryRun: false,
        }),
      ])

      expect(statuses).toEqual(['staged', 'staged', 'staged'])
      expect(vi.mocked(packAndUpload).mock.calls.map(call => [
        call[0].packageManager,
        call[0].staged,
        call[0].tag,
        call[0].otp,
      ])).toEqual([
        ['pnpm', true, 'latest', undefined],
        ['bun', true, 'latest', undefined],
        ['yarn', true, 'latest', undefined],
      ])
    })

    it('Then stages the versions of the listed tags only, and publishes the others directly', async () => {
      config.publish.staged = {
        tags: ['latest'],
      }
      pkg.newVersion = '1.1.0-beta.0'
      vi.mocked(isPrerelease).mockReturnValue(true)

      const statuses = await inRun(() => publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      }))

      expect(statuses).toEqual(['published'])
      expect(execPromise).toHaveBeenCalledWith(expect.stringMatching(/^npm publish --tag next /), expect.anything())
    })

    it('Then publishes directly on a registry other than npmjs, said once per run', async () => {
      config.publish.registry = 'https://npm.pkg.github.com/'

      const statuses = await inRun(async () => [
        ...await publishPackage({
          pkg,
          config,
          packageManager: 'npm',
          dryRun: false,
        }),
        ...await publishPackage({
          pkg,
          config,
          packageManager: 'npm',
          dryRun: false,
        }),
      ])

      expect(statuses).toEqual(['published', 'published'])
      expect(vi.mocked(logger.info).mock.calls.filter(call => call[0] === 'https://npm.pkg.github.com/: staging is npmjs only, published directly')).toHaveLength(1)
    })

    it('Then publishes a canary directly, unless its tag is listed or --staged is given', async () => {
      config.release = { ...config.release, canary: true }
      config.publish.tag = 'canary'

      expect(await inRun(() => publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      }))).toEqual(['published'])
      expect(logger.info).toHaveBeenCalledWith('Canaries are published directly: list their tag in publish.staged.tags, or pass --staged, to stage them')

      config.publish.staged = {
        tags: ['canary'],
      }
      expect(await inRun(() => publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      }))).toEqual(['staged'])

      config.publish.staged = true
      expect(await inRun(() => {
        markStagedExplicit()
        return publishPackage({
          pkg,
          config,
          packageManager: 'npm',
          dryRun: false,
        })
      })).toEqual(['staged'])
    })

    it('Then passes --dry-run to the stage, with the version written for it, and packs a dry run of bun', async () => {
      await inRun(() => publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: true,
      }))
      expect(execPromise).toHaveBeenCalledWith('npm stage publish --tag latest --registry https://registry.npmjs.org/ --access public --json --dry-run', expect.anything())
      expect(writeFileSync).toHaveBeenCalledWith('/packages/test/package.json', expect.stringContaining('"version": "1.0.1"'), 'utf8')

      vi.mocked(writeFileSync).mockClear()
      await inRun(() => publishPackage({
        pkg,
        config,
        packageManager: 'bun',
        dryRun: true,
      }))
      expect(packAndUpload).toHaveBeenCalledWith(expect.objectContaining({ packageManager: 'bun', staged: true, dryRun: true }))
      expect(writeFileSync).toHaveBeenCalledWith('/packages/test/package.json', expect.stringContaining('"version": "1.0.1"'), 'utf8')
    })

    it('Then refuses a version that may only be staged, before any one-time password', async () => {
      config.publish.staged = false
      vi.mocked(execPromise).mockRejectedValue(new Error('npm error code E403\nnpm error 403 Forbidden - PUT https://registry.npmjs.org/test-package - E_STAGE_REQUIRED: two-factor authentication or staging required'))

      const error = await inRun(() => {
        recordPublishedPackage({ name: 'dep', version: '2.0.0', status: 'published' })
        return publishPackage({
          pkg,
          config,
          packageManager: 'npm',
          dryRun: false,
        }).catch(caught => caught)
      })

      expect(error).toMatchObject({ code: 'E_STAGE_REQUIRED', packageName: 'test-package', tag: 'latest' })
      expect(error.message).toBe('npm refused to publish test-package@1.0.1 directly with tag "latest": this token only allows staging. Stage this tag (publish.staged: { tags: [\'latest\'] }, or --staged), or allow direct publish ("relizy trust" with direct publish for this workflow, or a token allowed to publish). This run already published: dep@2.0.0.')
      expect(askText).not.toHaveBeenCalled()
      expect(execPromise).toHaveBeenCalledTimes(1)
    })

    it('Then tells the trusted publisher configuration that only allows staging', async () => {
      vi.stubEnv('GITHUB_ACTIONS', 'true')
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', 'https://token.example')
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'request-token')
      config.publish.staged = false
      config.tokens = { ...config.tokens, registry: undefined }
      vi.mocked(execPromise).mockRejectedValue(new Error('403 Forbidden - E_STAGE_REQUIRED'))

      await expect(inRun(() => publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      }))).rejects.toThrow('the trusted publisher configuration of this workflow only allows staging')
    })

    it('Then reads the OIDC denial of npm as a configuration that only allows staging, or not staging (observed with pnpm)', async () => {
      vi.stubEnv('GITHUB_ACTIONS', 'true')
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', 'https://token.example')
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'request-token')
      config.tokens = { ...config.tokens, registry: undefined }
      const denied = new Error('Command failed: pnpm publish\nFailed to publish package test-package@1.0.1 (status 403 Forbidden): {"error":"OIDC permission denied for this action"}')

      config.publish.staged = false
      vi.mocked(execPromise).mockRejectedValue(denied)
      await expect(inRun(() => publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: false,
      })))
        .rejects
        .toMatchObject({
          code: 'E_STAGE_REQUIRED',
          message: expect.stringContaining('the trusted publisher configuration of this workflow only allows staging'),
        })

      config.publish.staged = true
      vi.mocked(execPromise).mockRejectedValue(denied)
      await expect(inRun(() => publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })))
        .rejects
        .toThrow('does not allow staged publish. Run "relizy trust"')
    })

    it('Then fails on a version already staged, or skips it with skipExistingVersions', async () => {
      vi.mocked(execPromise).mockRejectedValue(new Error('npm error code E409\nnpm error 409 Conflict - Cannot publish over previously staged version'))

      await expect(inRun(() => publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })))
        .rejects
        .toMatchObject({
          code: 'E_ALREADY_STAGED',
          message: expect.stringContaining('is already staged, awaiting approval: approve it with "relizy stage approve test-package"'),
        })

      config.publish.skipExistingVersions = true
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })))
      const { statuses, already } = await inRun(async () => ({
        statuses: await publishPackage({
          pkg,
          config,
          packageManager: 'npm',
          dryRun: false,
        }),
        already: getAlreadyStagedVersions(),
      }))
      expect(statuses).toEqual(['skipped'])
      expect(already).toEqual([
        {
          name: 'test-package',
          version: '1.0.1',
          tag: 'latest',
          registry: 'https://registry.npmjs.org/',
        },
      ])
    })
  })

  describe('When npm refuses a second stage of a version (observed on npmjs)', () => {
    const conflict = new Error('npm error code E409\nnpm error 409 Conflict - POST https://registry.npmjs.org/-/stage/package/test-package - Cannot stage previously published version "1.0.1".')

    beforeEach(() => {
      config.publish = { ...config.publish, registry: 'https://registry.npmjs.org/', staged: true }
      config.tokens = { ...config.tokens, registry: 'npm_token' }
    })

    it('Then tells it is already staged when the packument does not have it', async () => {
      vi.mocked(execPromise).mockImplementation(((command: string) => command.includes(' view ')
        ? Promise.resolve({ stdout: '', stderr: '' })
        : Promise.reject(conflict)) as typeof execPromise)

      await expect(runWithEvents(undefined, () => withGitCache(() => publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      }))))
        .rejects
        .toMatchObject({ code: 'E_ALREADY_STAGED' })
    })

    it('Then tells it is already published when the packument has it', async () => {
      vi.mocked(execPromise).mockImplementation(((command: string) => command.includes(' view ')
        ? Promise.resolve({ stdout: '"1.0.1"', stderr: '' })
        : Promise.reject(conflict)) as typeof execPromise)

      await expect(runWithEvents(undefined, () => withGitCache(() => publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      }))))
        .rejects
        .toThrow('Version test-package@1.0.1 already exists on the registry')
    })
  })

  describe('When bun or yarn classic publish under trusted publishing, which they cannot do', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('Then packs the package and publishes the tarball with npm, the case that failed before', async () => {
      vi.stubEnv('GITHUB_ACTIONS', 'true')
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', 'https://token.example')
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'request-token')
      config.publish = { ...config.publish, registry: 'https://registry.npmjs.org/' }
      config.tokens = { ...config.tokens, registry: undefined }
      vi.mocked(packAndUpload).mockResolvedValue({ stdout: '{}', tarball: '/cache/package.tgz' })

      expect(await publishPackage({
        pkg,
        config,
        packageManager: 'bun',
        dryRun: false,
      })).toEqual(['published'])
      expect(await publishPackage({
        pkg,
        config,
        packageManager: 'yarn',
        dryRun: false,
      })).toEqual(['published'])
      expect(packAndUpload).toHaveBeenCalledWith(expect.objectContaining({ packageManager: 'bun', staged: false }))
      expect(execPromise).not.toHaveBeenCalled()
    })
  })

  describe('When npm did not trust the job, under trusted publishing', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('Then turns the misleading ENEEDAUTH into the fix', async () => {
      vi.stubEnv('GITHUB_ACTIONS', 'true')
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', 'https://token.example')
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'request-token')
      config.publish = { ...config.publish, registry: 'https://registry.npmjs.org/' }
      config.tokens = { ...config.tokens, registry: undefined }
      vi.mocked(execPromise).mockRejectedValue(new Error('npm error code ENEEDAUTH\nnpm error need auth This command requires you to be logged in'))

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      }))
        .rejects
        .toThrow(/^Failed to publish test-package@1\.0\.1: npm does not trust this job to publish test-package.*Run "relizy trust"/)
    })

    it('Then keeps ENEEDAUTH as is with a token', async () => {
      config.publish = { ...config.publish, registry: 'https://registry.npmjs.org/' }
      config.tokens = { ...config.tokens, registry: 'npm_token' }
      const error = new Error('npm error code ENEEDAUTH')
      vi.mocked(execPromise).mockRejectedValue(error)

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })).rejects.toBe(error)
    })
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
        'Building publish command for test-package',
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
      vi.mocked(askText).mockResolvedValue('123456')
      vi.mocked(execPromise)
        .mockRejectedValueOnce(new Error('OTP required'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      const statuses = await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(statuses).toEqual(['published'])
      expect(askText).toHaveBeenCalled()
      expect(execPromise).toHaveBeenCalledTimes(2)
    })

    it('Then fails the publish, not a cancelled run, when the OTP prompt is cancelled', async () => {
      vi.mocked(isInCI).mockReturnValue(false)
      vi.mocked(askText).mockRejectedValue(new RelizyCancelError('Cancelled'))
      vi.mocked(execPromise).mockRejectedValueOnce(new Error('OTP required'))

      const error = await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      }).catch(error_ => error_)

      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBeInstanceOf(RelizyCancelError)
      expect(error.message).toContain('OTP input cancelled')
    })

    it('Then uploads with npm for the web 2FA when pnpm asks a one-time password in a terminal', async () => {
      vi.mocked(isInCI).mockReturnValue(false)
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', '')
      vi.stubEnv('GITLAB_CI', '')
      vi.stubEnv('CIRCLECI', '')
      vi.stubEnv('RELIZY_REPORTER', '')
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
      config.publish.registry = 'https://registry.npmjs.org/'
      vi.mocked(execPromise).mockRejectedValueOnce(new Error('ERR_PNPM_OTP_NON_INTERACTIVE provide the --otp option'))
      vi.mocked(packAndUpload).mockResolvedValueOnce({ stdout: '', tarball: '/repo/pkg.tgz' })

      try {
        const statuses = await publishPackage({
          pkg,
          config,
          packageManager: 'pnpm',
          dryRun: false,
        })

        expect(statuses).toEqual(['published'])
        expect(packAndUpload).toHaveBeenCalledWith(expect.objectContaining({
          staged: false,
          packageManager: 'pnpm',
          onWebAuth: expect.any(Function),
        }))
        expect(askText).not.toHaveBeenCalled()
      }
      finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
        Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true })
        vi.unstubAllEnvs()
      }
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
      vi.mocked(askText).mockResolvedValue('123456')
      vi.mocked(execPromise)
        .mockRejectedValueOnce(new Error('Error EOTP'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(askText).toHaveBeenCalled()
    })

    it('Then handles one-time password error message', async () => {
      vi.mocked(isInCI).mockReturnValue(false)
      vi.mocked(askText).mockResolvedValue('123456')
      vi.mocked(execPromise)
        .mockRejectedValueOnce(new Error('One-time password required'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(askText).toHaveBeenCalled()
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

  describe('When the registry requires a paid plan for a scoped package', () => {
    const paymentRequiredError = new Error('npm error code E402\nnpm error 402 Payment Required - PUT https://registry.npmjs.org/@scope%2fpkg - You must sign up for private packages')

    beforeEach(() => {
      pkg = { ...pkg, name: '@scope/pkg' }
      vi.mocked(execPromise).mockRejectedValue(paymentRequiredError)
    })

    it('Then explains how to publish it publicly', async () => {
      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })).rejects.toThrow(/publish\.access: 'public'.*"publishConfig": \{ "access": "public" \}/)
    })

    it('Then keeps the original error when the access is already public', async () => {
      config.publish.access = 'public'

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })).rejects.toBe(paymentRequiredError)
    })
  })

  describe('When the version already exists on the registry', () => {
    // Nexus phrases the immutable-asset conflict as an HTTP 400 with this body.
    const alreadyPublishedError = new Error('(status 400 Bad Request): {"success":false,"error":"Repository does not allow updating assets: npm"}')

    it('Then throws a clear, actionable error by default (skipExistingVersions disabled)', async () => {
      vi.mocked(execPromise).mockRejectedValue(alreadyPublishedError)

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })).rejects.toThrow(/already exists on the registry/)
    })

    it('Then mentions the skipExistingVersions option in the thrown error', async () => {
      vi.mocked(execPromise).mockRejectedValue(alreadyPublishedError)

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })).rejects.toThrow(/skipExistingVersions/)
    })

    it('Then the error tells how to skip the published versions, in these words', async () => {
      vi.mocked(execPromise).mockRejectedValue(alreadyPublishedError)

      const error = await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      }).catch((error: Error) => error)

      expect((error as Error).message).toMatchInlineSnapshot(`"Version test-package@1.0.1 already exists on the registry and cannot be overwritten. This usually happens when re-running a release on the same commit (e.g. a canary rerun), or after a release that published this version but failed to push its release commit (merge its tag into your branch to recover). Enable publish.skipExistingVersions (or pass --skip-existing-versions) to skip already-published versions instead of failing, only when re-running the release from the same commit: https://relizy.dev/guide/resume-a-release"`)
    })

    it('Then skips the package without throwing when skipExistingVersions is enabled', async () => {
      config.publish.skipExistingVersions = true
      vi.mocked(execPromise).mockRejectedValue(alreadyPublishedError)
      const loggerWarnSpy = vi.spyOn(logger, 'warn')

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })).resolves.toEqual(['skipped'])

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('version already exists on the registry'),
      )
    })

    it('Then does not skip an unrelated publish failure even when skipExistingVersions is enabled', async () => {
      config.publish.skipExistingVersions = true
      vi.mocked(execPromise).mockRejectedValue(new Error('ENEEDAUTH: authentication required'))

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })).rejects.toThrow('ENEEDAUTH')
    })
  })

  describe('When skipExistingVersions queries the registry proactively', () => {
    it('Then skips the publish entirely when the registry already has the version', async () => {
      config.publish.skipExistingVersions = true
      // The `view` query reports the version exists; publish must never run.
      vi.mocked(execPromise).mockImplementation((command: string) =>
        command.includes('view')
          ? Promise.resolve({ stdout: '"1.0.1"', stderr: '' })
          : Promise.reject(new Error('publish should not be called')),
      )
      const loggerWarnSpy = vi.spyOn(logger, 'warn')

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })).resolves.toEqual(['skipped'])

      expect(execPromise).not.toHaveBeenCalledWith(
        expect.stringContaining('publish'),
        expect.any(Object),
      )
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('version already exists on the registry'),
      )
    })

    it('Then publishes normally when the registry does not have the version yet', async () => {
      config.publish.skipExistingVersions = true
      // Both the `view` query (empty = not published) and the publish succeed.
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

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

    it('Then does not query the registry when skipExistingVersions is disabled', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(execPromise).not.toHaveBeenCalledWith(
        expect.stringContaining('view'),
        expect.any(Object),
      )
    })

    it('Then does not query the registry in dry-run mode', async () => {
      config.publish.skipExistingVersions = true
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: true,
      })

      expect(execPromise).not.toHaveBeenCalledWith(
        expect.stringContaining('view'),
        expect.any(Object),
      )
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

    it('Then detects Yarn Berry from the .yarnrc.yml of the project, whatever the current directory', async () => {
      cwdSpy.mockReturnValue('/elsewhere')
      vi.mocked(existsSync).mockImplementation(file => file === '/project/.yarnrc.yml')

      await publishPackage({
        pkg,
        config,
        packageManager: 'yarn',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringMatching(/^yarn npm publish .*--no-git-checks/),
        expect.any(Object),
      )
    })

    it('Then adds the arguments of publish.args after the ones of relizy, before --dry-run', async () => {
      config.publish.args = ['--provenance', '--json']

      await publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: true,
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringMatching(/^pnpm publish .*--no-git-checks --provenance --json --dry-run$/),
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

  describe('When restoring version after dry-run publish', () => {
    beforeEach(() => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: 'test-package', version: '1.0.0' }))
    })

    it('Then temporarily writes new version before publish for pnpm', async () => {
      const writeCalls: string[] = []
      vi.mocked(writeFileSync).mockImplementation((_path, content) => {
        const parsed = JSON.parse((content as string).trim())
        writeCalls.push(parsed.version)
      })

      await publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: true,
      })

      expect(writeCalls[0]).toBe('1.0.1')
    })

    it('Then restores original version after publish succeeds for pnpm', async () => {
      const writeCalls: string[] = []
      vi.mocked(writeFileSync).mockImplementation((_path, content) => {
        const parsed = JSON.parse((content as string).trim())
        writeCalls.push(parsed.version)
      })

      await publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: true,
      })

      expect(writeCalls).toEqual(['1.0.1', '1.0.0'])
    })

    it('Then restores the package.json byte for byte, with its uncommitted changes', async () => {
      const original = '{\n    "name": "test-package",\n    "version": "1.0.0",\n    "dependencies": { "dep": "workspace:^" }\n}'
      vi.mocked(readFileSync).mockReturnValue(original)
      const writes: string[] = []
      vi.mocked(writeFileSync).mockImplementation((_path, content) => {
        writes.push(content as string)
      })

      await publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: true,
      })

      expect(JSON.parse(writes[0]!)).toEqual({
        name: 'test-package',
        version: '1.0.1',
        dependencies: { dep: 'workspace:^' },
      })
      expect(writes.at(-1)).toBe(original)
    })

    it('Then restores original version after publish succeeds for npm', async () => {
      const writeCalls: string[] = []
      vi.mocked(writeFileSync).mockImplementation((_path, content) => {
        const parsed = JSON.parse((content as string).trim())
        writeCalls.push(parsed.version)
      })

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: true,
      })

      expect(writeCalls).toEqual(['1.0.1', '1.0.0'])
    })

    it('Then restores original version even when publish fails for pnpm', async () => {
      const writeCalls: string[] = []
      vi.mocked(writeFileSync).mockImplementation((_path, content) => {
        const parsed = JSON.parse((content as string).trim())
        writeCalls.push(parsed.version)
      })
      vi.mocked(execPromise).mockRejectedValue(new Error('Publish failed'))

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: true,
      })).rejects.toThrow('Publish failed')

      expect(writeCalls).toEqual(['1.0.1', '1.0.0'])
    })

    it('Then restores original version even when publish fails for npm', async () => {
      const writeCalls: string[] = []
      vi.mocked(writeFileSync).mockImplementation((_path, content) => {
        const parsed = JSON.parse((content as string).trim())
        writeCalls.push(parsed.version)
      })
      vi.mocked(execPromise).mockRejectedValue(new Error('Publish failed'))

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: true,
      })).rejects.toThrow('Publish failed')

      expect(writeCalls).toEqual(['1.0.1', '1.0.0'])
    })

    it('Then does not write package.json in non-dry-run mode for pnpm', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: false,
      })

      expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('Then does not write package.json in dry-run for yarn', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'yarn',
        dryRun: true,
      })

      expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('Then does not write package.json in dry-run for bun', async () => {
      await publishPackage({
        pkg,
        config,
        packageManager: 'bun',
        dryRun: true,
      })

      expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('Then does not write package.json when newVersion equals version', async () => {
      pkg.newVersion = pkg.version

      await publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: true,
      })

      expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('Then does not write package.json when newVersion is undefined', async () => {
      pkg.newVersion = undefined

      await publishPackage({
        pkg,
        config,
        packageManager: 'pnpm',
        dryRun: true,
      })

      expect(writeFileSync).not.toHaveBeenCalled()
    })
  })

  describe('When multiple registries are configured', () => {
    it('Then publishes to the legacy registry and every mirrored registry', async () => {
      config.publish.registry = 'https://registry.npmjs.org/'
      config.publish.registries = [
        { name: 'nexus', registry: 'https://nexus.internal/repo/' },
      ]

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenCalledTimes(2)
      expect(execPromise).toHaveBeenNthCalledWith(1, expect.stringContaining('--registry https://registry.npmjs.org/'), expect.any(Object))
      expect(execPromise).toHaveBeenNthCalledWith(2, expect.stringContaining('--registry https://nexus.internal/repo/'), expect.any(Object))
    })

    it('Then only publishes to a scoped registry matching the package name', async () => {
      config.publish.registry = 'https://registry.npmjs.org/'
      config.publish.registries = [
        {
          name: 'jfrog',
          registry: 'https://jfrog.internal/repo/',
          packageFilter: ['@scope/*'],
        },
      ]

      await publishPackage({
        pkg, // name: 'test-package', does not match '@scope/*'
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenCalledTimes(1)
      expect(execPromise).toHaveBeenCalledWith(expect.stringContaining('--registry https://registry.npmjs.org/'), expect.any(Object))
    })

    it('Then publishes to a scoped registry when the package name matches', async () => {
      pkg.name = '@scope/foo'
      vi.mocked(getIndependentTag).mockReturnValue('@scope/foo@1.0.1')
      config.publish.registry = 'https://registry.npmjs.org/'
      config.publish.registries = [
        {
          name: 'jfrog',
          registry: 'https://jfrog.internal/repo/',
          packageFilter: ['@scope/*'],
        },
      ]

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenCalledTimes(2)
      expect(execPromise).toHaveBeenNthCalledWith(2, expect.stringContaining('--registry https://jfrog.internal/repo/'), expect.any(Object))
    })

    it('Then includes the registry name in the log when publishing to more than one', async () => {
      const loggerSpy = vi.spyOn(logger, 'info')
      config.publish.registry = 'https://registry.npmjs.org/'
      config.publish.registries = [
        { name: 'nexus', registry: 'https://nexus.internal/repo/' },
      ]

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('[default]'))
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('[nexus]'))
    })

    it('Then stops at the first failing registry and does not attempt the next one (fail-fast)', async () => {
      config.publish.registry = 'https://registry.npmjs.org/'
      config.publish.registries = [
        { name: 'nexus', registry: 'https://nexus.internal/repo/' },
      ]
      vi.mocked(execPromise).mockRejectedValue(new Error('Publish failed'))

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })).rejects.toThrow('Publish failed')

      expect(execPromise).toHaveBeenCalledTimes(1)
      expect(execPromise).toHaveBeenCalledWith(expect.stringContaining('--registry https://registry.npmjs.org/'), expect.any(Object))
    })

    it('Then writes the scope registry to .npmrc per target so a scoped package reaches each target, not the ambient .npmrc registry', async () => {
      pkg.name = '@accor/foo'
      vi.mocked(getIndependentTag).mockReturnValue('@accor/foo@1.0.1')
      config.publish.registry = 'https://registry.npmjs.org/'
      config.publish.registries = [
        { name: 'jfrog', registry: 'https://jfrog.internal/repo/' },
      ]

      const npmrcWrites: string[] = []
      vi.mocked(writeFileSync).mockImplementation((_path, content) => {
        npmrcWrites.push(content as string)
      })

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      // No scope registry override leaks into the CLI command (pnpm 12 rejects it).
      expect(execPromise).not.toHaveBeenCalledWith(expect.stringContaining(':registry='), expect.any(Object))
      // Each target writes its own @accor:registry into .npmrc instead.
      expect(npmrcWrites.some(c => c.includes('@accor:registry=https://registry.npmjs.org/'))).toBe(true)
      expect(npmrcWrites.some(c => c.includes('@accor:registry=https://jfrog.internal/repo/'))).toBe(true)
    })

    it('Then does not write a scope registry override for an unscoped package', async () => {
      // pkg.name is the unscoped 'test-package'
      config.publish.registry = 'https://registry.npmjs.org/'

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      const command = vi.mocked(execPromise).mock.calls[0]![0] as string
      expect(command).toContain('--registry https://registry.npmjs.org/')
      expect(command).not.toContain(':registry=')
      // No token/scope configured, so no .npmrc write happens at all.
      expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('Then propagates the global publish tag to explicit registries that have no tag of their own', async () => {
      pkg.name = '@accor/foo'
      vi.mocked(getIndependentTag).mockReturnValue('@accor/foo@1.0.1')
      config.publish.registry = 'https://registry.npmjs.org/'
      config.publish.tag = 'canary'
      config.publish.registries = [
        { name: 'jfrog', registry: 'https://jfrog.internal/repo/' },
      ]

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenNthCalledWith(1, expect.stringContaining('--tag canary'), expect.any(Object))
      expect(execPromise).toHaveBeenNthCalledWith(2, expect.stringContaining('--tag canary'), expect.any(Object))
    })

    it('Then keeps a registry-specific tag over the global publish tag', async () => {
      config.publish.registry = 'https://registry.npmjs.org/'
      config.publish.tag = 'canary'
      config.publish.registries = [
        { name: 'jfrog', registry: 'https://jfrog.internal/repo/', tag: 'beta' },
      ]

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(execPromise).toHaveBeenNthCalledWith(1, expect.stringContaining('--tag canary'), expect.any(Object))
      expect(execPromise).toHaveBeenNthCalledWith(2, expect.stringContaining('--tag beta'), expect.any(Object))
    })
  })

  describe('When the registry asks for an OTP and the application gives it with onOtp', () => {
    function publishWithOtp(onOtp: (request: { registry: string, packageName?: string }) => string | Promise<string>) {
      return runWithEvents(undefined, () => publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      }), { onOtp })
    }

    beforeEach(() => {
      config.publish.registry = 'https://otp-app.internal/'
      config.publish.registries = undefined
    })

    it('Then asks the application with the registry and the package, instead of the prompt, and retries with it', async () => {
      vi.mocked(isInCI).mockReturnValue(false)
      const onOtp = vi.fn().mockResolvedValue('424242')
      vi.mocked(execPromise)
        .mockRejectedValueOnce(new Error('OTP required'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      await publishWithOtp(onOtp)

      expect(onOtp).toHaveBeenCalledWith({ registry: 'https://otp-app.internal/', packageName: pkg.name })
      expect(askText).not.toHaveBeenCalled()
      expect(vi.mocked(execPromise).mock.calls[1]![0]).toContain('--otp 424242')
    })

    it('Then asks the application in CI too', async () => {
      vi.mocked(isInCI).mockReturnValue(true)
      const onOtp = vi.fn().mockResolvedValue('111111')
      vi.mocked(execPromise)
        .mockRejectedValueOnce(new Error('OTP required'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      await publishWithOtp(onOtp)

      expect(onOtp).toHaveBeenCalledTimes(1)
    })

    it('Then accepts a password given synchronously', async () => {
      vi.mocked(isInCI).mockReturnValue(false)
      vi.mocked(execPromise)
        .mockRejectedValueOnce(new Error('OTP required'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      await publishWithOtp(() => ' 333333 ')

      expect(vi.mocked(execPromise).mock.calls[1]![0]).toContain('--otp 333333')
    })

    it.each([
      ['an empty password', ''],
      ['blank password', '   '],
      ['no password', undefined],
    ])('Then %s cancels the publish', async (_, otp) => {
      vi.mocked(isInCI).mockReturnValue(false)
      vi.mocked(execPromise).mockRejectedValueOnce(new Error('OTP required'))

      const error = await publishWithOtp(() => otp as string).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(RelizyCancelError)
      expect((error as Error).message).toBe(`No one-time password given for ${pkg.name}: publish cancelled`)
      expect(execPromise).toHaveBeenCalledTimes(1)
    })

    it('Then gives the registry of the npmrc when the config sets none', async () => {
      vi.mocked(isInCI).mockReturnValue(false)
      config.publish.registry = undefined
      const onOtp = vi.fn().mockRejectedValue(new Error('No OTP'))
      vi.mocked(execPromise).mockRejectedValueOnce(new Error('OTP required'))

      await expect(publishWithOtp(onOtp)).rejects.toThrow('No OTP')
      expect(onOtp).toHaveBeenCalledWith({
        registry: expect.any(String),
        packageName: pkg.name,
      })
    })
  })

  describe('When OTP is required across multiple registries', () => {
    // The legacy target (built from `publish.registry`) is always resolved alongside
    // any explicit `registries` entry, so assertions filter execPromise calls by
    // registry URL instead of relying on call order/count across all targets.
    function callsFor(registryHost: string) {
      return vi.mocked(execPromise).mock.calls.filter(([command]) => (command as string).includes(registryHost))
    }

    beforeEach(() => {
      vi.mocked(isInCI).mockReturnValue(false)
      // Legacy target always succeeds immediately - it is not the target under test here.
      config.publish.registry = 'https://registry.npmjs.org/'
    })

    it('Then caches the prompted OTP per registry and reuses it for the next package on that same registry', async () => {
      config.publish.registries = [
        { name: 'otp-reuse', registry: 'https://otp-reuse.internal/repo/' },
      ]

      vi.mocked(askText).mockResolvedValueOnce('999999')
      vi.mocked(execPromise).mockImplementation((command) => {
        if ((command as string).includes('otp-reuse.internal') && !(command as string).includes('--otp 999999')) {
          return Promise.reject(new Error('OTP required'))
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      // First attempt failed (no otp yet), retry succeeded with the prompted otp.
      expect(askText).toHaveBeenCalledTimes(1)
      expect(callsFor('otp-reuse.internal')).toHaveLength(2)
      expect(callsFor('otp-reuse.internal')[1]![0]).toContain('--otp 999999')

      // A second package published to the same registry should reuse the cached OTP:
      // no further prompt, and the command carries it on the very first attempt.
      vi.mocked(execPromise).mockClear()
      vi.mocked(askText).mockClear()

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(askText).not.toHaveBeenCalled()
      expect(callsFor('otp-reuse.internal')).toHaveLength(1)
      expect(callsFor('otp-reuse.internal')[0]![0]).toContain('--otp 999999')
    })

    it('Then does not leak an OTP cached for one registry into a different, never-prompted registry', async () => {
      // Distinct registry from the previous test - must not have any cached OTP.
      config.publish.registries = [
        { name: 'otp-isolated', registry: 'https://otp-isolated.internal/repo/' },
      ]

      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      const isolatedCalls = callsFor('otp-isolated.internal')
      expect(isolatedCalls).toHaveLength(1)
      expect(isolatedCalls[0]![0]).not.toContain('--otp')
    })

    it('Then still reuses the cached OTP when the registry URL only differs by a trailing slash', async () => {
      config.publish.registries = [
        { name: 'otp-trailing-slash', registry: 'https://otp-trailing-slash.internal/repo' }, // no trailing slash
      ]

      vi.mocked(askText).mockResolvedValueOnce('555555')
      vi.mocked(execPromise).mockImplementation((command) => {
        if ((command as string).includes('otp-trailing-slash.internal') && !(command as string).includes('--otp 555555')) {
          return Promise.reject(new Error('OTP required'))
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(askText).toHaveBeenCalledTimes(1)

      // Same registry, but declared with a trailing slash this time (different package/config).
      vi.mocked(execPromise).mockClear()
      vi.mocked(askText).mockClear()
      config.publish.registries = [
        { name: 'otp-trailing-slash', registry: 'https://otp-trailing-slash.internal/repo/' }, // trailing slash
      ]

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

      expect(askText).not.toHaveBeenCalled()
      const calls = callsFor('otp-trailing-slash.internal')
      expect(calls).toHaveLength(1)
      expect(calls[0]![0]).toContain('--otp 555555')
    })
  })
})
