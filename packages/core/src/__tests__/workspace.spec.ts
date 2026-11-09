import type { PackageBase } from '../types'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getGitlabReleasePayload, getGitlabReleasesUrl } from '../gitlab'
import { detectPackageManager, findPackageManager, isYarnBerry } from '../package-manager'
import { resolveRegistryTargetsForPackage } from '../registry'
import { readPackageJson, readPackages, readWorkspacePackages, sortPackagesForPublish } from '../workspace'

let root: string

function writePackage(dir: string, content: Record<string, unknown>) {
  mkdirSync(join(root, dir), { recursive: true })
  writeFileSync(join(root, dir, 'package.json'), JSON.stringify(content))
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-core-')))
  writePackage('.', { name: 'root', version: '1.0.0', private: true })
  writePackage('packages/a', { name: 'a', version: '1.1.0' })
  writePackage('packages/b', { name: 'b', version: '1.2.0', private: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('Given the packages of a workspace', () => {
  describe('When reading them from patterns', () => {
    it('Then leaves out the private packages and the ignored directories', () => {
      expect(readPackages({
        cwd: root,
        patterns: ['packages/*'],
      }).map(pkg => pkg.name)).toEqual(['a'])
      expect(readPackages({
        cwd: root,
        patterns: ['packages/*'],
        privatePackages: 'release',
      }).map(pkg => pkg.name)).toEqual(['a', 'b'])
      expect(readPackages({
        cwd: root,
        patterns: ['packages/*'],
        privatePackages: 'release',
        ignored: ['packages/b'],
      }).map(pkg => pkg.name)).toEqual(['a'])
    })

    it('Then reads the root without patterns', () => {
      expect(readPackages({ cwd: root }).map(pkg => pkg.name)).toEqual(['root'])
    })

    it('Then reads the root and every matched package, private ones included', () => {
      expect([
        ...readWorkspacePackages({
          cwd: root,
          patterns: ['packages/*'],
        }).keys(),
      ].sort()).toEqual(['a', 'b', 'root'])
    })
  })

  describe('When a package.json is missing or invalid', () => {
    it('Then reports it to the logger, or throws without name and version', () => {
      const fail = vi.fn()
      mkdirSync(join(root, 'empty'))
      writePackage('invalid', { name: 'invalid' })

      expect(readPackageJson(join(root, 'empty'), { fail })).toBeUndefined()
      expect(fail).toHaveBeenCalledWith(`package.json not found at ${join(root, 'empty', 'package.json')}`)
      expect(() => readPackageJson(join(root, 'invalid'))).toThrow('missing name or version')
    })
  })
})

describe('Given the package manager of a project', () => {
  describe('When detecting it', () => {
    it('Then reads the packageManager field, then the lockfile', () => {
      writePackage('.', { name: 'root', version: '1.0.0', packageManager: 'pnpm@12.0.0' })
      expect(detectPackageManager(root)).toBe('pnpm')

      writePackage('.', { name: 'root', version: '1.0.0' })
      writeFileSync(join(root, 'yarn.lock'), '')
      expect(detectPackageManager(root)).toBe('yarn')
    })

    it('Then finds the declared package manager only, without a fallback', () => {
      expect(findPackageManager(root)).toBeUndefined()

      writeFileSync(join(root, 'package-lock.json'), '')
      expect(findPackageManager(root)).toBe('npm')

      writePackage('.', { name: 'root', version: '1.0.0', packageManager: 'bun@1.4.0' })
      expect(findPackageManager(root)).toBe('bun')
    })

    it('Then tells yarn berry from its .yarnrc.yml', () => {
      expect(isYarnBerry(root)).toBe(false)
      writeFileSync(join(root, '.yarnrc.yml'), '')
      expect(isYarnBerry(root)).toBe(true)
    })
  })
})

describe('Given the registries of a package', () => {
  const defaultTarget = { name: 'default', registry: 'https://registry.npmjs.org/' }
  const internal = {
    name: 'internal',
    registry: 'https://npm.example.com/',
    packageFilter: ['@acme/*'],
  }

  describe('When an entry covers the package', () => {
    it('Then adds it to the default registry, or replaces an unset one', () => {
      const options = {
        registry: 'https://registry.npmjs.org/',
        registries: [internal],
        buildDefaultTarget: () => defaultTarget,
      }

      expect(resolveRegistryTargetsForPackage({ name: '@acme/ui' }, options)).toEqual([defaultTarget, internal])
      expect(resolveRegistryTargetsForPackage({ name: 'other' }, options)).toEqual([defaultTarget])
      expect(resolveRegistryTargetsForPackage({ name: '@acme/ui' }, { ...options, registry: undefined })).toEqual([internal])
    })
  })
})

describe('Given the GitLab releases API', () => {
  describe('When building a request', () => {
    it('Then targets the instance of the domain, and defaults the ref', () => {
      expect(getGitlabReleasesUrl({ repo: 'group/sub/project' })).toBe('https://gitlab.com/api/v4/projects/group%2Fsub%2Fproject/releases')
      expect(getGitlabReleasesUrl({ repo: 'a/b', domain: 'git.example.com' })).toBe('https://git.example.com/api/v4/projects/a%2Fb/releases')
      expect(getGitlabReleasePayload({ tag_name: 'v1.0.0' })).toEqual({
        tag_name: 'v1.0.0',
        name: 'v1.0.0',
        description: '',
        ref: 'main',
      })
    })
  })
})

describe('Given the packages to publish', () => {
  let cwd: string

  function writePackageIn(path: string, packageJson: Record<string, unknown>) {
    mkdirSync(join(cwd, path), { recursive: true })
    writeFileSync(join(cwd, path, 'package.json'), JSON.stringify(packageJson))
  }

  function pkg(path: string, name: string, overrides: Partial<PackageBase> = {}): PackageBase {
    return {
      name,
      path: join(cwd, path),
      version: '1.0.0',
      private: false,
      dependencies: [],
      fromTag: 'v1.0.0',
      commits: [],
      ...overrides,
    }
  }

  beforeEach(() => {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-publish-order-')))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  describe('When sorting them', () => {
    it('Then publishes a package after its dependencies, peer and optional dependencies included', () => {
      writePackageIn('packages/nav', {
        name: 'nav',
        version: '1.0.0',
        peerDependencies: { components: 'workspace:*' },
      })
      writePackageIn('packages/components', {
        name: 'components',
        version: '1.0.0',
        optionalDependencies: { icons: 'workspace:^' },
      })
      writePackageIn('packages/icons', {
        name: 'icons',
        version: '1.0.0',
        dependencies: { theme: 'workspace:*' },
      })
      writePackageIn('packages/theme', { name: 'theme', version: '1.0.0' })

      const sorted = sortPackagesForPublish([
        pkg('packages/nav', 'nav'),
        pkg('packages/components', 'components'),
        pkg('packages/icons', 'icons'),
        pkg('packages/theme', 'theme'),
      ])

      expect(sorted.map(p => p.name)).toEqual(['theme', 'icons', 'components', 'nav'])
    })

    it('Then ignores the dev dependencies and the packages not published', () => {
      writePackageIn('packages/a', {
        name: 'a',
        version: '1.0.0',
        devDependencies: { b: 'workspace:*' },
        dependencies: { external: '^1.0.0' },
      })
      writePackageIn('packages/b', { name: 'b', version: '1.0.0' })

      const sorted = sortPackagesForPublish([
        pkg('packages/a', 'a'),
        pkg('packages/b', 'b'),
      ])

      expect(sorted.map(p => p.name)).toEqual(['a', 'b'])
    })

    it('Then keeps the original package objects', () => {
      writePackageIn('packages/a', { name: 'a', version: '1.0.0' })
      const original = pkg('packages/a', 'a', {
        dependencies: ['x'],
      })

      expect(sortPackagesForPublish([original])[0]).toBe(original)
    })

    it('Then handles a package without package.json', () => {
      expect(sortPackagesForPublish([
        pkg('packages/missing', 'missing'),
      ]).map(p => p.name)).toEqual(['missing'])
    })
  })
})
