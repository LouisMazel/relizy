import type { PackageBase } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { isVersionPublished } from '../npm-versions'
import { checkWorkspaceDependencies, readWorkspacePackages, reportStalePeerDependents } from '../workspace'

vi.mock('../npm-versions', async (importActual) => {
  const actual = await importActual<typeof import('../npm-versions')>()
  return {
    ...actual,
    isVersionPublished: vi.fn(),
  }
})

interface PackageJson {
  name: string
  version: string
  private?: boolean
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

describe('Given a workspace', () => {
  let cwd: string
  let config: ResolvedRelizyConfig

  function writePackage(path: string, packageJson: PackageJson) {
    mkdirSync(join(cwd, path), { recursive: true })
    writeFileSync(join(cwd, path, 'package.json'), JSON.stringify(packageJson))
  }

  function pkg(path: string, name: string, overrides: Partial<PackageBase> = {}): PackageBase {
    return createMockPackageInfo({
      name,
      path: join(cwd, path),
      version: '1.0.0',
      newVersion: undefined,
      ...overrides,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    cwd = mkdtempSync(join(tmpdir(), 'relizy-workspace-'))
    writePackage('.', { name: 'root', version: '1.0.0', private: true })
    config = createMockConfig({
      bump: { type: 'release' },
      monorepo: {
        versionMode: 'selective',
        packages: ['packages/*'],
      },
    })
    config.cwd = cwd
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  describe('When reading the workspace packages', () => {
    it('Then reads the packages of monorepo.packages, private ones and the root included', () => {
      writePackage('packages/a', { name: 'a', version: '1.0.0' })
      writePackage('packages/private', { name: 'private-pkg', version: '0.1.0', private: true })
      mkdirSync(join(cwd, 'packages/no-package'), { recursive: true })

      const packages = readWorkspacePackages(config)

      expect([
        ...packages.keys(),
      ].sort()).toEqual(['a', 'private-pkg', 'root'])
    })

    it('Then reads the packages of every version group', () => {
      writePackage('packages/a', { name: 'a', version: '1.0.0' })
      writePackage('shared/nav', { name: 'nav', version: '1.0.0' })
      config.monorepo = {
        groups: [
          {
            name: 'main',
            versionMode: 'selective',
            packages: ['packages/*'],
          },
          {
            name: 'header',
            versionMode: 'independent',
            packages: ['shared/nav'],
          },
        ],
      }

      expect([
        ...readWorkspacePackages(config).keys(),
      ].sort()).toEqual(['a', 'nav', 'root'])
    })

    it('Then skips an invalid package.json', () => {
      writePackage('packages/invalid', { name: 'invalid' } as PackageJson)

      expect([
        ...readWorkspacePackages(config).keys(),
      ]).toEqual(['root'])
    })
  })

  describe('When checking the workspace dependencies before publishing', () => {
    beforeEach(() => {
      writePackage('packages/components', { name: 'components', version: '7.0.0' })
      writePackage('packages/nav', {
        name: 'nav',
        version: '1.2.0',
        peerDependencies: { components: 'workspace:*' },
      })
    })

    it('Then passes when the dependency is published by the run', async () => {
      await checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/components', 'components', { version: '7.0.0' }),
          pkg('packages/nav', 'nav', { version: '1.2.0' }),
        ],
      })

      expect(isVersionPublished).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('Then compares with the version on disk when publishing without bump (relizy publish run alone)', async () => {
      // getPackages computes the next version again, but the version on disk is the one published
      await checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/components', 'components', { version: '7.0.0', newVersion: '7.1.0' }),
          pkg('packages/nav', 'nav', { version: '1.2.0', newVersion: '1.2.1' }),
        ],
      })

      expect(isVersionPublished).not.toHaveBeenCalled()
    })

    it('Then uses the planned versions of a dry run', async () => {
      await checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/components', 'components', { newVersion: '7.1.0' }),
          pkg('packages/nav', 'nav'),
        ],
        plannedVersions: new Map([
          ['components', '7.1.0'],
        ]),
      })

      expect(isVersionPublished).not.toHaveBeenCalled()
    })

    it('Then passes when the version is already on the registry', async () => {
      vi.mocked(isVersionPublished).mockResolvedValue(true)

      await checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/nav', 'nav'),
        ],
      })

      expect(isVersionPublished).toHaveBeenCalledWith(expect.objectContaining({
        pkg: expect.objectContaining({ name: 'components' }),
        version: '7.0.0',
      }))
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('Then throws when the registry confirms the version is missing', async () => {
      vi.mocked(isVersionPublished).mockResolvedValue(false)

      await expect(checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/nav', 'nav'),
        ],
      }))
        .rejects
        .toThrow('nav (peerDependencies): components@7.0.0')
    })

    it('Then checks the version planned by the run when its package is not published', async () => {
      vi.mocked(isVersionPublished).mockResolvedValue(false)

      await expect(checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/nav', 'nav'),
        ],
        plannedVersions: new Map([
          ['components', '7.1.0'],
        ]),
      })).rejects.toThrow('components@7.1.0')
    })

    it('Then warns when the registry cannot be queried', async () => {
      vi.mocked(isVersionPublished).mockResolvedValue(null)

      await checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/nav', 'nav'),
        ],
      })

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('nav (peerDependencies): components@7.0.0'))
    })

    it('Then queries every registry the dependency is published to', async () => {
      config.publish.registry = 'https://registry.npmjs.org/'
      config.publish.registries = [
        { name: 'mirror', registry: 'https://mirror.example.com/' },
      ]
      vi.mocked(isVersionPublished).mockResolvedValueOnce(false).mockResolvedValueOnce(true)

      await checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/nav', 'nav'),
        ],
      })

      expect(isVersionPublished).toHaveBeenCalledTimes(2)
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('Then reports a missing version on one registry and an unknown one on the other as unknown', async () => {
      config.publish.registry = 'https://registry.npmjs.org/'
      config.publish.registries = [
        { name: 'mirror', registry: 'https://mirror.example.com/' },
      ]
      vi.mocked(isVersionPublished).mockResolvedValueOnce(false).mockResolvedValueOnce(null)

      await checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/nav', 'nav'),
        ],
      })

      expect(logger.warn).toHaveBeenCalled()
    })

    it('Then queries the registry once per dependency version', async () => {
      writePackage('packages/login', {
        name: 'login',
        version: '1.0.0',
        dependencies: { components: 'workspace:^' },
      })
      vi.mocked(isVersionPublished).mockResolvedValue(true)

      await checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/nav', 'nav'),
          pkg('packages/login', 'login'),
        ],
      })

      expect(isVersionPublished).toHaveBeenCalledTimes(1)
    })

    it('Then follows an alias to the workspace package', async () => {
      writePackage('packages/login', {
        name: 'login',
        version: '1.0.0',
        dependencies: { ui: 'workspace:components@^' },
      })
      vi.mocked(isVersionPublished).mockResolvedValue(false)

      await expect(checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/login', 'login'),
        ],
      }))
        .rejects
        .toThrow('login (dependencies): components@7.0.0')
    })

    it('Then does not check the explicit ranges, the dev dependencies and the unknown packages', async () => {
      writePackage('packages/login', {
        name: 'login',
        version: '1.0.0',
        dependencies: { components: 'workspace:^6.0.0', unknown: 'workspace:*' },
        devDependencies: { nav: 'workspace:*' },
      })

      await checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/login', 'login'),
        ],
      })

      expect(isVersionPublished).not.toHaveBeenCalled()
    })

    it('Then detects a dependency on a private package, never published', async () => {
      writePackage('packages/internal', { name: 'internal', version: '0.1.0', private: true })
      writePackage('packages/login', {
        name: 'login',
        version: '1.0.0',
        dependencies: { internal: 'workspace:*' },
      })
      vi.mocked(isVersionPublished).mockResolvedValue(false)

      await expect(checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/login', 'login'),
        ],
      }))
        .rejects
        .toThrow('internal@0.1.0')
    })

    it('Then can be disabled', async () => {
      config.publish.checkWorkspaceDependencies = false
      vi.mocked(isVersionPublished).mockResolvedValue(false)

      await checkWorkspaceDependencies({
        config,
        packages: [
          pkg('packages/nav', 'nav'),
        ],
      })

      expect(isVersionPublished).not.toHaveBeenCalled()
    })
  })
})

describe('Given the peer dependencies of the packages not released', () => {
  let cwd: string
  let config: ResolvedRelizyConfig

  function writePackage(path: string, packageJson: PackageJson) {
    mkdirSync(join(cwd, path), { recursive: true })
    writeFileSync(join(cwd, path, 'package.json'), JSON.stringify(packageJson))
  }

  const components = {
    ...createMockPackageInfo({ name: 'components', version: '6.19.1', newVersion: '6.20.0' }),
    oldVersion: '6.19.1',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    cwd = mkdtempSync(join(tmpdir(), 'relizy-stale-peers-'))
    writePackage('.', { name: 'root', version: '1.0.0', private: true })
    writePackage('packages/components', { name: 'components', version: '6.20.0' })
    config = createMockConfig({
      bump: { type: 'release' },
      monorepo: {
        versionMode: 'selective',
        packages: ['packages/*'],
      },
    })
    config.cwd = cwd
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('Then warns about them', () => {
    writePackage('packages/nav', {
      name: 'nav',
      version: '1.2.0',
      peerDependencies: { components: 'workspace:*' },
    })

    reportStalePeerDependents({
      config,
      bumpedPackages: [components],
      publishedPackages: [components],
    })

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('  - nav: components "6.19.1" does not accept 6.20.0'))
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('bump.outOfRangePeers: \'bump\''))
  })

  it('Then throws with outOfRangePeers: error', () => {
    writePackage('packages/nav', {
      name: 'nav',
      version: '1.2.0',
      peerDependencies: { components: 'workspace:*' },
    })
    config.bump.outOfRangePeers = 'error'

    expect(() => reportStalePeerDependents({
      config,
      bumpedPackages: [components],
      publishedPackages: [components],
    }))
      .toThrow('  - nav: components "6.19.1" does not accept 6.20.0')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('Then does not warn when nothing is stale or when the check is disabled', () => {
    writePackage('packages/nav', {
      name: 'nav',
      version: '1.2.0',
      peerDependencies: { components: 'workspace:*' },
    })

    reportStalePeerDependents({
      config,
      bumpedPackages: [components],
      publishedPackages: [
        components,
        createMockPackageInfo({ name: 'nav' }),
      ],
    })
    config.publish.checkWorkspaceDependencies = false
    reportStalePeerDependents({
      config,
      bumpedPackages: [components],
      publishedPackages: [components],
    })

    expect(logger.warn).not.toHaveBeenCalled()
  })
})
