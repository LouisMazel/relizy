import { execPromise, logger } from '@maz-ui/node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureCliOutput } from '../../../tests/cli-output'
import { anyHookContext, createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { assertTrustedPublishingNpm, checkWorkspaceDependencies, executeHook, getPackagesOrBumpedPackages, loadRelizyConfig, publishPackage, readPackageJson, readPackages, topologicalSort } from '../../core'
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
  }
})
vi.mock('../../core/dependencies', async (importActual) => {
  const actual = await importActual<typeof import('../../core/dependencies')>()
  return {
    ...actual,
    topologicalSort: vi.fn(),
  }
})
vi.mock('../../core/workspace', async (importActual) => {
  const actual = await importActual<typeof import('../../core/workspace')>()
  return {
    ...actual,
    checkWorkspaceDependencies: vi.fn(),
  }
})
vi.mock('../../core/npm-oidc', async (importActual) => {
  const actual = await importActual<typeof import('../../core/npm-oidc')>()
  return {
    ...actual,
    assertTrustedPublishingNpm: vi.fn(),
  }
})
vi.mock('../../core/repo', async (importActual) => {
  return {
    getPrivatePackagesMode: (await importActual<typeof import('../../core/repo')>()).getPrivatePackagesMode,
    readPackageJson: vi.fn(),
    // A publishable package, so that the safety check authenticates to the registry
    readPackages: vi.fn(() => [
      {
        name: 'pkg',
        version: '1.0.0',
        private: false,
        path: '/project',
      },
    ]),
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
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: { safetyCheck: true, args: [], packageManager: undefined as any },
        safetyCheck: true,
        release: { publish: true },
      })

      await publishSafetyCheck({ config })

      expect(processExitSpy).not.toHaveBeenCalled()
    })
  })

  describe('When auth check fails', () => {
    it('Then exits with code 1', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: { safetyCheck: true, args: [], packageManager: 'npm' },
        safetyCheck: true,
        release: { publish: true },
      })
      vi.mocked(execPromise).mockRejectedValue(new Error('Auth failed'))

      await expect(() => publishSafetyCheck({ config })).rejects.toThrow()
    })
  })

  describe('When the auth check times out', () => {
    it('Then throws a clear timeout error mentioning --no-safety-check', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          safetyCheck: true,
          args: [],
          packageManager: 'npm',
          safetyCheckTimeout: 30000,
        },
        safetyCheck: true,
        release: { publish: true },
      })
      // execPromise kills the command on timeout: error.killed is then true.
      vi.mocked(execPromise).mockRejectedValue(Object.assign(new Error('killed'), { killed: true }))

      await expect(() => publishSafetyCheck({ config })).rejects.toThrow(/timed out/i)
      await expect(() => publishSafetyCheck({ config })).rejects.toThrow(/--no-safety-check/)
    })

    it('Then passes the configured timeout to execPromise', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          safetyCheck: true,
          args: [],
          packageManager: 'npm',
          safetyCheckTimeout: 12345,
        },
        safetyCheck: true,
        release: { publish: true },
      })
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
        const config = createMockConfig({
          bump: { type: 'patch' },
          publish: {
            safetyCheck: true,
            args: [],
            packageManager: 'npm',
            safetyCheckTimeout: 15000,
          },
          safetyCheck: true,
          release: { publish: true },
        })
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

  describe('When the job publishes to npm with trusted publishing (OIDC)', () => {
    const npmConfig = () => createMockConfig({
      bump: { type: 'patch' },
      publish: {
        safetyCheck: true,
        args: [],
        packageManager: 'npm',
        registry: 'https://registry.npmjs.org/',
      },
      tokens: { registry: undefined },
      safetyCheck: true,
      release: { publish: true },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    beforeEach(() => {
      vi.stubEnv('GITHUB_ACTIONS', 'true')
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', 'https://token.actions.githubusercontent.com')
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'request-token')
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }))
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('Then checks the npm of the job instead of authenticating with a token', async () => {
      await publishSafetyCheck({
        config: npmConfig(),
      })

      expect(assertTrustedPublishingNpm).toHaveBeenCalledWith(expect.objectContaining({ packageManager: 'npm', provider: 'GitHub Actions' }))
      expect(execPromise).not.toHaveBeenCalledWith(expect.stringContaining('whoami'), expect.anything())
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Trusted publishing (OIDC) from GitHub Actions'))
    })

    it('Then warns about a package that is not on npm yet', async () => {
      fetchSpy.mockResolvedValue(new Response('{}', { status: 404 }))

      await publishSafetyCheck({
        config: npmConfig(),
      })

      expect(fetchSpy).toHaveBeenCalledWith('https://registry.npmjs.org/pkg', expect.anything())
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Not on npm yet: pkg'))
    })

    it('Then authenticates as usual with a token, the fallback of npm', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          safetyCheck: true,
          args: [],
          packageManager: 'npm',
          registry: 'https://registry.npmjs.org/',
        },
        tokens: { registry: 'npm_token' },
        safetyCheck: true,
        release: { publish: true },
      })
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await publishSafetyCheck({ config })

      expect(assertTrustedPublishingNpm).not.toHaveBeenCalled()
      expect(execPromise).toHaveBeenCalledWith(expect.stringContaining('whoami'), expect.anything())
    })

    it('Then tells how to publish without token when the job has no OIDC permission', async () => {
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', '')
      vi.mocked(execPromise).mockRejectedValue(new Error('ENEEDAUTH'))

      await expect(publishSafetyCheck({
        config: npmConfig(),
      })).rejects.toThrow(/no npm token found\. Set NPM_TOKEN, or publish with trusted publishing/)
    })
  })

  describe('When auth check succeeds', () => {
    it('Then does not exit', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: { safetyCheck: true, args: [], packageManager: 'npm' },
        safetyCheck: true,
        release: { publish: true },
      })
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await publishSafetyCheck({ config })

      expect(processExitSpy).not.toHaveBeenCalled()
    })
  })

  describe('When every package is private (a private app)', () => {
    it('Then does not authenticate to the registry, nothing can be published', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: { safetyCheck: true, args: [], packageManager: 'npm' },
        safetyCheck: true,
        release: { publish: true },
      })
      vi.mocked(readPackages).mockReturnValueOnce([
        {
          name: 'app',
          version: '1.0.0',
          private: true,
          path: '/project',
        },
      ])

      await publishSafetyCheck({ config })

      expect(execPromise).not.toHaveBeenCalled()
    })
  })

  describe('When safety check is disabled', () => {
    it('Then returns early without checking', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: { safetyCheck: false, args: [] },
        safetyCheck: true,
        release: { publish: true },
      })

      await publishSafetyCheck({ config })

      expect(processExitSpy).not.toHaveBeenCalled()
    })
  })

  describe('When release.publish is false, for relizy publish run alone', () => {
    it('Then it still checks the access to the registry', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: { safetyCheck: true, args: [], packageManager: 'npm' },
        safetyCheck: true,
        release: { publish: false },
      })
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await publishSafetyCheck({ config })

      expect(execPromise).toHaveBeenCalledWith(expect.stringContaining('whoami'), expect.any(Object))
    })
  })

  describe('When multiple registries are configured', () => {
    it('Then authenticates against every distinct registry, once each', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          safetyCheck: true,
          args: [],
          packageManager: 'npm',
          registry: 'https://registry.npmjs.org/',
          registries: [
            { name: 'nexus', registry: 'https://nexus.internal/repo/' },
            {
              name: 'jfrog',
              registry: 'https://jfrog.internal/repo/',
              packageFilter: ['@scope/*'],
            },
          ],
        },
        safetyCheck: true,
        release: { publish: true },
      })
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
      vi.mocked(readPackages).mockReturnValueOnce([
        {
          name: 'pkg',
          version: '1.0.0',
          private: false,
          path: '/project/pkg',
        },
        {
          name: '@scope/foo',
          version: '1.0.0',
          private: false,
          path: '/project/foo',
        },
      ])

      await publishSafetyCheck({ config })

      expect(execPromise).toHaveBeenCalledTimes(3)
      expect(execPromise).toHaveBeenNthCalledWith(1, expect.stringContaining('--registry https://registry.npmjs.org/'), expect.any(Object))
      expect(execPromise).toHaveBeenNthCalledWith(2, expect.stringContaining('--registry https://nexus.internal/repo/'), expect.any(Object))
      expect(execPromise).toHaveBeenNthCalledWith(3, expect.stringContaining('--registry https://jfrog.internal/repo/'), expect.any(Object))
    })

    it('Then skips a registry scoped to no package of the workspace', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          safetyCheck: true,
          args: [],
          packageManager: 'npm',
          registry: 'https://registry.npmjs.org/',
          registries: [
            {
              name: 'jfrog',
              registry: 'https://jfrog.internal/repo/',
              packageFilter: ['@scope/*'],
            },
          ],
        },
        safetyCheck: true,
      })
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await publishSafetyCheck({ config })

      expect(execPromise).toHaveBeenCalledTimes(1)
      expect(execPromise).toHaveBeenCalledWith(expect.stringContaining('--registry https://registry.npmjs.org/'), expect.any(Object))
    })

    it('Then checks the .npmrc registry of a package that no entry covers, without publish.registry', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          safetyCheck: true,
          args: [],
          packageManager: 'npm',
          registries: [
            {
              name: 'github',
              registry: 'https://npm.pkg.github.com/',
              packageFilter: ['@acme/*'],
            },
          ],
        },
        safetyCheck: true,
      })
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
      vi.mocked(readPackages).mockReturnValueOnce([
        {
          name: '@acme/core',
          version: '1.0.0',
          private: false,
          path: '/project/core',
        },
        {
          name: 'foo',
          version: '1.0.0',
          private: false,
          path: '/project/foo',
        },
      ])

      await publishSafetyCheck({ config })

      const registries = vi.mocked(execPromise).mock.calls.map(([command]) => String(command).match(/--registry (\S+)/)?.[1])
      expect(registries).toHaveLength(2)
      expect(registries).toContain('https://npm.pkg.github.com/')
    })

    it('Then deduplicates a registry declared both as legacy and explicit', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          safetyCheck: true,
          args: [],
          packageManager: 'npm',
          registry: 'https://registry.npmjs.org/',
          registries: [
            { name: 'duplicate', registry: 'https://registry.npmjs.org/' },
          ],
        },
        safetyCheck: true,
        release: { publish: true },
      })
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await publishSafetyCheck({ config })

      expect(execPromise).toHaveBeenCalledTimes(1)
    })

    it('Then stops at the first failing registry (fail-fast)', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          safetyCheck: true,
          args: [],
          packageManager: 'npm',
          registry: 'https://registry.npmjs.org/',
          registries: [
            { name: 'nexus', registry: 'https://nexus.internal/repo/' },
          ],
        },
        safetyCheck: true,
        release: { publish: true },
      })
      vi.mocked(execPromise).mockRejectedValue(new Error('Auth failed'))

      await expect(() => publishSafetyCheck({ config })).rejects.toThrow()

      expect(execPromise).toHaveBeenCalledTimes(1)
    })
  })

  describe('When the packages to publish are known', () => {
    it('Then only checks registries actually needed by those packages, skipping unmatched scoped ones', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          safetyCheck: true,
          args: [],
          packageManager: 'npm',
          registry: 'https://registry.npmjs.org/',
          registries: [
            {
              name: 'jfrog',
              registry: 'https://jfrog.internal/repo/',
              packageFilter: ['@internal/*'],
            },
          ],
        },
        safetyCheck: true,
        release: { publish: true },
      })
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      // None of the packages being published this release match '@internal/*'.
      const packages = [
        createMockPackageInfo({ name: 'public-pkg' }),
      ]

      await publishSafetyCheck({ config, packages })

      expect(execPromise).toHaveBeenCalledTimes(1)
      expect(execPromise).toHaveBeenCalledWith(expect.stringContaining('--registry https://registry.npmjs.org/'), expect.any(Object))
    })

    it('Then checks a scoped registry when one of the packages being published matches it', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        publish: {
          safetyCheck: true,
          args: [],
          packageManager: 'npm',
          registry: 'https://registry.npmjs.org/',
          registries: [
            {
              name: 'jfrog',
              registry: 'https://jfrog.internal/repo/',
              packageFilter: ['@internal/*'],
            },
          ],
        },
        safetyCheck: true,
        release: { publish: true },
      })
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      const packages = [
        createMockPackageInfo({ name: '@internal/foo' }),
      ]

      await publishSafetyCheck({ config, packages })

      expect(execPromise).toHaveBeenCalledTimes(2)
      expect(execPromise).toHaveBeenCalledWith(expect.stringContaining('--registry https://jfrog.internal/repo/'), expect.any(Object))
    })
  })
})

describe('Given publish command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
      bump: { type: 'patch' },
      publish: { packageManager: 'npm' },
    }))
    vi.mocked(executeHook).mockResolvedValue(undefined)
    vi.mocked(publishPackage).mockResolvedValue(undefined)
    vi.mocked(topologicalSort).mockImplementation(pkgs => pkgs)
    vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([])
    vi.mocked(readPackageJson).mockReturnValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
      private: false,
    })
  })

  describe('When a registry token is given', () => {
    it('Then it replaces tokens.registry', async () => {
      await publish({ token: 'npm_given' })

      expect(loadRelizyConfig).toHaveBeenCalledWith(expect.objectContaining({
        overrides: expect.objectContaining({
          tokens: { registry: 'npm_given' },
        }),
      }))
    })
  })

  describe('When the publish options of the config are given', () => {
    it('Then forwards args, packageManager and safetyCheckTimeout to the config', async () => {
      await publish({
        args: ['--provenance'],
        packageManager: 'pnpm',
        safetyCheckTimeout: 5000,
      })

      expect(loadRelizyConfig).toHaveBeenCalledWith(expect.objectContaining({
        overrides: expect.objectContaining({
          publish: expect.objectContaining({
            args: ['--provenance'],
            packageManager: 'pnpm',
            safetyCheckTimeout: 5000,
          }),
        }),
      }))
    })
  })

  describe('When publishing with default options', () => {
    it('Then loads config and executes hooks', async () => {
      await publish({})

      expect(loadRelizyConfig).toHaveBeenCalled()
      expect(executeHook).toHaveBeenCalledWith('before:publish', expect.any(Object), false, anyHookContext)
    })

    it('Then executes success hook', async () => {
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        createMockPackageInfo({
          name: 'pkg-a',
          version: '1.0.0',
          path: '/pkg-a',
          commits: [],
          dependencies: [],
        }),
        createMockPackageInfo({
          name: 'pkg-b',
          version: '2.0.0',
          path: '/pkg-b',
          commits: [],
          dependencies: ['pkg-a'],
        }),
      ])

      await publish({})

      expect(executeHook).toHaveBeenCalledWith('success:publish', expect.any(Object), false, anyHookContext)
    })
  })

  describe('When publishing packages', () => {
    it('Then publishes in topological order', async () => {
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        createMockPackageInfo({
          name: 'pkg-a',
          version: '1.0.0',
          path: '/pkg-a',
          commits: [],
          dependencies: [],
        }),
        createMockPackageInfo({
          name: 'pkg-b',
          version: '2.0.0',
          path: '/pkg-b',
          commits: [],
          dependencies: ['pkg-a'],
        }),
      ])

      await publish({})

      expect(topologicalSort).toHaveBeenCalled()
      expect(publishPackage).toHaveBeenCalledTimes(2)
    })

    it('Then passes package manager to publish', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
        bump: { type: 'patch' },
        publish: { packageManager: 'pnpm' },
      }))
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        createMockPackageInfo({
          name: 'pkg',
          version: '1.0.0',
          path: '/pkg',
          commits: [],
          dependencies: [],
        }),
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
        createMockPackageInfo({
          name: 'pkg',
          version: '1.0.0',
          path: '/pkg',
          commits: [],
          dependencies: [],
        }),
      ])

      await publish({ dryRun: true })

      expect(executeHook).toHaveBeenCalledWith('before:publish', expect.any(Object), true, anyHookContext)
      expect(publishPackage).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
      )
    })
  })

  describe('When the discovered list contains private packages', () => {
    it('Then excludes them from the publish flow even with privatePackages: release', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
        bump: { type: 'patch' },
        publish: { packageManager: 'npm' },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
          privatePackages: 'release',
        },
      }))
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        createMockPackageInfo({
          name: '@scope/public',
          version: '1.0.0',
          path: '/pub',
          private: false,
          commits: [],
          dependencies: [],
        }),
        createMockPackageInfo({
          name: '@scope/private',
          version: '1.0.0',
          path: '/priv',
          private: true,
          commits: [],
          dependencies: [],
        }),
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
        createMockPackageInfo({
          name: 'pkg',
          version: '1.0.0',
          path: '/pkg',
          commits: [],
          dependencies: [],
        }),
      ])

      await expect(publish({})).rejects.toThrow('Publish failed')

      expect(executeHook).toHaveBeenCalledWith('error:publish', expect.any(Object), false, anyHookContext)
    })
  })
})

describe('Given publish command and the workspace dependencies', () => {
  const pkgA = createMockPackageInfo({
    name: 'pkg-a',
    version: '1.0.0',
    newVersion: '1.1.0',
    path: '/pkg-a',
    commits: [],
    dependencies: [],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
      bump: { type: 'patch' },
      publish: { packageManager: 'pnpm', buildCmd: 'pnpm build' },
    }))
    vi.mocked(executeHook).mockResolvedValue(undefined)
    vi.mocked(publishPackage).mockResolvedValue(undefined)
    vi.mocked(topologicalSort).mockImplementation(pkgs => pkgs)
    vi.mocked(readPackageJson).mockReturnValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
      private: false,
    })
  })

  it('Then checks them with the versions planned by the bump', async () => {
    const bumpResult = {
      bumped: true as const,
      bumpedPackages: [
        { ...pkgA, oldVersion: '1.0.0' },
        {
          ...createMockPackageInfo({ name: 'private-pkg', newVersion: '0.2.0', private: true }),
          oldVersion: '0.1.0',
        },
      ],
    }
    vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue(bumpResult.bumpedPackages)

    await publish({ bumpResult })

    expect(checkWorkspaceDependencies).toHaveBeenCalledWith(expect.objectContaining({
      packages: [
        expect.objectContaining({ name: 'pkg-a' }),
      ],
      plannedVersions: new Map([
        ['pkg-a', '1.1.0'],
        ['private-pkg', '0.2.0'],
      ]),
    }))
  })

  it('Then neither builds nor publishes when the check fails', async () => {
    vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([pkgA])
    vi.mocked(checkWorkspaceDependencies).mockRejectedValueOnce(new Error('missing version'))

    await expect(publish({})).rejects.toThrow('missing version')

    expect(execPromise).not.toHaveBeenCalledWith('pnpm build', expect.anything())
    expect(publishPackage).not.toHaveBeenCalled()
    expect(executeHook).toHaveBeenCalledWith('error:publish', expect.any(Object), false, anyHookContext)
  })

  it('Then fails when targeting version groups on a config without groups', async () => {
    vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([pkgA])

    await expect(publish({
      groups: ['header'],
    })).rejects.toThrow('the config has no monorepo.groups')

    expect(publishPackage).not.toHaveBeenCalled()
  })
})

describe('Given the output of publish in CI', () => {
  const packages = [
    createMockPackageInfo({
      name: 'pkg-a',
      version: '1.0.0',
      newVersion: '1.1.0',
      path: '/pkg-a',
      commits: [],
      dependencies: [],
    }),
    createMockPackageInfo({
      name: 'pkg-b',
      version: '2.0.0',
      newVersion: '2.1.0',
      path: '/pkg-b',
      commits: [],
      dependencies: [],
    }),
  ]
  let output: ReturnType<typeof captureCliOutput>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
      bump: { type: 'patch' },
      publish: { packageManager: 'pnpm', buildCmd: 'pnpm build' },
      safetyCheck: false,
    }))
    vi.mocked(publishPackage).mockResolvedValue(undefined)
    vi.mocked(topologicalSort).mockImplementation(pkgs => pkgs)
    vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue(packages)
    vi.mocked(readPackageJson).mockReturnValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
      private: false,
    })
    output = captureCliOutput()
  })

  afterEach(() => {
    output.restore()
  })

  it('Then tells each step: the packages, the build, each publish, then the npm pages', async () => {
    await publish({})

    expect(output.lines()).toEqual([
      'relizy publish · ci',
      '▸ Checking the packages to publish',
      expect.stringMatching(/^✔ pkg-a@1\.1\.0, pkg-b@2\.1\.0 to publish {2}\d+ms$/),
      '▸ Building the packages',
      '  › Building the packages (pnpm build)',
      expect.stringMatching(/^✔ Packages built {2}\d+ms$/),
      '▸ Publishing the packages',
      '  › Publishing pkg-a@1.1.0 (1/2)',
      '  › Publishing pkg-b@2.1.0 (2/2)',
      expect.stringMatching(/^✔ Published pkg-a@1\.1\.0, pkg-b@2\.1\.0 {2}\d+ms$/),
      '  https://www.npmjs.com/package/pkg-a/v/1.1.0',
      '  https://www.npmjs.com/package/pkg-b/v/2.1.0',
      expect.stringMatching(/^✔ Published pkg-a@1\.1\.0, pkg-b@2\.1\.0 {2}\d+ms$/),
    ])
  })

  it('Then tells when there is nothing to publish', async () => {
    vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([])

    await publish({})

    expect(output.lines().at(-1)).toMatch(/^○ No package to publish {2}\d+ms$/)
  })

  it('Then shows the error once', async () => {
    vi.mocked(publishPackage).mockRejectedValueOnce(new Error('E403 Forbidden'))

    await expect(publish({})).rejects.toThrow('E403 Forbidden')

    expect(output.lines()).toEqual(expect.arrayContaining([
      expect.stringMatching(/^✖ Publishing the packages failed {2}\d+ms$/),
      '✖ Publish failed',
      '  E403 Forbidden',
    ]))
  })
})
