import type { VersionChange } from '@relizy/core'
import type { PackageBase } from '../../types'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMockCommit, createMockConfig } from '../../../tests/mocks'
import { planPackages } from '../bump-plan'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'relizy-out-of-range-dependents-'))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

function writePackage(name: string, content: Record<string, unknown>): string {
  const path = join(cwd, name)
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, 'package.json'), JSON.stringify({ name, ...content }))
  return path
}

describe('Given planPackages function', () => {
  function createPackage(name: string, { version = '1.0.0', dependencies = {}, peerDependencies = {}, commits = 0, breaking = false }: { version?: string, dependencies?: Record<string, string>, peerDependencies?: Record<string, string>, commits?: number, breaking?: boolean } = {}): PackageBase {
    return {
      name,
      version,
      private: false,
      path: writePackage(name, { version, dependencies, peerDependencies }),
      fromTag: `${name}@${version}`,
      dependencies: Object.keys(dependencies),
      commits: Array.from({ length: commits }, () => createMockCommit('feat', 'feat: a feature', { isBreaking: breaking })),
      reason: commits > 0
        ? 'commits'
        : undefined,
    }
  }

  function plan(
    packages: PackageBase[],
    { dependents, externalBumps, versionMode = 'independent', newVersionOverride }: { dependents: 'out-of-range' | 'always', externalBumps?: Map<string, VersionChange>, versionMode?: 'independent' | 'selective', newVersionOverride?: string },
  ) {
    const map = new Map(packages.map(pkg => [pkg.name, pkg]))
    const config = createMockConfig({
      versionMode,
      bump: { dependents },
    })

    planPackages({
      packages: map,
      externalBumps,
      config,
      force: false,
      suffix: undefined,
      newVersionOverride,
    })

    return Object.fromEntries([
      ...map.values(),
    ].filter(pkg => pkg.reason).map(pkg => [pkg.name, pkg.newVersion]))
  }

  describe('When a dependency makes a minor that the range of its dependent accepts', () => {
    const packages = () => [
      createPackage('core', { version: '5.4.0', commits: 1 }),
      createPackage('upgrade', {
        version: '5.3.1',
        dependencies: { core: 'workspace:^' },
      }),
    ]

    it('Then does not release the dependent with out-of-range', () => {
      expect(plan(packages(), { dependents: 'out-of-range' })).toEqual({ core: '5.5.0' })
    })

    it('Then releases a patch of the dependent with always', () => {
      expect(plan(packages(), { dependents: 'always' })).toEqual({ core: '5.5.0', upgrade: '5.3.2' })
    })
  })

  it('Then releases a patch of a dependent whose range rejects a breaking change of its dependency', () => {
    const map = new Map([
      createPackage('core', { version: '5.4.0', commits: 1, breaking: true }),
      createPackage('upgrade', {
        version: '5.3.1',
        dependencies: { core: 'workspace:^' },
      }),
    ].map(pkg => [pkg.name, pkg]))

    planPackages({
      packages: map,
      config: createMockConfig({
        versionMode: 'independent',
        bump: { dependents: 'out-of-range' },
      }),
      force: false,
      suffix: undefined,
    })

    expect(map.get('core')!.newVersion).toBe('6.0.0')
    // A dependency is installed for the dependent: its breaking change does not reach the consumers of the dependent
    expect(map.get('upgrade')).toEqual(expect.objectContaining({
      newVersion: '5.3.2',
      reason: 'dependency',
      outOfRangeDependency: {
        name: 'core',
        field: 'dependencies',
        range: '^5.4.0',
        newVersion: '6.0.0',
      },
    }))
    expect(map.get('upgrade')!.breakingPeerDependency).toBeUndefined()
  })

  it('Then releases the dependents with a workspace:* or catalog: specifier', () => {
    expect(plan([
      createPackage('core', { commits: 1 }),
      createPackage('exact', {
        dependencies: { core: 'workspace:*' },
      }),
      createPackage('catalog', {
        dependencies: { core: 'catalog:' },
      }),
    ], { dependents: 'out-of-range' })).toEqual({ core: '1.1.0', exact: '1.0.1', catalog: '1.0.1' })
  })

  it('Then checks a transitive dependent against the new version of its own dependency', () => {
    expect(plan([
      createPackage('core', { commits: 1 }),
      createPackage('ui', {
        dependencies: { core: 'workspace:*' },
      }),
      createPackage('app', {
        dependencies: { ui: 'workspace:^' },
      }),
      createPackage('admin', {
        dependencies: { ui: 'workspace:*' },
      }),
    ], { dependents: 'out-of-range' })).toEqual({ core: '1.1.0', ui: '1.0.1', admin: '1.0.1' })
  })

  it('Then checks the dependents of a package of another version group', () => {
    const externalBumps = new Map([
      [
        '@maz-ui/node',
        { oldVersion: '5.4.0', newVersion: '5.5.0' },
      ],
    ])
    const upgrade = () => createPackage('@maz-ui/upgrade', {
      version: '5.3.1',
      dependencies: { '@maz-ui/node': 'workspace:^' },
    })

    expect(plan([
      upgrade(),
    ], { dependents: 'out-of-range', externalBumps })).toEqual({})
    expect(plan([
      upgrade(),
    ], {
      dependents: 'out-of-range',
      externalBumps: new Map([
        [
          '@maz-ui/node',
          { oldVersion: '5.4.0', newVersion: '6.0.0' },
        ],
      ]),
    }))
      .toEqual({ '@maz-ui/upgrade': '5.3.2' })
    expect(plan([
      upgrade(),
    ], { dependents: 'always', externalBumps })).toEqual({ '@maz-ui/upgrade': '5.3.2' })
  })

  it('Then bumps a dependent with commits of its own from its commits, whatever the range', () => {
    expect(plan([
      createPackage('core', { commits: 1 }),
      createPackage('ui', {
        dependencies: { core: 'workspace:^' },
        commits: 1,
      }),
    ], { dependents: 'out-of-range' })).toEqual({ core: '1.1.0', ui: '1.1.0' })
  })

  it('Then does not release a package of a selective group whose range accepts the new version of a dependency of another group', () => {
    const externalBumps = new Map([
      [
        'node',
        { oldVersion: '5.4.0', newVersion: '5.5.0' },
      ],
    ])
    const packages = () => [
      createPackage('kit', {
        version: '6.19.1',
        dependencies: { node: 'workspace:^' },
      }),
    ]

    expect(plan(packages(), {
      dependents: 'out-of-range',
      externalBumps,
      versionMode: 'selective',
      newVersionOverride: '6.19.2',
    })).toEqual({})
    expect(plan(packages(), {
      dependents: 'always',
      externalBumps,
      versionMode: 'selective',
      newVersionOverride: '6.19.2',
    })).toEqual({ kit: '6.19.2' })
  })

  it('Then still releases the out-of-range peer dependents, without following their dependents', () => {
    expect(plan([
      createPackage('core', { commits: 1 }),
      createPackage('nav', {
        peerDependencies: { core: 'workspace:*' },
      }),
      createPackage('app', {
        dependencies: { nav: 'workspace:^' },
      }),
    ], { dependents: 'out-of-range' })).toEqual({ core: '1.1.0', nav: '1.0.1' })
  })
})
