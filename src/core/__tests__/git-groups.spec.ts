import type { BumpResultTruthy, GroupBumpResult } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import { execSync } from 'node:child_process'
import { execPromise } from '@maz-ui/node'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { createCommitAndTags, getReleaseTagNames, getReleaseTags } from '../git'
import { readPackageJson } from '../repo'

vi.mock('node:child_process')

vi.mock('../repo', () => ({
  readPackageJson: vi.fn(),
  hasLernaJson: vi.fn(() => false),
}))

vi.mock('../utils', () => ({
  executeHook: vi.fn(),
}))

function bumpedPackage(name: string, newVersion: string): BumpResultTruthy['bumpedPackages'][number] {
  return { ...createMockPackageInfo({ name, newVersion }), oldVersion: '1.0.0' }
}

const mainGroup: GroupBumpResult = {
  name: 'main',
  versionMode: 'selective',
  bumped: true,
  newVersion: '7.0.0',
  oldVersion: '6.19.1',
  bumpedPackages: [bumpedPackage('@scope/components', '7.0.0'), bumpedPackage('@scope/theme', '7.0.0')],
}

const headerGroup: GroupBumpResult = {
  name: 'header',
  versionMode: 'independent',
  bumped: true,
  bumpedPackages: [bumpedPackage('@scope/nav', '1.2.1'), bumpedPackage('@scope/login', '2.0.0')],
}

function createGroupsConfig(): ResolvedRelizyConfig {
  const config = createMockConfig({ bump: { type: 'release' } })
  config.monorepo = {
    groups: [
      { name: 'main', versionMode: 'selective', packages: ['packages/*'] },
      { name: 'header', versionMode: 'independent', packages: ['shared/*'] },
    ],
  }
  config.templates = { ...config.templates, commitMessage: undefined, commitBody: undefined, tagBody: 'v{{newVersion}}', tagMessage: 'Bump version to {{newVersion}}' }
  config.signTags = false
  return config
}

function getExecutedCommands(): string[] {
  return vi.mocked(execPromise).mock.calls.map(([command]) => command as string)
}

describe('Given the release tags of version groups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readPackageJson).mockReturnValue({ name: 'root', version: '6.19.1', path: '/project', private: true })
  })

  it('Then returns the repository tag of the selective group and the package tags of the independent group', () => {
    expect(getReleaseTags({ config: createGroupsConfig(), groups: [mainGroup, headerGroup] })).toEqual([
      { name: 'v7.0.0', version: '7.0.0' },
      { name: '@scope/nav@1.2.1', version: '1.2.1' },
      { name: '@scope/login@2.0.0', version: '2.0.0' },
    ])
  })

  it('Then only returns the tags of the groups that bumped', () => {
    expect(getReleaseTagNames({ config: createGroupsConfig(), groups: [headerGroup] })).toEqual(['@scope/nav@1.2.1', '@scope/login@2.0.0'])
  })

  it('Then follows templates.tagBody for the repository tag', () => {
    const config = createGroupsConfig()
    config.templates.tagBody = 'release-{{newVersion}}'

    expect(getReleaseTagNames({ config, groups: [mainGroup] })).toEqual(['release-7.0.0'])
  })

  it('Then skips the packages without new version', () => {
    const group: GroupBumpResult = { ...headerGroup, bumpedPackages: [{ ...bumpedPackage('@scope/nav', '1.2.1'), newVersion: undefined }] }

    expect(getReleaseTagNames({ config: createGroupsConfig(), groups: [group] })).toEqual([])
  })

  it('Then returns no tag with --no-git-tag', () => {
    const config = createGroupsConfig()
    config.release.gitTag = false

    expect(getReleaseTagNames({ config, groups: [mainGroup, headerGroup] })).toEqual([])
  })
})

describe('Given createCommitAndTags function with version groups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readPackageJson).mockReturnValue({ name: 'root', version: '7.0.0', path: '/project', private: true })
    vi.mocked(execSync).mockReturnValue('')
    vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' } as any)
  })

  function commit(groups: GroupBumpResult[], config = createGroupsConfig()) {
    return createCommitAndTags({
      config,
      noVerify: false,
      bumpedPackages: groups.flatMap(group => group.bumpedPackages),
      newVersion: groups.find(group => group.versionMode !== 'independent')?.newVersion,
      groups,
      dryRun: false,
      logLevel: 'silent',
    })
  }

  it('Then creates a single commit with the version of the selective group and the bumped packages in the body', async () => {
    await commit([mainGroup, headerGroup])

    const commitCommands = getExecutedCommands().filter(command => command.startsWith('git commit'))

    expect(commitCommands).toEqual([
      'git commit -m "chore(release): bump version to 7.0.0" -m "@scope/components@7.0.0, @scope/theme@7.0.0, @scope/nav@1.2.1, @scope/login@2.0.0"',
    ])
  })

  it('Then creates the tags of every group', async () => {
    const tags = await commit([mainGroup, headerGroup])

    expect(tags).toEqual(['v7.0.0', '@scope/nav@1.2.1', '@scope/login@2.0.0'])
    expect(getExecutedCommands()).toEqual(expect.arrayContaining([
      'git tag  -a v7.0.0 -m "Bump version to 7.0.0"',
      'git tag  -a @scope/nav@1.2.1 -m "Bump version to 1.2.1"',
      'git tag  -a @scope/login@2.0.0 -m "Bump version to 2.0.0"',
    ]))
  })

  it('Then uses the independent title when only an independent group bumped', async () => {
    await commit([headerGroup])

    expect(getExecutedCommands().find(command => command.startsWith('git commit'))).toBe(
      'git commit -m "chore(release): bump 2 packages" -m "@scope/nav@1.2.1, @scope/login@2.0.0"',
    )
  })

  it('Then has no body when only the selective group bumped', async () => {
    await commit([mainGroup])

    expect(getExecutedCommands().find(command => command.startsWith('git commit'))).toBe(
      'git commit -m "chore(release): bump version to 7.0.0"',
    )
  })

  it('Then keeps the commit templates set by the user', async () => {
    const config = createGroupsConfig()
    config.templates.commitMessage = 'release: {{packageNames}}'

    await commit([mainGroup, headerGroup], config)

    expect(getExecutedCommands().find(command => command.startsWith('git commit'))).toBe(
      'git commit -m "release: @scope/components, @scope/theme, @scope/nav, @scope/login"',
    )
  })

  it('Then keeps a commit body set by the user', async () => {
    const config = createGroupsConfig()
    config.templates.commitBody = 'Root: {{rootVersion}}'

    await commit([headerGroup], config)

    expect(getExecutedCommands().find(command => command.startsWith('git commit'))).toBe(
      'git commit -m "chore(release): bump 2 packages" -m "Root: 7.0.0"',
    )
  })
})
