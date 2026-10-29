import type { BumpResultTruthy, GroupBumpResult, VersionGroup } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import {
  assertVersionGroupsOption,
  assignPackagesToGroups,
  getGroupBumpResult,
  getMonorepoPackagePatterns,
  getRootGroupBumpResult,
  getVersionGroupName,
  hasRepositoryVersion,
  hasVersionGroups,
  markVersionGroupConfig,
  mergeGroupBumpResults,
  resolveVersionGroups,
  validateVersionGroups,
} from '../groups'

const MAIN_GROUP: VersionGroup = { name: 'main', versionMode: 'selective', packages: ['packages/*', 'shared/*'] }
const HEADER_GROUP: VersionGroup = { name: 'header', versionMode: 'independent', packages: ['shared/nav', 'shared/login'] }

function createGroupsConfig(groups: VersionGroup[], cwd = '/project'): ResolvedRelizyConfig {
  const config = createMockConfig({ bump: { type: 'release' } })
  config.cwd = cwd
  config.monorepo = { groups }
  return config
}

function bumpedPackage(name: string, newVersion: string) {
  return { ...createMockPackageInfo({ name, newVersion }), oldVersion: '1.0.0' }
}

describe('Given validateVersionGroups function', () => {
  describe('When the config has no groups', () => {
    it('Then accepts it', () => {
      expect(() => validateVersionGroups(createMockConfig({ bump: { type: 'release' } }))).not.toThrow()
    })

    it('Then accepts a config without monorepo', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      delete (config as Partial<ResolvedRelizyConfig>).monorepo

      expect(() => validateVersionGroups(config)).not.toThrow()
    })
  })

  describe('When the groups are valid', () => {
    it('Then accepts a selective group with an independent one', () => {
      expect(() => validateVersionGroups(createGroupsConfig([MAIN_GROUP, HEADER_GROUP]))).not.toThrow()
    })

    it('Then accepts several independent groups', () => {
      const config = createGroupsConfig([HEADER_GROUP, { ...HEADER_GROUP, name: 'other' }])

      expect(() => validateVersionGroups(config)).not.toThrow()
    })
  })

  describe('When the groups are invalid', () => {
    it('Then rejects an empty array', () => {
      expect(() => validateVersionGroups(createGroupsConfig([]))).toThrow('monorepo.groups must be a non-empty array')
    })

    it('Then rejects monorepo.versionMode set with groups', () => {
      const config = createGroupsConfig([MAIN_GROUP])
      config.monorepo!.versionMode = 'selective'

      expect(() => validateVersionGroups(config)).toThrow('monorepo.versionMode and monorepo.packages cannot be used with monorepo.groups')
    })

    it('Then rejects monorepo.packages set with groups', () => {
      const config = createGroupsConfig([MAIN_GROUP])
      config.monorepo!.packages = ['packages/*']

      expect(() => validateVersionGroups(config)).toThrow('cannot be used with monorepo.groups')
    })

    it('Then rejects a group without name', () => {
      const config = createGroupsConfig([{ ...MAIN_GROUP, name: '' }])

      expect(() => validateVersionGroups(config)).toThrow('needs a name')
    })

    it('Then rejects a group defined twice', () => {
      const config = createGroupsConfig([HEADER_GROUP, HEADER_GROUP])

      expect(() => validateVersionGroups(config)).toThrow('Version group "header" is defined twice')
    })

    it('Then rejects an invalid version mode', () => {
      const config = createGroupsConfig([{ ...MAIN_GROUP, versionMode: 'fixed' as any }])

      expect(() => validateVersionGroups(config)).toThrow('invalid versionMode "fixed"')
    })

    it('Then rejects a group without packages', () => {
      const config = createGroupsConfig([{ ...MAIN_GROUP, packages: [] }])

      expect(() => validateVersionGroups(config)).toThrow('Version group "main" needs at least one pattern')
    })

    it('Then rejects two groups owning the root version', () => {
      const config = createGroupsConfig([MAIN_GROUP, { ...MAIN_GROUP, name: 'other', versionMode: 'unified' }])

      expect(() => validateVersionGroups(config)).toThrow('Only one version group can use the unified or selective mode (found main, other)')
    })
  })
})

describe('Given the version groups of a workspace', () => {
  let cwd: string

  function createPackage(path: string, name: string) {
    mkdirSync(join(cwd, path), { recursive: true })
    writeFileSync(join(cwd, path, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    cwd = mkdtempSync(join(tmpdir(), 'relizy-groups-'))
    createPackage('packages/components', '@scope/components')
    createPackage('packages/theme', '@scope/theme')
    createPackage('shared/nav', '@scope/nav')
    createPackage('shared/login', '@scope/login')
    createPackage('shared/utils', '@scope/utils')
    // A directory without package.json is not a package
    mkdirSync(join(cwd, 'shared/assets'), { recursive: true })
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  describe('When assigning the packages to the groups', () => {
    it('Then assigns each package to the only group matching it', () => {
      const groups = assignPackagesToGroups({
        cwd,
        groups: [
          { name: 'main', versionMode: 'selective', packages: ['packages/*'] },
          { name: 'header', versionMode: 'independent', packages: ['shared/*'] },
        ],
      })

      expect(groups.get('main')).toEqual(['packages/components', 'packages/theme'])
      expect(groups.get('header')).toEqual(['shared/login', 'shared/nav', 'shared/utils'])
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('Then gives a package matched by a glob and an exact path to the group of the exact path, with a warning', () => {
      const groups = assignPackagesToGroups({ cwd, groups: [MAIN_GROUP, HEADER_GROUP] })

      expect(groups.get('main')).toEqual(['packages/components', 'packages/theme', 'shared/utils'])
      expect(groups.get('header')).toEqual(['shared/login', 'shared/nav'])
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Package "shared/nav" is matched by several version groups (main, header): assigned to "header"'))
    })

    it('Then warns once per run about the same overlap', () => {
      assignPackagesToGroups({ cwd, groups: [MAIN_GROUP, HEADER_GROUP] })
      assignPackagesToGroups({ cwd, groups: [MAIN_GROUP, HEADER_GROUP] })

      expect(vi.mocked(logger.warn).mock.calls.filter(([message]) => String(message).includes('"shared/nav"'))).toHaveLength(1)
    })

    it('Then recognizes an exact path written with ./ or a trailing slash', () => {
      const groups = assignPackagesToGroups({
        cwd,
        groups: [MAIN_GROUP, { name: 'header', versionMode: 'independent', packages: ['./shared/nav/'] }],
      })

      expect(groups.get('header')).toEqual(['shared/nav'])
    })

    it('Then does not count a package matched twice by the same group as an overlap', () => {
      const groups = assignPackagesToGroups({
        cwd,
        groups: [{ name: 'main', versionMode: 'selective', packages: ['shared/*', 'shared/nav'] }],
      })

      expect(groups.get('main')).toEqual(['shared/login', 'shared/nav', 'shared/utils'])
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('Then does not match the packages ignored by a group', () => {
      const groups = assignPackagesToGroups({
        cwd,
        groups: [
          { name: 'main', versionMode: 'selective', packages: ['shared/*'], ignored: ['shared/n*'] },
          { name: 'header', versionMode: 'independent', packages: ['shared/n*'] },
        ],
      })

      expect(groups.get('main')).toEqual(['shared/login', 'shared/utils'])
      expect(groups.get('header')).toEqual(['shared/nav'])
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('Then does not match the packages ignored globally', () => {
      const groups = assignPackagesToGroups({ cwd, groups: [MAIN_GROUP], ignored: ['packages/theme'] })

      expect(groups.get('main')).toEqual(['packages/components', 'shared/login', 'shared/nav', 'shared/utils'])
    })

    it('Then throws when two globs match the same package', () => {
      expect(() => assignPackagesToGroups({
        cwd,
        groups: [
          { name: 'main', versionMode: 'selective', packages: ['shared/*'] },
          { name: 'header', versionMode: 'independent', packages: ['shared/n*'] },
        ],
      })).toThrow('Package "shared/nav" is matched by several version groups (main, header)')
    })

    it('Then throws when two groups list the same exact path', () => {
      expect(() => assignPackagesToGroups({
        cwd,
        groups: [
          { name: 'header', versionMode: 'independent', packages: ['shared/nav'] },
          { name: 'other', versionMode: 'independent', packages: ['shared/nav'] },
        ],
      })).toThrow('matched by several version groups (header, other)')
    })
  })

  describe('When resolving the groups', () => {
    it('Then derives a config per group, in declaration order', () => {
      const config = createGroupsConfig([MAIN_GROUP, HEADER_GROUP], cwd)

      const [main, header] = resolveVersionGroups({ config })

      expect(main!.group).toBe(MAIN_GROUP)
      expect(main!.config.monorepo).toEqual(expect.objectContaining({ versionMode: 'selective', packages: ['packages/*', 'shared/*'] }))
      expect(main!.packagePaths).toEqual(['packages/components', 'packages/theme', 'shared/utils'])
      expect(header!.config.monorepo).toEqual(expect.objectContaining({ versionMode: 'independent', packages: ['shared/nav', 'shared/login'] }))
      expect(header!.packagePaths).toEqual(['shared/login', 'shared/nav'])
    })

    it('Then ignores the packages of the other groups in each group', () => {
      const config = createGroupsConfig([MAIN_GROUP, HEADER_GROUP], cwd)
      config.monorepo!.ignored = ['packages/legacy']

      const [main, header] = resolveVersionGroups({ config })

      expect(main!.config.monorepo!.ignored).toEqual(['packages/legacy', 'shared/login', 'shared/nav'])
      expect(header!.config.monorepo!.ignored).toEqual(['packages/legacy', 'packages/components', 'packages/theme', 'shared/utils'])
    })

    it('Then adds the ignored patterns of the group', () => {
      const config = createGroupsConfig([{ ...MAIN_GROUP, ignored: ['packages/theme'] }, HEADER_GROUP], cwd)

      const [main] = resolveVersionGroups({ config })

      expect(main!.config.monorepo!.ignored).toEqual(['packages/theme', 'shared/login', 'shared/nav'])
    })

    it('Then escapes the glob characters of the ignored paths', () => {
      createPackage('shared/nav(v2)', '@scope/nav-v2')
      const config = createGroupsConfig([MAIN_GROUP, { ...HEADER_GROUP, packages: ['shared/nav\\(v2\\)'] }], cwd)

      const [main, header] = resolveVersionGroups({ config })

      expect(header!.packagePaths).toEqual(['shared/nav(v2)'])
      expect(main!.config.monorepo!.ignored).toEqual(['shared/nav\\(v2\\)'])
    })

    it('Then keeps the global monorepo options', () => {
      const config = createGroupsConfig([MAIN_GROUP, HEADER_GROUP], cwd)
      config.monorepo!.includePrivates = true
      config.monorepo!.ignorePackageNames = ['@scope/legacy']

      const [main] = resolveVersionGroups({ config })

      expect(main!.config.monorepo).toEqual(expect.objectContaining({ includePrivates: true, ignorePackageNames: ['@scope/legacy'] }))
      expect(main!.config.monorepo!.groups).toBeUndefined()
    })

    it('Then overrides the bump and changelog options with the ones of the group', () => {
      const config = createGroupsConfig([MAIN_GROUP, { ...HEADER_GROUP, bump: { capZeroMajor: false }, changelog: { rootChangelog: false } }], cwd)

      const [main, header] = resolveVersionGroups({ config })

      expect(main!.config.bump.capZeroMajor).toBe(true)
      expect(main!.config.changelog.rootChangelog).toBe(true)
      expect(header!.config.bump).toEqual(expect.objectContaining({ capZeroMajor: false, type: 'release' }))
      expect(header!.config.changelog).toEqual(expect.objectContaining({ rootChangelog: false, includeCommitBody: true }))
    })

    it('Then marks the derived configs with the name of their group', () => {
      const config = createGroupsConfig([MAIN_GROUP, HEADER_GROUP], cwd)

      const [main, header] = resolveVersionGroups({ config })

      expect(getVersionGroupName(main!.config)).toBe('main')
      expect(getVersionGroupName(header!.config)).toBe('header')
      expect(getVersionGroupName(config)).toBeUndefined()
      expect(hasVersionGroups(config)).toBe(true)
      expect(hasVersionGroups(main!.config)).toBe(false)
    })

    it('Then only resolves the targeted groups', () => {
      const config = createGroupsConfig([MAIN_GROUP, HEADER_GROUP], cwd)

      const groups = resolveVersionGroups({ config, only: ['header'] })

      expect(groups.map(({ group }) => group.name)).toEqual(['header'])
      // The packages of the groups not targeted stay out of the targeted one
      expect(groups[0]!.config.monorepo!.ignored).toEqual(['packages/components', 'packages/theme', 'shared/utils'])
    })

    it('Then throws for an unknown group', () => {
      const config = createGroupsConfig([MAIN_GROUP, HEADER_GROUP], cwd)

      expect(() => resolveVersionGroups({ config, only: ['footer'] })).toThrow('Unknown version group "footer" (available: main, header)')
    })
  })
})

describe('Given hasVersionGroups function', () => {
  it('Then is false without groups', () => {
    expect(hasVersionGroups(createMockConfig({ bump: { type: 'release' } }))).toBe(false)
  })

  it('Then is false for a config marked as derived', () => {
    const config = markVersionGroupConfig(createGroupsConfig([MAIN_GROUP]), 'main')

    expect(hasVersionGroups(config)).toBe(false)
  })
})

describe('Given the bump results of the groups', () => {
  const mainResult: BumpResultTruthy = {
    bumped: true,
    oldVersion: '6.19.1',
    newVersion: '7.0.0',
    fromTag: 'v6.19.1',
    rootPackage: { name: 'root', version: '6.19.1', path: '/project', private: true, fromTag: 'v6.19.1', commits: [] },
    bumpedPackages: [bumpedPackage('@scope/components', '7.0.0')],
  }
  const headerResult: BumpResultTruthy = {
    bumped: true,
    bumpedPackages: [bumpedPackage('@scope/nav', '1.2.1')],
  }

  describe('When merging them', () => {
    it('Then returns an empty result when no group bumped', () => {
      expect(mergeGroupBumpResults([
        { group: MAIN_GROUP, result: { bumped: false } },
        { group: HEADER_GROUP, result: { bumped: false } },
      ])).toEqual({ bumped: false })
    })

    it('Then aggregates the packages and takes the version of the unified/selective group', () => {
      const result = mergeGroupBumpResults([
        { group: MAIN_GROUP, result: mainResult },
        { group: HEADER_GROUP, result: headerResult },
      ]) as BumpResultTruthy

      expect(result).toEqual(expect.objectContaining({
        bumped: true,
        oldVersion: '6.19.1',
        newVersion: '7.0.0',
        fromTag: 'v6.19.1',
        rootPackage: mainResult.rootPackage,
      }))
      expect(result.bumpedPackages.map(pkg => pkg.name)).toEqual(['@scope/components', '@scope/nav'])
      expect(result.groups).toEqual([
        { ...mainResult, name: 'main', versionMode: 'selective' },
        { ...headerResult, name: 'header', versionMode: 'independent' },
      ])
    })

    it('Then has no repository version when only an independent group bumped', () => {
      const result = mergeGroupBumpResults([
        { group: MAIN_GROUP, result: { bumped: false } },
        { group: HEADER_GROUP, result: headerResult },
      ]) as BumpResultTruthy

      expect(result.newVersion).toBeUndefined()
      expect(result.rootPackage).toBeUndefined()
      expect(result.groups!.map(group => group.name)).toEqual(['header'])
    })
  })

  describe('When reading the result of a group', () => {
    const groups: GroupBumpResult[] = [{ ...headerResult, name: 'header', versionMode: 'independent' }]

    it('Then returns undefined without bump result', () => {
      expect(getGroupBumpResult(undefined, 'header')).toBeUndefined()
    })

    it('Then returns the result of the group', () => {
      expect(getGroupBumpResult({ ...headerResult, groups }, 'header')).toBe(groups[0])
    })

    it('Then returns null when the group did not bump', () => {
      expect(getGroupBumpResult({ ...headerResult, groups }, 'main')).toBeNull()
    })

    it('Then throws when the bump result has no result per group', () => {
      expect(() => getGroupBumpResult(headerResult, 'header')).toThrow('does not come from a grouped bump')
    })

    it('Then finds the result of the unified/selective group', () => {
      const mainGroup: GroupBumpResult = { ...mainResult, name: 'main', versionMode: 'selective' }

      expect(getRootGroupBumpResult([...groups, mainGroup])).toBe(mainGroup)
      expect(getRootGroupBumpResult(groups)).toBeUndefined()
      expect(getRootGroupBumpResult(undefined)).toBeUndefined()
    })
  })
})

describe('Given getMonorepoPackagePatterns function', () => {
  it('Then returns the packages of every group, without duplicates', () => {
    const config = createGroupsConfig([MAIN_GROUP, HEADER_GROUP, { ...HEADER_GROUP, name: 'other', packages: ['shared/nav', 'apps/*'] }])

    expect(getMonorepoPackagePatterns(config)).toEqual(['packages/*', 'shared/*', 'shared/nav', 'shared/login', 'apps/*'])
  })

  it('Then returns monorepo.packages without groups', () => {
    expect(getMonorepoPackagePatterns(createMockConfig({ bump: { type: 'release' } }))).toEqual(['packages/*'])
  })
})

describe('Given hasRepositoryVersion function', () => {
  it('Then is true in unified and selective modes', () => {
    expect(hasRepositoryVersion(createMockConfig({ bump: { type: 'release' }, monorepo: { versionMode: 'selective' } }))).toBe(true)
    expect(hasRepositoryVersion(createMockConfig({ bump: { type: 'release' }, monorepo: { versionMode: 'unified' } }))).toBe(true)
  })

  it('Then is false in independent mode', () => {
    expect(hasRepositoryVersion(createMockConfig({ bump: { type: 'release' }, monorepo: { versionMode: 'independent' } }))).toBe(false)
  })

  it('Then depends on the unified/selective group in the bump result with groups', () => {
    const config = createGroupsConfig([MAIN_GROUP, HEADER_GROUP])
    const header: GroupBumpResult = { bumped: true, bumpedPackages: [], name: 'header', versionMode: 'independent' }
    const main: GroupBumpResult = { bumped: true, bumpedPackages: [], newVersion: '7.0.0', name: 'main', versionMode: 'selective' }

    expect(hasRepositoryVersion(config, { bumped: true, bumpedPackages: [], groups: [header] })).toBe(false)
    expect(hasRepositoryVersion(config, { bumped: true, bumpedPackages: [], groups: [main, header] })).toBe(true)
  })

  it('Then depends on the configured groups without bump result', () => {
    expect(hasRepositoryVersion(createGroupsConfig([MAIN_GROUP, HEADER_GROUP]))).toBe(true)
    expect(hasRepositoryVersion(createGroupsConfig([HEADER_GROUP]))).toBe(false)
  })
})

describe('Given assertVersionGroupsOption function', () => {
  it('Then accepts no targeted group', () => {
    expect(() => assertVersionGroupsOption({ config: createMockConfig({ bump: { type: 'release' } }) })).not.toThrow()
    expect(() => assertVersionGroupsOption({ config: createMockConfig({ bump: { type: 'release' } }), groups: [] })).not.toThrow()
  })

  it('Then accepts targeted groups with monorepo.groups', () => {
    expect(() => assertVersionGroupsOption({ config: createGroupsConfig([MAIN_GROUP]), groups: ['main'] })).not.toThrow()
  })

  it('Then accepts targeted groups on a config derived for a group', () => {
    const config = markVersionGroupConfig(createMockConfig({ bump: { type: 'release' } }), 'main')

    expect(() => assertVersionGroupsOption({ config, groups: ['main'] })).not.toThrow()
  })

  it('Then throws when targeting groups without monorepo.groups', () => {
    expect(() => assertVersionGroupsOption({ config: createMockConfig({ bump: { type: 'release' } }), groups: ['main'] }))
      .toThrow('Version group(s) main targeted, but the config has no monorepo.groups')
  })
})
