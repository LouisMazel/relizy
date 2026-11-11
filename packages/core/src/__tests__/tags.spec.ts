import { extractVersionFromRepoTag, getIndependentTag, NEW_PACKAGE_MARKER, resolveFromTag, resolveToTag } from '../tags'

vi.mock('../git-refs', async importActual => ({
  ...await importActual<typeof import('../git-refs')>(),
  getCurrentGitRef: vi.fn(() => 'feature-branch'),
  getFirstCommit: vi.fn(() => 'FIRST_COMMIT'),
  listTags: vi.fn(() => Promise.resolve([])),
}))

describe('Given getIndependentTag function', () => {
  it('Then names the tag of a package with its version', () => {
    expect(getIndependentTag({ name: '@scope/pkg', version: '1.2.3' })).toBe('@scope/pkg@1.2.3')
  })
})

describe('Given resolveToTag function', () => {
  const options = {
    cwd: '/repo',
    independent: false,
    untagged: false,
    tagBody: 'v{{newVersion}}',
  }

  it('Then ends at the current ref while the release is not tagged', () => {
    expect(resolveToTag({ ...options, untagged: true, newVersion: '1.1.0' })).toBe('feature-branch')
    expect(resolveToTag({ ...options, independent: true, untagged: true })).toBe('feature-branch')
  })

  it('Then ends at the tag of the repository from the template', () => {
    expect(resolveToTag({ ...options, newVersion: '1.1.0' })).toBe('v1.1.0')
    expect(resolveToTag({ ...options, tagBody: 'release-{{newVersion}}', newVersion: '1.1.0' })).toBe('release-1.1.0')
  })

  it('Then ends at the current ref without version for a repository tag', () => {
    expect(resolveToTag(options)).toBe('feature-branch')
  })

  it('Then ends at the tag of the package when the packages are tagged independently', () => {
    expect(resolveToTag({
      ...options,
      independent: true,
      packageName: 'pkg-a',
      newVersion: '2.0.0',
    })).toBe('pkg-a@2.0.0')
  })

  it('Then throws without the package or the version of an independent tag', () => {
    expect(() => resolveToTag({ ...options, independent: true, newVersion: '2.0.0' })).toThrow('Package name is required for independent version mode')
    expect(() => resolveToTag({ ...options, independent: true, packageName: 'pkg-a' })).toThrow('New version is required for independent version mode')
  })
})

describe('Given resolveFromTag function', () => {
  const pkg = {
    name: 'pkg-a',
    version: '1.0.0',
    private: false,
    path: '/repo/packages/pkg-a',
  }

  it('Then marks a package without tag as new when the packages are tagged independently', async () => {
    expect(await resolveFromTag({
      cwd: '/repo',
      pkg: { ...pkg, path: '' },
      independent: true,
      graduating: false,
    })).toBe(NEW_PACKAGE_MARKER)
  })

  it('Then throws without the name of the package when the packages are tagged independently', async () => {
    await expect(resolveFromTag({
      cwd: '/repo',
      pkg: { ...pkg, name: '' },
      independent: true,
      graduating: false,
    })).rejects.toThrow('Package name is required for independent version mode')
  })

  it('Then marks a sub-package as new and starts the root at the first commit when the repository has no tag', async () => {
    expect(await resolveFromTag({
      cwd: '/repo',
      pkg,
      independent: false,
      graduating: false,
    })).toBe(NEW_PACKAGE_MARKER)
    expect(await resolveFromTag({
      cwd: '/repo',
      pkg: { ...pkg, path: '/repo' },
      independent: false,
      graduating: false,
    })).toBe('FIRST_COMMIT')
  })
})

describe('Given extractVersionFromRepoTag function', () => {
  describe('When the tag follows the template', () => {
    it('Then returns its version, prereleases included', () => {
      expect(extractVersionFromRepoTag('v6.18.0', 'v{{newVersion}}')).toBe('6.18.0')
      expect(extractVersionFromRepoTag('v7.0.0-beta.1', 'v{{newVersion}}')).toBe('7.0.0-beta.1')
      expect(extractVersionFromRepoTag('release-1.2.3-final', 'release-{{newVersion}}-final')).toBe('1.2.3')
      expect(extractVersionFromRepoTag('1.2.3', '{{newVersion}}')).toBe('1.2.3')
    })
  })

  describe('When the tag does not follow the template', () => {
    it('Then returns null', () => {
      expect(extractVersionFromRepoTag('@scope/pkg@1.2.3', 'v{{newVersion}}')).toBeNull()
      expect(extractVersionFromRepoTag('pkg@1.2.3', '{{newVersion}}')).toBeNull()
      expect(extractVersionFromRepoTag('v-next@1.2.3', 'v{{newVersion}}')).toBeNull()
      expect(extractVersionFromRepoTag('vue-utils@1.2.3', 'v{{newVersion}}')).toBeNull()
      expect(extractVersionFromRepoTag('v', 'v{{newVersion}}')).toBeNull()
      expect(extractVersionFromRepoTag('vv1.2.3', 'v{{newVersion}}')).toBeNull()
      expect(extractVersionFromRepoTag('v1.2.3', '{{newVersion}}')).toBeNull()
      expect(extractVersionFromRepoTag('=1.2.3', '{{newVersion}}')).toBeNull()
      expect(extractVersionFromRepoTag('v1.2', 'v{{newVersion}}')).toBeNull()
      expect(extractVersionFromRepoTag('release-1.2.3', 'release-{{newVersion}}-final')).toBeNull()
    })
  })

  describe('When the template has no version placeholder', () => {
    it('Then returns null', () => {
      expect(extractVersionFromRepoTag('v1.2.3', 'latest')).toBeNull()
    })
  })
})
