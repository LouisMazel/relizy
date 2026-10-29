import type { VersionChange } from '../dependencies'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMockConfig } from '../../../tests/mocks'
import { getOutOfRangePeers } from '../dependencies'
import { readWorkspacePackages } from '../workspace'

describe('Given getOutOfRangePeers function', () => {
  let cwd: string
  const bumped = new Map<string, VersionChange>([['components', { oldVersion: '6.19.1', newVersion: '6.20.0' }]])

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

    expect(getOutOfRangePeers({ packagePath: cwd, bumped })).toEqual([{ dependency: 'components', range: '6.19.1', newVersion: '6.20.0' }])
  })

  it('Then follows an alias to the bumped package', () => {
    writePackage({ ui: 'workspace:components@~' })

    expect(getOutOfRangePeers({ packagePath: cwd, bumped: new Map([['components', { oldVersion: '6.19.1', newVersion: '7.0.0' }]]) }))
      .toEqual([{ dependency: 'components', range: '~6.19.1', newVersion: '7.0.0' }])
  })

  it('Then ignores the ranges accepting the new version, the packages not bumped and the specifiers that are not ranges', () => {
    writePackage({ components: 'workspace:^', theme: 'workspace:*', icons: 'catalog:' })

    expect(getOutOfRangePeers({ packagePath: cwd, bumped: new Map([...bumped, ['icons', { oldVersion: '1.0.0', newVersion: '2.0.0' }]]) })).toEqual([])
  })

  it('Then returns nothing without peer dependencies, bumped package or package.json', () => {
    writePackage()

    expect(getOutOfRangePeers({ packagePath: cwd, bumped })).toEqual([])
    expect(getOutOfRangePeers({ packagePath: cwd, bumped: new Map() })).toEqual([])
    expect(getOutOfRangePeers({ packagePath: join(cwd, 'missing'), bumped })).toEqual([])
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
    const config = createMockConfig({ bump: { type: 'release' } })
    config.cwd = cwd
    delete (config as Partial<typeof config>).monorepo

    expect([...readWorkspacePackages(config).keys()]).toEqual(['standalone'])
  })
})
