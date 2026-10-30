import { getDependencyReleaseType } from '../repo'

describe('Given getDependencyReleaseType function', () => {
  it('Then bumps a patch for a stable release', () => {
    expect(getDependencyReleaseType('1.2.0', 'release')).toBe('patch')
    expect(getDependencyReleaseType('1.2.0', 'major')).toBe('patch')
  })

  it('Then bumps the prerelease of a package already in prerelease', () => {
    expect(getDependencyReleaseType('1.2.0-beta.1', 'prerelease')).toBe('prerelease')
  })

  it('Then starts a prepatch for a package leaving a stable version', () => {
    expect(getDependencyReleaseType('1.2.0', 'prerelease')).toBe('prepatch')
  })
})
