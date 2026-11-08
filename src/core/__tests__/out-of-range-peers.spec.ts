import type { VersionChange } from '../dependencies'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMockConfig } from '../../../tests/mocks'
import { getOutOfRangePeers, isBreakingVersionChange } from '../dependencies'
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

describe('Given readWorkspacePackages function without monorepo', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-standalone-'))
    mkdirSync(join(cwd, 'src'))
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'standalone', version: '1.0.0' }))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('Then only reads the root package', () => {
    const config = createMockConfig({
      bump: { type: 'release' },
    })
    config.cwd = cwd
    delete (config as Partial<typeof config>).monorepo

    expect([
      ...readWorkspacePackages(config).keys(),
    ]).toEqual(['standalone'])
  })
})
