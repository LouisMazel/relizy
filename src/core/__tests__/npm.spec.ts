import type { PackageBase } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path, { join } from 'node:path'
import process from 'node:process'
import { execPromise, logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { isInCI } from '../ci-env'
import { RelizyCancelError } from '../errors'
import { determinePublishTag, getAuthCommand, publishPackage } from '../npm'
import { detectPackageManager, getNpmRegistry, resolveRegistryTargetsForPackage, withRegistryNpmrc } from '../npm-registry'
import { isVersionAlreadyPublishedError, isVersionPublished } from '../npm-versions'
import { askText } from '../prompts'
import { getIndependentTag } from '../tags'
import { isPrerelease } from '../version'

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
vi.mock('../ci-env', async () => {
  const actual = await vi.importActual('../ci-env')
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

describe('Given isVersionAlreadyPublishedError function', () => {
  it.each([
    ['Nexus immutable asset (HTTP 400)', 'Repository does not allow updating assets: npm'],
    ['npm EPUBLISHCONFLICT', 'code EPUBLISHCONFLICT'],
    ['npm cannot publish over', 'You cannot publish over the previously published versions: 1.0.0.'],
    ['generic already exists', 'Version already exists'],
    ['Artifactory repository conflict', 'artifact already exists in the repository'],
    ['bare HTTP 409', 'request failed with status 409 conflict'],
  ])('Then returns true for %s', (_label, message) => {
    expect(isVersionAlreadyPublishedError(new Error(message))).toBe(true)
  })

  it('Then returns false for an unrelated publish failure', () => {
    expect(isVersionAlreadyPublishedError(new Error('ENEEDAUTH: authentication required'))).toBe(false)
  })

  it('Then returns false for non-error values', () => {
    expect(isVersionAlreadyPublishedError(null)).toBe(false)
    expect(isVersionAlreadyPublishedError(undefined)).toBe(false)
    expect(isVersionAlreadyPublishedError('does not allow updating assets')).toBe(false)
  })
})

describe('Given isVersionPublished function', () => {
  let config: ResolvedRelizyConfig
  let pkg: PackageBase
  let fetchMock: ReturnType<typeof vi.fn>
  const registryTarget = { name: 'default', registry: 'https://registry.npmjs.org/', token: 'token' }

  function mockFetchResponse({ status = 200, ok = status < 400, body = {} }: { status?: number, ok?: boolean, body?: unknown } = {}) {
    fetchMock.mockResolvedValue({
      status,
      ok,
      json: () => Promise.resolve(body),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Neutralize registry token env vars so the config resolved by createMockConfig
    // stays hermetic: getDefaultConfig reads these into tokens.registry, and CI sets
    // them, which would otherwise leak an Authorization header into these tests.
    vi.stubEnv('RELIZY_NPM_TOKEN', undefined)
    vi.stubEnv('NPM_TOKEN', undefined)
    vi.stubEnv('NODE_AUTH_TOKEN', undefined)
    config = createMockConfig({
      cwd: '/project',
      publish: { args: [], safetyCheck: false },
    })
    pkg = {
      ...createMockPackageInfo(),
      name: '@scope/pkg',
      path: '/packages/pkg',
      version: '1.0.0',
    }
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readFileSync).mockReturnValue('')
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('When using npm/pnpm (view strategy)', () => {
    it('Then returns true when the registry returns the version', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '"1.0.1"', stderr: '' })

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        config,
        packageManager: 'pnpm',
        registryTarget,
      })

      expect(result).toBe(true)
      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('view @scope/pkg@1.0.1'),
        expect.any(Object),
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('Then queries the target registry', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '"1.0.1"', stderr: '' })

      await isVersionPublished({
        pkg,
        version: '1.0.1',
        config,
        packageManager: 'pnpm',
        registryTarget,
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('--registry https://registry.npmjs.org/'),
        expect.any(Object),
      )
    })

    it('Then returns false when the package exists but not that version (empty stdout)', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      const result = await isVersionPublished({
        pkg,
        version: '9.9.9',
        config,
        packageManager: 'npm',
        registryTarget,
      })

      expect(result).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('Then returns false when the package is not found (E404)', async () => {
      vi.mocked(execPromise).mockRejectedValue(new Error('npm error code E404 - Not found'))

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        config,
        packageManager: 'npm',
        registryTarget,
      })

      expect(result).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('Then falls back to a direct HTTP request when view is inconclusive', async () => {
      vi.mocked(execPromise).mockRejectedValue(new Error('ENEEDAUTH: authentication required'))
      mockFetchResponse({
        body: {
          versions: { '1.0.1': {} },
        },
      })

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        config,
        packageManager: 'npm',
        registryTarget,
      })

      expect(result).toBe(true)
      expect(fetchMock).toHaveBeenCalled()
    })
  })

  describe('When using yarn/bun (HTTP strategy)', () => {
    it('Then never shells out to a view command', async () => {
      mockFetchResponse({
        body: {
          versions: { '1.0.1': {} },
        },
      })

      await isVersionPublished({
        pkg,
        version: '1.0.1',
        config,
        packageManager: 'bun',
        registryTarget,
      })

      expect(execPromise).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalled()
    })

    it('Then requests the packument with the scope slash encoded and a bearer token', async () => {
      mockFetchResponse({
        body: {
          versions: { '1.0.1': {} },
        },
      })

      await isVersionPublished({
        pkg,
        version: '1.0.1',
        config,
        packageManager: 'yarn',
        registryTarget,
      })

      expect(fetchMock).toHaveBeenCalledWith(
        'https://registry.npmjs.org/@scope%2Fpkg',
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer token' }),
        }),
      )
    })

    it('Then returns true when the packument lists the version', async () => {
      mockFetchResponse({
        body: {
          versions: { '1.0.0': {}, '1.0.1': {} },
        },
      })

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        config,
        packageManager: 'bun',
        registryTarget,
      })

      expect(result).toBe(true)
    })

    it('Then returns false when the packument does not list the version', async () => {
      mockFetchResponse({
        body: {
          versions: { '1.0.0': {} },
        },
      })

      const result = await isVersionPublished({
        pkg,
        version: '9.9.9',
        config,
        packageManager: 'bun',
        registryTarget,
      })

      expect(result).toBe(false)
    })

    it('Then returns false on a 404 (package absent)', async () => {
      mockFetchResponse({ status: 404, ok: false })

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        config,
        packageManager: 'bun',
        registryTarget,
      })

      expect(result).toBe(false)
    })

    it('Then returns null (inconclusive) on a non-OK response (e.g. 401)', async () => {
      mockFetchResponse({ status: 401, ok: false })

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        config,
        packageManager: 'bun',
        registryTarget,
      })

      expect(result).toBeNull()
    })

    it('Then returns null (inconclusive) on a network error', async () => {
      fetchMock.mockRejectedValue(new Error('network down'))

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        config,
        packageManager: 'bun',
        registryTarget,
      })

      expect(result).toBeNull()
    })

    it('Then omits the Authorization header when no token is configured', async () => {
      mockFetchResponse({
        body: { versions: {} },
      })

      await isVersionPublished({
        pkg,
        version: '1.0.1',
        config,
        packageManager: 'bun',
        registryTarget: { name: 'default', registry: 'https://registry.npmjs.org/' },
      })

      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
      expect(headers.authorization).toBeUndefined()
    })

    it('Then guards the request with a timeout signal', async () => {
      mockFetchResponse({
        body: { versions: {} },
      })

      await isVersionPublished({
        pkg,
        version: '1.0.1',
        config,
        packageManager: 'bun',
        registryTarget,
      })

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
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

      await publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })

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

    it('Then skips the package without throwing when skipExistingVersions is enabled', async () => {
      config.publish.skipExistingVersions = true
      vi.mocked(execPromise).mockRejectedValue(alreadyPublishedError)
      const loggerWarnSpy = vi.spyOn(logger, 'warn')

      await expect(publishPackage({
        pkg,
        config,
        packageManager: 'npm',
        dryRun: false,
      })).resolves.toBeUndefined()

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
      })).resolves.toBeUndefined()

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
