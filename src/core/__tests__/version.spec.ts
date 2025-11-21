import { logger } from '@maz-ui/node'
import { createMockCommit, createMockConfig } from '../../../tests/mocks'
import { determineReleaseType, getPackageNewVersion } from '../version'

logger.setLevel('error')

describe('Given getPackageNewVersion function', () => {
  describe('When bumping with stable release types', () => {
    it('Then bumps patch version from stable', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'patch',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('1.0.1')
    })

    it('Then bumps minor version from stable', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'minor',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('1.1.0')
    })

    it('Then bumps major version from stable', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'major',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('2.0.0')
    })

    it('Then bumps patch version from complex version', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '2.5.8',
        releaseType: 'patch',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('2.5.9')
    })

    it('Then bumps minor version and resets patch', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.2.3',
        releaseType: 'minor',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('1.3.0')
    })

    it('Then bumps major version and resets minor and patch', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '3.7.9',
        releaseType: 'major',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('4.0.0')
    })

    it('Then graduates from prerelease to patch', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0-beta.0',
        releaseType: 'patch',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('1.0.0')
    })

    it('Then graduates from prerelease to minor', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0-alpha.5',
        releaseType: 'minor',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('1.0.0')
    })

    it('Then graduates from prerelease to major', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '2.5.0-rc.1',
        releaseType: 'major',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('3.0.0')
    })
  })

  describe('When bumping with prerelease types without suffix', () => {
    it('Then bumps prepatch version from stable', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'prepatch',
        preid: 'alpha',
        suffix: undefined,
      })

      expect(result).toBe('1.0.1-alpha.0')
    })

    it('Then bumps preminor version from stable', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'preminor',
        preid: 'beta',
        suffix: undefined,
      })

      expect(result).toBe('1.1.0-beta.0')
    })

    it('Then bumps premajor version from stable', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'premajor',
        preid: 'rc',
        suffix: undefined,
      })

      expect(result).toBe('2.0.0-rc.0')
    })

    it('Then bumps prerelease version from existing prerelease', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0-alpha.0',
        releaseType: 'prerelease',
        preid: 'alpha',
        suffix: undefined,
      })

      expect(result).toBe('1.0.0-alpha.1')
    })

    it('Then bumps prerelease version multiple times', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0-beta.5',
        releaseType: 'prerelease',
        preid: 'beta',
        suffix: undefined,
      })

      expect(result).toBe('1.0.0-beta.6')
    })

    it('Then bumps prepatch with different preid', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '2.3.4',
        releaseType: 'prepatch',
        preid: 'rc',
        suffix: undefined,
      })

      expect(result).toBe('2.3.5-rc.0')
    })

    it('Then bumps preminor with alpha preid', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '5.2.1',
        releaseType: 'preminor',
        preid: 'alpha',
        suffix: undefined,
      })

      expect(result).toBe('5.3.0-alpha.0')
    })

    it('Then bumps premajor from version with patch', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '3.7.2',
        releaseType: 'premajor',
        preid: 'beta',
        suffix: undefined,
      })

      expect(result).toBe('4.0.0-beta.0')
    })
  })

  describe('When bumping with prerelease types with suffix', () => {
    it('Then bumps prepatch version with custom suffix', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'prepatch',
        preid: 'alpha',
        suffix: '1234',
      })

      expect(result).toBe('1.0.1-alpha.1234')
    })

    it('Then bumps preminor version with custom suffix', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'preminor',
        preid: 'beta',
        suffix: '5678',
      })

      expect(result).toBe('1.1.0-beta.5678')
    })

    it('Then bumps premajor version with custom suffix', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'premajor',
        preid: 'rc',
        suffix: 'abc',
      })

      expect(result).toBe('2.0.0-rc.abc')
    })

    it('Then bumps prerelease version with custom suffix', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0-alpha.0',
        releaseType: 'prerelease',
        preid: 'alpha',
        suffix: '999',
      })

      expect(result).toBe('1.0.0-alpha.999')
    })

    it('Then replaces existing prerelease number with suffix', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0-beta.5',
        releaseType: 'prerelease',
        preid: 'beta',
        suffix: 'xyz',
      })

      expect(result).toBe('1.0.0-beta.xyz')
    })

    it('Then bumps with numeric suffix', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '2.1.0',
        releaseType: 'prepatch',
        preid: 'alpha',
        suffix: '42',
      })

      expect(result).toBe('2.1.1-alpha.42')
    })

    it('Then bumps with alphanumeric suffix', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '3.0.0',
        releaseType: 'preminor',
        preid: 'beta',
        suffix: 'build123',
      })

      expect(result).toBe('3.1.0-beta.build123')
    })
  })

  describe('When bumping from initial versions', () => {
    it('Then bumps from 0.0.0 to patch', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '0.0.0',
        releaseType: 'patch',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('0.0.1')
    })

    it('Then bumps from 0.0.0 to minor', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '0.0.0',
        releaseType: 'minor',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('0.1.0')
    })

    it('Then bumps from 0.0.0 to major', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '0.0.0',
        releaseType: 'major',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('1.0.0')
    })

    it('Then bumps from 0.1.0 to prepatch', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '0.1.0',
        releaseType: 'prepatch',
        preid: 'alpha',
        suffix: undefined,
      })

      expect(result).toBe('0.1.1-alpha.0')
    })

    it('Then bumps from 0.0.1 to preminor', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '0.0.1',
        releaseType: 'preminor',
        preid: 'beta',
        suffix: undefined,
      })

      expect(result).toBe('0.1.0-beta.0')
    })
  })

  describe('When bumping with different preids', () => {
    it('Then changes preid from alpha to beta with prerelease', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0-alpha.0',
        releaseType: 'prerelease',
        preid: 'beta',
        suffix: undefined,
      })

      expect(result).toBe('1.0.0-beta.0')
    })

    it('Then changes preid from beta to rc with prerelease', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0-beta.3',
        releaseType: 'prerelease',
        preid: 'rc',
        suffix: undefined,
      })

      expect(result).toBe('1.0.0-rc.0')
    })

    it('Then changes preid from rc to alpha with prerelease', () => {
      const result = () => getPackageNewVersion({
        name: 'test',
        currentVersion: '2.0.0-rc.1',
        releaseType: 'prerelease',
        preid: 'alpha',
        suffix: undefined,
      })

      expect(result).toThrowError('Unable to bump "test" version "2.0.0-rc.1" to "2.0.0-alpha.0", new version is not greater than current version')
    })
  })

  describe('When suffix is ignored for stable releases', () => {
    it('Then ignores suffix for patch release', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'patch',
        preid: undefined,
        suffix: '1234',
      })

      expect(result).toBe('1.0.1')
    })

    it('Then ignores suffix for minor release', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'minor',
        preid: undefined,
        suffix: 'abc',
      })

      expect(result).toBe('1.1.0')
    })

    it('Then ignores suffix for major release', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'major',
        preid: undefined,
        suffix: 'xyz',
      })

      expect(result).toBe('2.0.0')
    })
  })

  describe('When encountering invalid scenarios', () => {
    it('Then throws error when downgrading preid from beta to alpha', () => {
      const result = () => getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0-beta.0',
        releaseType: 'prerelease',
        preid: 'alpha',
        suffix: undefined,
      })

      expect(result).toThrowError('Unable to bump "test" version "1.0.0-beta.0" to "1.0.0-alpha.0", new version is not greater than current version')
    })

    it('Then throws error when downgrading preid from rc to beta', () => {
      const result = () => getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0-rc.5',
        releaseType: 'prerelease',
        preid: 'beta',
        suffix: undefined,
      })

      expect(result).toThrowError('Unable to bump "test" version "1.0.0-rc.5" to "1.0.0-beta.0", new version is not greater than current version')
    })

    it('Then throws error when downgrading preid from rc to alpha', () => {
      const result = () => getPackageNewVersion({
        name: 'test',
        currentVersion: '2.0.0-rc.0',
        releaseType: 'prerelease',
        preid: 'alpha',
        suffix: undefined,
      })

      expect(result).toThrowError('Unable to bump "test" version "2.0.0-rc.0" to "2.0.0-alpha.0", new version is not greater than current version')
    })
  })

  describe('When bumping complex prerelease scenarios', () => {
    it('Then bumps from stable to prepatch then prerelease', () => {
      const firstBump = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'prepatch',
        preid: 'alpha',
        suffix: undefined,
      })

      expect(firstBump).toBe('1.0.1-alpha.0')

      const secondBump = getPackageNewVersion({
        name: 'test',
        currentVersion: firstBump,
        releaseType: 'prerelease',
        preid: 'alpha',
        suffix: undefined,
      })

      expect(secondBump).toBe('1.0.1-alpha.1')
    })

    it('Then bumps from preminor to prerelease multiple times', () => {
      const firstBump = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'preminor',
        preid: 'beta',
        suffix: undefined,
      })

      expect(firstBump).toBe('1.1.0-beta.0')

      const secondBump = getPackageNewVersion({
        name: 'test',
        currentVersion: firstBump,
        releaseType: 'prerelease',
        preid: 'beta',
        suffix: undefined,
      })

      expect(secondBump).toBe('1.1.0-beta.1')

      const thirdBump = getPackageNewVersion({
        name: 'test',
        currentVersion: secondBump,
        releaseType: 'prerelease',
        preid: 'beta',
        suffix: undefined,
      })

      expect(thirdBump).toBe('1.1.0-beta.2')
    })

    it('Then bumps with suffix then without suffix', () => {
      const firstBump = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'prepatch',
        preid: 'alpha',
        suffix: 'build1',
      })

      expect(firstBump).toBe('1.0.1-alpha.build1')

      const secondBump = () => getPackageNewVersion({
        name: 'test',
        currentVersion: firstBump,
        releaseType: 'prerelease',
        preid: 'alpha',
        suffix: undefined,
      })

      expect(secondBump).toThrowError('Unable to bump "test" version "1.0.1-alpha.build1" to "1.0.1-alpha.0", new version is not greater than current version')

      const thirdBump = getPackageNewVersion({
        name: 'test',
        currentVersion: firstBump,
        releaseType: 'prerelease',
        preid: 'beta',
        suffix: undefined,
      })

      expect(thirdBump).toBe('1.0.1-beta.0')
    })
  })

  describe('When graduating from prerelease to stable', () => {
    it('Then graduates alpha prerelease to patch', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.2.3-alpha.5',
        releaseType: 'patch',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('1.2.3')
    })

    it('Then graduates beta prerelease to minor', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.2.3-beta.2',
        releaseType: 'minor',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('1.3.0')
    })

    it('Then graduates rc prerelease to major', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.2.3-rc.1',
        releaseType: 'major',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('2.0.0')
    })

    it('Then graduates prepatch prerelease directly', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '2.0.1-alpha.0',
        releaseType: 'patch',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('2.0.1')
    })

    it('Then graduates preminor prerelease directly', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '2.1.0-beta.0',
        releaseType: 'minor',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('2.1.0')
    })

    it('Then graduates premajor prerelease directly', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '3.0.0-rc.0',
        releaseType: 'major',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('3.0.0')
    })
  })

  describe('When handling edge cases with versions', () => {
    it('Then bumps high version numbers', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '99.99.99',
        releaseType: 'patch',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('99.99.100')
    })

    it('Then bumps from high minor to next', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.999.0',
        releaseType: 'minor',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('1.1000.0')
    })

    it('Then bumps version with multiple digit numbers', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '10.20.30',
        releaseType: 'patch',
        preid: undefined,
        suffix: undefined,
      })

      expect(result).toBe('10.20.31')
    })

    it('Then bumps prerelease with high number', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0-alpha.99',
        releaseType: 'prerelease',
        preid: 'alpha',
        suffix: undefined,
      })

      expect(result).toBe('1.0.0-alpha.100')
    })
  })

  describe('When using different preid values', () => {
    it('Then creates prepatch with custom preid', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'prepatch',
        preid: 'snapshot',
        suffix: undefined,
      })

      expect(result).toBe('1.0.1-snapshot.0')
    })

    it('Then creates preminor with custom preid', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'preminor',
        preid: 'dev',
        suffix: undefined,
      })

      expect(result).toBe('1.1.0-dev.0')
    })

    it('Then creates premajor with custom preid', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0',
        releaseType: 'premajor',
        preid: 'next',
        suffix: undefined,
      })

      expect(result).toBe('2.0.0-next.0')
    })

    it('Then bumps prerelease with custom preid', () => {
      const result = getPackageNewVersion({
        name: 'test',
        currentVersion: '1.0.0-canary.0',
        releaseType: 'prerelease',
        preid: 'canary',
        suffix: undefined,
      })

      expect(result).toBe('1.0.0-canary.1')
    })
  })
})

describe('Given determineReleaseType function', () => {
  describe('When type is release with stable version', () => {
    it('Then auto-detects minor from feat commits', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'add feature')],
        force: false,
      })

      expect(result).toBe('minor')
    })

    it('Then auto-detects patch from fix commits', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('fix', 'fix bug')],
        force: false,
      })

      expect(result).toBe('patch')
    })

    it('Then auto-detects minor from mixed feat and fix commits', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [
          createMockCommit('feat', 'add feature'),
          createMockCommit('fix', 'fix bug'),
        ],
        force: false,
      })

      expect(result).toBe('minor')
    })

    it('Then returns null when no commits and force is false', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: false,
      })

      expect(result).toBeUndefined()
    })

    it('Then returns null when commits undefined and force is false', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: undefined,
        force: false,
      })

      expect(result).toBeUndefined()
    })

    it('Then returns release when force is true with no commits', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: true,
      })

      expect(result).toBe('release')
    })

    it('Then returns release when force is true with commits', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'add feature')],
        force: true,
      })

      expect(result).toBe('release')
    })
  })

  describe('When type is release with prerelease version', () => {
    it('Then returns release when version is prerelease', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-alpha.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'add feature')],
        force: false,
      })

      expect(result).toBe('release')
    })

    it('Then returns release when version is prerelease with no commits', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-beta.5',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: false,
      })

      expect(result).toBe('release')
    })
  })

  describe('When type is release with preid', () => {
    it('Then throws error when preid is provided', () => {
      const config = createMockConfig({ bump: { type: 'release', preid: 'alpha' } })
      const result = () => determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'add feature')],
        force: false,
      })

      expect(result).toThrowError('You cannot use a "release" type with a "preid", to use a preid you must use a "prerelease" type')
    })

    it('Then throws error when preid is provided with prerelease version', () => {
      const config = createMockConfig({ bump: { type: 'release', preid: 'beta' } })
      const result = () => determineReleaseType({
        currentVersion: '1.0.0-alpha.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: false,
      })

      expect(result).toThrowError('You cannot use a "release" type with a "preid", to use a preid you must use a "prerelease" type')
    })

    it('Then throws error when preid is provided with force', () => {
      const config = createMockConfig({ bump: { type: 'release', preid: 'rc' } })
      const result = () => determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: true,
      })

      expect(result).toThrowError('You cannot use a "release" type with a "preid", to use a preid you must use a "prerelease" type')
    })
  })

  describe('When type is prerelease with stable version', () => {
    it('Then auto-detects preminor from feat commits', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'alpha' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'add feature')],
        force: false,
      })

      expect(result).toBe('preminor')
    })

    it('Then auto-detects prepatch from fix commits', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'beta' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('fix', 'fix bug')],
        force: false,
      })

      expect(result).toBe('prepatch')
    })

    it('Then returns null when no commits and force is false', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'alpha' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: false,
      })

      expect(result).toBeUndefined()
    })

    it('Then returns prerelease when force is true', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'rc' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: true,
      })

      expect(result).toBe('prerelease')
    })
  })

  describe('When type is prerelease with prerelease version same preid', () => {
    it('Then returns prerelease with same preid', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'alpha' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-alpha.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'add feature')],
        force: false,
      })

      expect(result).toBe('prerelease')
    })

    it('Then returns prerelease with same preid and fix commits', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'beta' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-beta.5',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('fix', 'fix bug')],
        force: false,
      })

      expect(result).toBe('prerelease')
    })

    it('Then returns prerelease with same preid and no commits when force', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'rc' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-rc.2',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: true,
      })

      expect(result).toBe('prerelease')
    })

    it('Then returns null with same preid and no commits without force', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'alpha' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-alpha.3',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: false,
      })

      expect(result).toBeUndefined()
    })
  })

  describe('When type is prerelease with prerelease version different preid upgrading', () => {
    it('Then returns preminor when changing from alpha to beta with feat', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'beta' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-alpha.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'add feature')],
        force: false,
      })

      expect(result).toBe('prerelease')
    })

    it('Then returns prepatch when changing from alpha to beta with fix', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'beta' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-alpha.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('fix', 'fix bug')],
        force: false,
      })

      expect(result).toBe('prerelease')
    })

    it('Then returns prepatch when changing from beta to rc with no commits detected', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'rc' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-beta.5',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('chore', 'update deps')],
        force: false,
      })

      expect(result).toBe('prerelease')
    })

    it('Then returns prepatch when changing from beta to beta with no commits detected', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'beta' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-alpha.5',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: false,
      })

      expect(result).toBe('prerelease')
    })

    it('Then returns prerelease when changing preid with force', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'rc' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-beta.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: true,
      })

      expect(result).toBe('prerelease')
    })
  })

  describe('When type is prerelease with prerelease version different preid downgrading', () => {
    it('Then throws error when downgrading from beta to alpha', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'alpha' } })
      const result = () => determineReleaseType({
        currentVersion: '1.0.0-beta.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'add feature')],
        force: false,
      })

      expect(result).toThrowError('Unable to graduate from 1.0.0-beta.0 to 1.0.0-alpha.0, it\'s not a valid prerelease')
    })

    it('Then throws error when downgrading from rc to beta', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'beta' } })
      const result = () => determineReleaseType({
        currentVersion: '1.0.0-rc.3',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('fix', 'fix bug')],
        force: false,
      })

      expect(result).toThrowError('Unable to graduate from 1.0.0-rc.3 to 1.0.0-beta.0, it\'s not a valid prerelease')
    })

    it('Then throws error when downgrading from rc to alpha', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'alpha' } })
      const result = () => determineReleaseType({
        currentVersion: '2.0.0-rc.1',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: false,
      })

      expect(result).toThrowError('Unable to graduate from 2.0.0-rc.1 to 2.0.0-alpha.0, it\'s not a valid prerelease')
    })

    it('Then throws error when downgrading with force', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'alpha' } })
      const result = () => determineReleaseType({
        currentVersion: '1.0.0-beta.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: true,
      })

      expect(result).toThrowError('Unable to graduate from 1.0.0-beta.0 to 1.0.0-alpha.0, it\'s not a valid prerelease')
    })
  })

  describe('When type is explicit stable release type', () => {
    it('Then returns patch regardless of commits', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'add feature')],
        force: false,
      })

      expect(result).toBe('patch')
    })

    it('Then returns minor regardless of commits', () => {
      const config = createMockConfig({ bump: { type: 'minor' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('fix', 'fix bug')],
        force: false,
      })

      expect(result).toBe('minor')
    })

    it('Then returns major regardless of commits', () => {
      const config = createMockConfig({ bump: { type: 'major' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('fix', 'fix bug')],
        force: false,
      })

      expect(result).toBe('major')
    })

    it('Then returns patch with no commits', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: false,
      })

      expect(result).toBe('patch')
    })

    it('Then returns minor when force is true', () => {
      const config = createMockConfig({ bump: { type: 'minor' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: true,
      })

      expect(result).toBe('minor')
    })
  })

  describe('When type is explicit prerelease type', () => {
    it('Then returns prepatch regardless of commits', () => {
      const config = createMockConfig({ bump: { type: 'prepatch', preid: 'alpha' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'add feature')],
        force: false,
      })

      expect(result).toBe('prepatch')
    })

    it('Then returns preminor regardless of commits', () => {
      const config = createMockConfig({ bump: { type: 'preminor', preid: 'beta' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('fix', 'fix bug')],
        force: false,
      })

      expect(result).toBe('preminor')
    })

    it('Then returns premajor regardless of commits', () => {
      const config = createMockConfig({ bump: { type: 'premajor', preid: 'rc' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('chore', 'update')],
        force: false,
      })

      expect(result).toBe('premajor')
    })

    it('Then returns prepatch with no commits', () => {
      const config = createMockConfig({ bump: { type: 'prepatch', preid: 'alpha' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: false,
      })

      expect(result).toBe('prepatch')
    })

    it('Then returns preminor when force is true', () => {
      const config = createMockConfig({ bump: { type: 'preminor', preid: 'beta' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: true,
      })

      expect(result).toBe('preminor')
    })
  })

  describe('When graduating from prerelease to stable', () => {
    it('Then returns patch when graduating from prerelease', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-alpha.5',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'add feature')],
        force: false,
      })

      expect(result).toBe('patch')
    })

    it('Then returns minor when graduating from prerelease', () => {
      const config = createMockConfig({ bump: { type: 'minor' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-beta.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('fix', 'fix bug')],
        force: false,
      })

      expect(result).toBe('minor')
    })

    it('Then returns major when graduating from prerelease', () => {
      const config = createMockConfig({ bump: { type: 'major' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-rc.2',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: false,
      })

      expect(result).toBe('major')
    })

    it('Then returns patch with force when graduating', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const result = determineReleaseType({
        currentVersion: '2.0.0-alpha.1',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: true,
      })

      expect(result).toBe('patch')
    })
  })

  describe('When force flag overrides behavior', () => {
    it('Then overrides release type detection with force', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'major feature')],
        force: true,
      })

      expect(result).toBe('patch')
    })

    it('Then returns configured type when force with no commits', () => {
      const config = createMockConfig({ bump: { type: 'minor' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: true,
      })

      expect(result).toBe('minor')
    })

    it('Then overrides null result with force', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: true,
      })

      expect(result).toBe('release')
    })

    it('Then returns prerelease with force and no commits', () => {
      const config = createMockConfig({ bump: { type: 'prerelease', preid: 'alpha' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0-alpha.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [],
        force: true,
      })

      expect(result).toBe('prerelease')
    })
  })

  describe('When handling edge cases', () => {
    it('Then handles version 0.0.0 with release type', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '0.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('feat', 'initial feature')],
        force: false,
      })

      expect(result).toBe('minor')
    })

    it('Then handles high version numbers', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '99.99.99',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('fix', 'fix bug')],
        force: false,
      })

      expect(result).toBe('patch')
    })

    it('Then handles commits with no conventional type', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('chore', 'update deps')],
        force: false,
      })

      expect(result).toBeUndefined()
    })

    it('Then handles multiple commit types', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [
          createMockCommit('chore', 'update deps'),
          createMockCommit('docs', 'update docs'),
          createMockCommit('fix', 'fix bug'),
        ],
        force: false,
      })

      expect(result).toBe('patch')
    })

    it('Then handles empty commit messages', () => {
      const config = createMockConfig({ bump: { type: 'release' } })
      const result = determineReleaseType({
        currentVersion: '1.0.0',
        preid: config.bump.preid,
        releaseType: config.bump.type,
        types: config.types,
        commits: [createMockCommit('', '')],
        force: false,
      })

      expect(result).toBeUndefined()
    })
  })
})
