import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aggregateIndependentChangelogs, resolveChangelogRange } from '../changelog'
import { getCurrentGitRef, getFirstCommit } from '../git-refs'
import { getNewPackageCompareBase } from '../package-commits'

vi.mock('../git-refs', async importActual => ({
  ...await importActual<typeof import('../git-refs')>(),
  getFirstCommit: vi.fn(),
  getCurrentGitRef: vi.fn(),
}))
vi.mock('../package-commits', async importActual => ({
  ...await importActual<typeof import('../package-commits')>(),
  getNewPackageCompareBase: vi.fn(),
}))

describe('Given aggregateIndependentChangelogs function', () => {
  const date = new Date('2026-11-06T10:00:00Z')

  it('Then joins the changelogs of the packages under a dated title', () => {
    expect(aggregateIndependentChangelogs(['## pkg-a v1.1.0', '', '## pkg-b v2.0.1'], date)).toBe('**Multiple Packages Updated** - 2026-11-06\n\n## pkg-a v1.1.0\n\n## pkg-b v2.0.1')
  })

  it('Then returns undefined when no package has an entry', () => {
    expect(aggregateIndependentChangelogs(['', ''], date)).toBeUndefined()
  })
})

describe('Given resolveChangelogRange function', () => {
  const pkg = { name: 'pkg-a', path: '/repo/packages/a' }
  const options = { cwd: '/repo', newVersion: '1.1.0', tagBody: 'v{{newVersion}}' }

  beforeEach(() => {
    vi.mocked(getFirstCommit).mockReturnValue('first')
    vi.mocked(getCurrentGitRef).mockReturnValue('HEAD')
    vi.mocked(getNewPackageCompareBase).mockReturnValue('parent')
  })

  describe('When the package has a previous tag', () => {
    it('Then reads from the tag to the current ref and shows the tag of the release', () => {
      expect(resolveChangelogRange({
        ...options,
        pkg: { ...pkg, fromTag: 'v1.0.0' },
      })).toEqual({
        gitFromRef: 'v1.0.0',
        gitToRef: 'HEAD',
        displayFromTag: 'v1.0.0',
        displayToTag: 'v1.1.0',
        compareFromRef: 'v1.0.0',
        isFirstCommit: false,
      })
    })

    it('Then lets from and to override the refs', () => {
      const range = resolveChangelogRange({
        ...options,
        pkg: { ...pkg, fromTag: 'v1.0.0' },
        from: 'v0.9.0',
        to: 'v1.0.0',
      })

      expect(range).toMatchObject({ gitFromRef: 'v0.9.0', gitToRef: 'v1.0.0', displayToTag: 'v1.0.0' })
    })
  })

  describe('When the package has no tag', () => {
    it('Then starts at the first commit and shows 0.0.0 as the previous tag', () => {
      expect(resolveChangelogRange({ ...options, pkg })).toMatchObject({
        gitFromRef: 'first',
        displayFromTag: 'v0.0.0',
        compareFromRef: 'v0.0.0',
        isFirstCommit: true,
      })
    })

    it('Then names the tags after the package when independent', () => {
      expect(resolveChangelogRange({ ...options, pkg, independent: true })).toMatchObject({
        displayFromTag: 'pkg-a@0.0.0',
        displayToTag: 'pkg-a@1.1.0',
      })
    })
  })

  describe('When the package is new', () => {
    it('Then never shows the marker and links from the commit preceding the package', () => {
      const logger = {}
      const range = resolveChangelogRange({
        ...options,
        pkg: { ...pkg, fromTag: '__NEW_PACKAGE__' },
        independent: true,
        movedPackages: { old: 'new' },
        logger,
      })

      expect(range).toMatchObject({
        gitFromRef: '__NEW_PACKAGE__',
        displayFromTag: 'pkg-a@0.0.0',
        compareFromRef: 'parent',
        isFirstCommit: false,
      })
      expect(getNewPackageCompareBase).toHaveBeenCalledWith('/repo/packages/a', '/repo', { old: 'new' }, logger)
    })
  })

  describe('When no tag can be built', () => {
    it('Then throws', () => {
      expect(() => resolveChangelogRange({
        ...options,
        pkg: { ...pkg, fromTag: 'v1.0.0' },
        tagBody: '',
      })).toThrow('No tag found for pkg-a')
    })
  })
})
