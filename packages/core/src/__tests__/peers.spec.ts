import type { VersionChange } from '../peers'
import type { PackageBase } from '../types'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeOutOfRange, findStalePeerDependents, getOutOfRangeDependencies, getOutOfRangePeers, getPublishedRange, isBreakingVersionChange, parseWorkspaceProtocol, parseWorkspaceSpecifier } from '../peers'
import { readWorkspacePackages } from '../workspace'

describe('Given getOutOfRangePeers function', () => {
  let cwd: string
  const bumped = new Map<string, VersionChange>([
    [
      'components',
      { oldVersion: '6.19.1', newVersion: '6.20.0' },
    ],
  ])

  function writePackage(peerDependencies?: Record<string, string>) {
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'nav', version: '1.2.0', peerDependencies }))
  }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-out-of-range-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('Then returns the peer dependencies whose published range rejects the new version', () => {
    writePackage({ components: 'workspace:*' })

    expect(getOutOfRangePeers({ packagePath: cwd, bumped })).toEqual([
      {
        dependency: 'components',
        field: 'peerDependencies',
        range: '6.19.1',
        oldVersion: '6.19.1',
        newVersion: '6.20.0',
      },
    ])
  })

  it('Then follows an alias to the bumped package', () => {
    writePackage({ ui: 'workspace:components@~' })

    expect(getOutOfRangePeers({
      packagePath: cwd,
      bumped: new Map([
        [
          'components',
          { oldVersion: '6.19.1', newVersion: '7.0.0' },
        ],
      ]),
    }))
      .toEqual([
        {
          dependency: 'components',
          field: 'peerDependencies',
          range: '~6.19.1',
          oldVersion: '6.19.1',
          newVersion: '7.0.0',
        },
      ])
  })

  it('Then rejects a prerelease of another version than the one of the range, as npm does', () => {
    writePackage({ components: 'workspace:^' })

    expect(getOutOfRangePeers({
      packagePath: cwd,
      bumped: new Map([
        [
          'components',
          { oldVersion: '6.19.1', newVersion: '6.20.0-0.canary-abc1234' },
        ],
      ]),
    }))
      .toEqual([
        {
          dependency: 'components',
          field: 'peerDependencies',
          range: '^6.19.1',
          oldVersion: '6.19.1',
          newVersion: '6.20.0-0.canary-abc1234',
        },
      ])
  })

  it('Then accepts a prerelease of the version of the range', () => {
    writePackage({ components: 'workspace:^' })

    expect(getOutOfRangePeers({
      packagePath: cwd,
      bumped: new Map([
        [
          'components',
          { oldVersion: '7.0.0-beta.0', newVersion: '7.0.0-beta.1' },
        ],
      ]),
    })).toEqual([])
    expect(getOutOfRangePeers({
      packagePath: cwd,
      bumped: new Map([
        [
          'components',
          { oldVersion: '7.0.0-beta.1', newVersion: '7.0.0' },
        ],
      ]),
    })).toEqual([])
  })

  it('Then ignores the ranges accepting the new version, the packages not bumped and the specifiers that are not ranges', () => {
    writePackage({ components: 'workspace:^', theme: 'workspace:*', icons: 'catalog:' })

    expect(getOutOfRangePeers({
      packagePath: cwd,
      bumped: new Map([
        ...bumped,
        [
          'icons',
          { oldVersion: '1.0.0', newVersion: '2.0.0' },
        ],
      ]),
    })).toEqual([])
  })

  it('Then returns nothing without peer dependencies, bumped package or package.json', () => {
    writePackage()

    expect(getOutOfRangePeers({ packagePath: cwd, bumped })).toEqual([])
    expect(getOutOfRangePeers({
      packagePath: cwd,
      bumped: new Map(),
    })).toEqual([])
    expect(getOutOfRangePeers({
      packagePath: join(cwd, 'missing'),
      bumped,
    })).toEqual([])
  })
})

describe('Given isBreakingVersionChange function', () => {
  it('Then returns true for a new major, or a new minor in 0.x', () => {
    expect(isBreakingVersionChange({ oldVersion: '6.19.1', newVersion: '7.0.0' })).toBe(true)
    expect(isBreakingVersionChange({ oldVersion: '0.2.18', newVersion: '0.3.0' })).toBe(true)
    expect(isBreakingVersionChange({ oldVersion: '0.0.3', newVersion: '0.0.4' })).toBe(true)
  })

  it('Then returns false for a minor or a patch', () => {
    expect(isBreakingVersionChange({ oldVersion: '6.19.1', newVersion: '6.20.0' })).toBe(false)
    expect(isBreakingVersionChange({ oldVersion: '6.19.1', newVersion: '6.19.2' })).toBe(false)
    expect(isBreakingVersionChange({ oldVersion: '0.2.18', newVersion: '0.2.19' })).toBe(false)
  })

  it('Then judges a prerelease by the version it leads to', () => {
    expect(isBreakingVersionChange({ oldVersion: '6.19.1', newVersion: '6.20.0-beta.0' })).toBe(false)
    expect(isBreakingVersionChange({ oldVersion: '6.19.1', newVersion: '7.0.0-beta.0' })).toBe(true)
    expect(isBreakingVersionChange({ oldVersion: '7.0.0-beta.1', newVersion: '7.0.0' })).toBe(false)
  })
})

describe('Given getOutOfRangeDependencies function', () => {
  let cwd: string

  function writePackage(name: string, content: Record<string, unknown>): string {
    const path = join(cwd, name)
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'package.json'), JSON.stringify({ name, ...content }))
    return path
  }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-out-of-range-dependents-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  function check(specifier: string, change: VersionChange) {
    const packagePath = writePackage('upgrade', {
      version: '5.3.1',
      dependencies: { node: specifier },
    })

    return getOutOfRangeDependencies({
      packagePath,
      bumped: new Map([
        ['node', change],
      ]),
      fields: ['dependencies'],
    })
  }

  it.each([
    ['workspace:^', '5.4.0', '5.5.0', false],
    ['workspace:^', '5.4.0', '6.0.0', true],
    ['workspace:^', '0.4.0', '0.5.0', true],
    // npm rejects a prerelease of another version than the one of the range
    [
      'workspace:^',
      '5.4.0',
      '5.5.0-beta.0',
      true,
    ],
    ['workspace:*', '5.4.0', '5.4.1', true],
    ['workspace:~', '5.4.0', '5.4.1', false],
    ['workspace:~', '5.4.0', '5.5.0', true],
    ['^5.0.0', '5.4.0', '5.5.0', false],
    [
      'workspace:^5.0.0',
      '5.4.0',
      '6.0.0',
      true,
    ],
  ])('Then checks %s from %s to %s against the published range (out of range: %s)', (specifier, oldVersion, newVersion, outOfRange) => {
    expect(check(specifier, { oldVersion, newVersion }).length > 0).toBe(outOfRange)
  })

  it('Then returns the field and the published range of each dependency', () => {
    expect(check('workspace:^', { oldVersion: '5.4.0', newVersion: '6.0.0' }))
      .toEqual([
        {
          dependency: 'node',
          field: 'dependencies',
          range: '^5.4.0',
          oldVersion: '5.4.0',
          newVersion: '6.0.0',
        },
      ])
  })

  it('Then counts a specifier that is not a semver range as out of range, without range', () => {
    expect(check('catalog:', { oldVersion: '5.4.0', newVersion: '5.4.1' })).toEqual([
      expect.objectContaining({ range: null }),
    ])
    expect(check('link:../node', { oldVersion: '5.4.0', newVersion: '5.4.1' })).toEqual([
      expect.objectContaining({ range: null }),
    ])
  })

  it('Then only reads the given fields', () => {
    const packagePath = writePackage('upgrade', {
      version: '5.3.1',
      dependencies: { node: 'workspace:*' },
      peerDependencies: { core: 'workspace:*' },
    })
    const bumped = new Map([
      [
        'node',
        { oldVersion: '1.0.0', newVersion: '1.0.1' },
      ],
      [
        'core',
        { oldVersion: '1.0.0', newVersion: '1.0.1' },
      ],
    ])

    expect(getOutOfRangeDependencies({
      packagePath,
      bumped,
      fields: ['peerDependencies'],
    }).map(({ dependency }) => dependency)).toEqual(['core'])
    expect(getOutOfRangeDependencies({ packagePath, bumped, fields: [] })).toEqual([])
  })
})
describe('Given parseWorkspaceSpecifier function', () => {
  it.each([
    ['workspace:*'],
    ['workspace:^'],
    ['workspace:~'],
  ])('Then resolves %s to the local version of the dependency', (specifier) => {
    expect(parseWorkspaceSpecifier('@scope/components', specifier)).toEqual({ target: '@scope/components' })
  })

  it('Then resolves an alias to its target package', () => {
    expect(parseWorkspaceSpecifier('components', 'workspace:@scope/components@^')).toEqual({ target: '@scope/components' })
    expect(parseWorkspaceSpecifier('utils', 'workspace:my-utils@*')).toEqual({ target: 'my-utils' })
  })

  it('Then ignores explicit ranges, published as they are', () => {
    expect(parseWorkspaceSpecifier('@scope/components', 'workspace:^1.2.0')).toBeNull()
    expect(parseWorkspaceSpecifier('components', 'workspace:@scope/components@1.2.0')).toBeNull()
  })

  it('Then ignores the other protocols', () => {
    expect(parseWorkspaceSpecifier('@scope/components', '^1.2.0')).toBeNull()
    expect(parseWorkspaceSpecifier('@scope/components', 'catalog:')).toBeNull()
  })
})

describe('Given parseWorkspaceProtocol function', () => {
  it('Then returns the target and the range of a workspace specifier', () => {
    expect(parseWorkspaceProtocol('components', 'workspace:^')).toEqual({ target: 'components', range: '^' })
    expect(parseWorkspaceProtocol('components', 'workspace:^1.2.0')).toEqual({ target: 'components', range: '^1.2.0' })
    expect(parseWorkspaceProtocol('ui', 'workspace:@scope/components@~')).toEqual({ target: '@scope/components', range: '~' })
  })

  it('Then returns null for another protocol', () => {
    expect(parseWorkspaceProtocol('components', '^1.2.0')).toBeNull()
  })
})

describe('Given getPublishedRange function', () => {
  it.each([
    ['workspace:*', '6.19.1'],
    ['workspace:', '6.19.1'],
    ['workspace:^', '^6.19.1'],
    ['workspace:~', '~6.19.1'],
    ['workspace:^6.0.0', '^6.0.0'],
    ['workspace:components@^', '^6.19.1'],
    ['^6.0.0', '^6.0.0'],
  ])('Then publishes %s as %s', (specifier, range) => {
    expect(getPublishedRange({ dependencyName: 'components', specifier, dependencyVersion: '6.19.1' })?.range).toBe(range)
  })

  it('Then returns null when the specifier is not a semver range', () => {
    expect(getPublishedRange({ dependencyName: 'components', specifier: 'catalog:', dependencyVersion: '6.19.1' })).toBeNull()
  })
})

function createMockPackageInfo(overrides?: Partial<PackageBase>): PackageBase {
  return {
    name: 'pkg-a',
    path: '/packages/pkg-a',
    version: '1.0.0',
    private: false,
    newVersion: '1.0.1',
    dependencies: [],
    dependencyChain: [],
    reason: 'commits',
    fromTag: 'v1.0.0',
    commits: [],
    ...overrides,
  }
}

describe('Given the peer dependencies of the packages not released', () => {
  let cwd: string

  function writePackage(path: string, packageJson: Record<string, unknown>) {
    mkdirSync(join(cwd, path), { recursive: true })
    writeFileSync(join(cwd, path, 'package.json'), JSON.stringify(packageJson))
  }

  function findStale(options: { bumpedPackages: (PackageBase & { oldVersion: string })[], publishedPackages: PackageBase[] }) {
    return findStalePeerDependents({
      workspacePackages: readWorkspacePackages({
        cwd,
        patterns: ['packages/*'],
      }).values(),
      ...options,
    })
  }

  const components = {
    ...createMockPackageInfo({ name: 'components', version: '6.19.1', newVersion: '6.20.0' }),
    oldVersion: '6.19.1',
  }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-stale-peers-'))
    writePackage('.', { name: 'root', version: '1.0.0', private: true })
    writePackage('packages/components', { name: 'components', version: '6.20.0' })
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })
  it('Then finds a dependent whose published range rejects the new version', () => {
    writePackage('packages/nav', {
      name: 'nav',
      version: '1.2.0',
      peerDependencies: { components: 'workspace:*' },
    })

    expect(findStale({
      bumpedPackages: [components],
      publishedPackages: [components],
    }))
      .toEqual([
        {
          dependent: 'nav',
          dependency: 'components',
          field: 'peerDependencies',
          range: '6.19.1',
          oldVersion: '6.19.1',
          newVersion: '6.20.0',
        },
      ])
  })

  it('Then accepts a range including the new version', () => {
    writePackage('packages/nav', {
      name: 'nav',
      version: '1.2.0',
      peerDependencies: { components: 'workspace:^' },
    })

    expect(findStale({
      bumpedPackages: [components],
      publishedPackages: [components],
    })).toEqual([])
  })

  it('Then reports a prerelease out of the range, as npm rejects it', () => {
    writePackage('packages/nav', {
      name: 'nav',
      version: '1.2.0',
      peerDependencies: { components: 'workspace:^' },
    })
    const canary = { ...components, newVersion: '6.19.2-0.canary-abc1234' }

    expect(findStale({
      bumpedPackages: [canary],
      publishedPackages: [canary],
    }))
      .toEqual([
        {
          dependent: 'nav',
          dependency: 'components',
          field: 'peerDependencies',
          range: '^6.19.1',
          oldVersion: '6.19.1',
          newVersion: '6.19.2-0.canary-abc1234',
        },
      ])
  })

  it('Then accepts a prerelease of the version of the range', () => {
    writePackage('packages/nav', {
      name: 'nav',
      version: '1.2.0',
      peerDependencies: { components: 'workspace:^' },
    })
    const beta = {
      ...components,
      version: '7.0.0-beta.0',
      oldVersion: '7.0.0-beta.0',
      newVersion: '7.0.0-beta.1',
    }

    expect(findStale({
      bumpedPackages: [beta],
      publishedPackages: [beta],
    })).toEqual([])
  })

  it('Then reports a major bump out of a caret range', () => {
    writePackage('packages/nav', {
      name: 'nav',
      version: '1.2.0',
      peerDependencies: { components: '^6.0.0' },
    })
    const major = { ...components, newVersion: '7.0.0' }

    expect(findStale({
      bumpedPackages: [major],
      publishedPackages: [major],
    }))
      .toEqual([
        {
          dependent: 'nav',
          dependency: 'components',
          field: 'peerDependencies',
          range: '^6.0.0',
          oldVersion: '6.19.1',
          newVersion: '7.0.0',
        },
      ])
  })

  it('Then ignores the dependents released by the run, the private ones and the other dependency fields', () => {
    writePackage('packages/nav', {
      name: 'nav',
      version: '1.2.0',
      peerDependencies: { components: 'workspace:*' },
    })
    writePackage('packages/app', {
      name: 'app',
      version: '1.0.0',
      private: true,
      peerDependencies: { components: 'workspace:*' },
    })
    writePackage('packages/login', {
      name: 'login',
      version: '1.0.0',
      dependencies: { components: 'workspace:*' },
    })
    const nav = createMockPackageInfo({
      name: 'nav',
      path: join(cwd, 'packages/nav'),
    })

    expect(findStale({
      bumpedPackages: [components],
      publishedPackages: [components, nav],
    })).toEqual([])
  })

  it('Then ignores the packages not bumped and the specifiers that are not ranges', () => {
    writePackage('packages/nav', {
      name: 'nav',
      version: '1.2.0',
      peerDependencies: { components: 'catalog:', theme: 'workspace:*' },
    })

    expect(findStale({
      bumpedPackages: [components],
      publishedPackages: [components],
    })).toEqual([])
    expect(findStale({
      bumpedPackages: [
        { ...components, newVersion: '6.19.1' },
      ],
      publishedPackages: [],
    })).toEqual([])
  })
})

describe('Given describeOutOfRange function', () => {
  it('Then tells which published range rejects the new version', () => {
    expect(describeOutOfRange({
      dependency: 'core',
      field: 'peerDependencies',
      range: '^5.4.0',
      newVersion: '6.0.0',
    }))
      .toBe('the published range of its peer dependency `core` (`^5.4.0`) rejects 6.0.0')
    expect(describeOutOfRange({
      dependency: 'core',
      field: 'devDependencies',
      range: '^5.4.0',
      newVersion: '6.0.0',
    }))
      .toBe('the published range of its dev dependency `core` (`^5.4.0`) rejects 6.0.0')
  })

  it('Then tells when the specifier is not a semver range', () => {
    expect(describeOutOfRange({
      dependency: 'core',
      field: 'dependencies',
      range: null,
      newVersion: '6.0.0',
    }))
      .toBe('the range of its dependency `core` is not a semver range, it cannot accept 6.0.0')
  })
})
