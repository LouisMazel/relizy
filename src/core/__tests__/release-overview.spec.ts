import type { BumpResultTruthy, GroupBumpResult } from '../../types'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { fillSocialTemplate, fillTemplate, getReleaseLines, getReleaseOverview, getReleaseTag, getReleaseTitle, getSocialTemplateVariables, keepReleaseLines, withoutPrivatePackages } from '../release-overview'

vi.mock('../repo', async importActual => ({
  ...await importActual<typeof import('../repo')>(),
  readPackageJson: vi.fn().mockReturnValue({ name: 'monorepo', version: '6.19.1' }),
}))

function bumped(name: string, oldVersion: string, newVersion: string, fromTag: string, isPrivate = false) {
  return { ...createMockPackageInfo({ name, version: oldVersion, newVersion, fromTag, private: isPrivate }), oldVersion }
}

const components = bumped('@scope/components', '6.19.1', '7.0.0', 'v6.19.1')
const theme = bumped('@scope/theme', '6.19.1', '7.0.0', 'v6.19.1')
const nav = bumped('@scope/nav', '1.2.0', '1.3.0', '@scope/nav@1.2.0')
const login = bumped('@scope/login', '2.0.0', '2.0.1', '@scope/login@2.0.0', true)

const mainGroup: GroupBumpResult = { name: 'main', title: 'Maz UI', versionMode: 'selective', bumped: true, oldVersion: '6.19.1', newVersion: '7.0.0', fromTag: 'v6.19.1', bumpedPackages: [theme, components] }
const headerGroup: GroupBumpResult = { name: 'header', title: 'Header', versionMode: 'independent', bumped: true, bumpedPackages: [nav, login] }

describe('Given getReleaseOverview function', () => {
  describe('When the config has no version groups', () => {
    it('Then has a single group named after the project, with the root version and tag', () => {
      const config = createMockConfig({ bump: { type: 'release' }, monorepo: { versionMode: 'selective' } })
      const bumpResult: BumpResultTruthy = { bumped: true, oldVersion: '6.19.1', newVersion: '7.0.0', fromTag: 'v6.19.1', bumpedPackages: [theme, components] }

      expect(getReleaseOverview({ config, bumpResult })).toEqual({
        projectName: 'monorepo',
        groups: [{
          name: undefined,
          title: 'monorepo',
          versionMode: 'selective',
          version: '7.0.0',
          oldVersion: '6.19.1',
          tag: 'v7.0.0',
          packages: [
            { name: '@scope/components', oldVersion: '6.19.1', newVersion: '7.0.0', tag: 'v7.0.0', private: false },
            { name: '@scope/theme', oldVersion: '6.19.1', newVersion: '7.0.0', tag: 'v7.0.0', private: false },
          ],
        }],
      })
    })

    it('Then gives each package of an independent release its own tag', () => {
      const config = createMockConfig({ bump: { type: 'release' }, projectName: 'My Project', monorepo: { versionMode: 'independent' } })

      const overview = getReleaseOverview({ config, bumpResult: { bumped: true, bumpedPackages: [nav, login] } })

      expect(overview.projectName).toBe('My Project')
      expect(overview.groups[0]!.versionMode).toBe('independent')
      expect(overview.groups[0]!.version).toBeUndefined()
      expect(overview.groups[0]!.packages.map(pkg => pkg.tag)).toEqual(['@scope/login@2.0.1', '@scope/nav@1.3.0'])
    })

    it('Then compares a graduation with the previous stable version', () => {
      const config = createMockConfig({ bump: { type: 'release' }, monorepo: { versionMode: 'independent' } })
      const graduated = bumped('@scope/nav', '1.3.0-beta.2', '1.3.0', '@scope/nav@1.2.0')

      const overview = getReleaseOverview({ config, bumpResult: { bumped: true, bumpedPackages: [graduated] } })

      expect(overview.groups[0]!.packages[0]).toEqual(expect.objectContaining({ oldVersion: '1.2.0', newVersion: '1.3.0' }))
    })
  })

  describe('When the release has version groups', () => {
    it('Then puts the unified/selective group first, each group with its title', () => {
      const config = createMockConfig({ bump: { type: 'release' } })

      const overview = getReleaseOverview({ config, bumpResult: { bumped: true, bumpedPackages: [], groups: [headerGroup, mainGroup] } })

      expect(overview.groups.map(group => [group.name, group.title, group.version])).toEqual([
        ['main', 'Maz UI', '7.0.0'],
        ['header', 'Header', undefined],
      ])
    })
  })
})

describe('Given the version lines of a release', () => {
  const config = createMockConfig({ bump: { type: 'release' } })
  const overview = getReleaseOverview({ config, bumpResult: { bumped: true, bumpedPackages: [], groups: [mainGroup, headerGroup] } })

  it('Then has one line for the unified/selective group and one per package of the independent groups', () => {
    expect(getReleaseLines(overview).map(line => [line.name, line.version, line.tag])).toEqual([
      ['monorepo', '7.0.0', 'v7.0.0'],
      ['@scope/login', '2.0.1', '@scope/login@2.0.1'],
      ['@scope/nav', '1.3.0', '@scope/nav@1.3.0'],
    ])
  })

  it('Then leaves out the private packages, and the independent groups without public package', () => {
    const publicOverview = withoutPrivatePackages(overview)

    expect(getReleaseLines(publicOverview).map(line => line.name)).toEqual(['monorepo', '@scope/nav'])
    expect(withoutPrivatePackages({ ...overview, groups: [{ ...overview.groups[1]!, packages: [overview.groups[1]!.packages[0]!] }] }).groups).toEqual([])
  })

  it('Then titles a single version line after its name and version', () => {
    expect(getReleaseTitle({ ...overview, groups: [overview.groups[0]!] })).toBe('monorepo 7.0.0 is out!')
    expect(getReleaseTitle({ ...overview, groups: [{ ...overview.groups[1]!, packages: [overview.groups[1]!.packages[1]!] }] })).toBe('@scope/nav 1.3.0 is out!')
  })

  it('Then titles several version lines after the project', () => {
    expect(getReleaseTitle(overview)).toBe('New releases of monorepo')
  })
})

describe('Given getSocialTemplateVariables function', () => {
  const config = createMockConfig({ bump: { type: 'release' } })
  const overview = withoutPrivatePackages(getReleaseOverview({ config, bumpResult: { bumped: true, bumpedPackages: [], groups: [mainGroup, headerGroup] } }))

  it('Then describes the release, without version when several are released', () => {
    expect(getSocialTemplateVariables({ overview, changelogUrl: 'https://example.com/changelog' })).toEqual({
      projectName: 'monorepo',
      releaseTitle: 'New releases of monorepo',
      newVersion: '',
      packageList: '@scope/components@7.0.0, @scope/theme@7.0.0, @scope/nav@1.3.0',
      packageCount: '3',
      releaseUrl: undefined,
      changelogUrl: 'https://example.com/changelog',
    })
  })

  it('Then gives the version of a single version line', () => {
    const variables = getSocialTemplateVariables({ overview: { ...overview, groups: [overview.groups[0]!] }, releaseUrl: 'https://example.com/v7.0.0' })

    expect(variables).toEqual(expect.objectContaining({ releaseTitle: 'monorepo 7.0.0 is out!', newVersion: '7.0.0', releaseUrl: 'https://example.com/v7.0.0' }))
  })
})

describe('Given the template helpers', () => {
  it('Then replaces every occurrence and leaves the unknown variables', () => {
    expect(fillTemplate('{{a}} {{a}} {{b}} {{unknown}}', { a: 'x', b: undefined })).toBe('x x  {{unknown}}')
  })

  it('Then removes the URLs not set from a social template', () => {
    const variables = { projectName: 'p', releaseTitle: 'p 1.0.0 is out!', newVersion: '1.0.0', packageList: 'p@1.0.0', packageCount: '1' }

    expect(fillSocialTemplate('{{releaseTitle}} {{releaseUrl}}{{changelogUrl}}{{changelog}}', variables, { changelog: '!' })).toBe('p 1.0.0 is out! !')
  })

  it('Then removes the line of a URL not set, so the post keeps a single blank line', () => {
    const variables = { projectName: 'p', releaseTitle: 'p 1.0.0 is out!', newVersion: '1.0.0', packageList: 'p@1.0.0', packageCount: '1', changelogUrl: 'https://example.com/changelog' }

    expect(fillSocialTemplate('📣 {{releaseTitle}}\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}', variables, { changelog: '- Add a' }))
      .toBe('📣 p 1.0.0 is out!\n\n- Add a\n\nhttps://example.com/changelog')
  })
})

describe('Given the version lines to post', () => {
  const config = createMockConfig({ bump: { type: 'release' } })
  const beta = bumped('@scope/nav', '1.2.0', '1.3.0-beta.0', '@scope/nav@1.2.0')
  const overview = getReleaseOverview({ config, bumpResult: { bumped: true, bumpedPackages: [], groups: [mainGroup, { ...headerGroup, bumpedPackages: [beta, login] }] } })

  it('Then keeps the groups and packages of the kept lines', () => {
    const stable = keepReleaseLines(overview, line => !line.version.includes('-'))

    expect(stable.groups.map(group => [group.name, group.packages.map(pkg => pkg.name)])).toEqual([
      ['main', ['@scope/components', '@scope/theme']],
      ['header', ['@scope/login']],
    ])
    expect(keepReleaseLines(overview, line => line.name === '@scope/login').groups.map(group => group.name)).toEqual(['header'])
  })

  it('Then links the only version line, else the unified/selective group', () => {
    expect(getReleaseTag(overview)).toBe('v7.0.0')
    expect(getReleaseTag(keepReleaseLines(overview, line => line.name === '@scope/login'))).toBe('@scope/login@2.0.1')
    expect(getReleaseTag(keepReleaseLines(overview, line => line.group.versionMode === 'independent'))).toBeUndefined()
  })
})
