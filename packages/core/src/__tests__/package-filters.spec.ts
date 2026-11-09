import type { PackageBase } from '../types'
import { filterOutPrivatePackages, filterPrivatePackagesUnlessIncluded, isBumpedPackage } from '../package-filters'

function createMockPackageInfo(overrides?: Partial<PackageBase>): PackageBase {
  return {
    name: 'pkg-a',
    path: '/packages/pkg-a',
    version: '1.0.0',
    private: false,
    newVersion: '1.0.1',
    dependencies: [],
    dependencyChain: [],
    reason: 'commits',
    fromTag: 'v1.0.0',
    commits: [],
    ...overrides,
  }
}

describe('Given isBumpedPackage function', () => {
  describe('When package has oldVersion property', () => {
    it('Then returns true for package with oldVersion', () => {
      const pkg = {
        ...createMockPackageInfo(),
        oldVersion: '1.0.0',
      }

      expect(isBumpedPackage(pkg)).toBe(true)
    })

    it('Then returns true for package with empty string oldVersion', () => {
      const pkg = {
        ...createMockPackageInfo(),
        oldVersion: '',
      }

      expect(isBumpedPackage(pkg)).toBe(false)
    })
  })

  describe('When package does not have oldVersion property', () => {
    it('Then returns false', () => {
      const pkg = createMockPackageInfo()
      delete (pkg as any).oldVersion

      expect(isBumpedPackage(pkg)).toBe(false)
    })
  })
})

describe('Given filterOutPrivatePackages function', () => {
  describe('When called with a mix of private and public packages', () => {
    it('Then returns only the public packages', () => {
      const packages = [
        { name: 'a', private: false },
        { name: 'b', private: true },
        { name: 'c', private: false },
      ]
      const result = filterOutPrivatePackages(packages)
      expect(result).toEqual([
        { name: 'a', private: false },
        { name: 'c', private: false },
      ])
    })
  })

  describe('When called with an empty array', () => {
    it('Then returns an empty array', () => {
      expect(filterOutPrivatePackages([])).toEqual([])
    })
  })

  describe('When called with only private packages', () => {
    it('Then returns an empty array', () => {
      const packages = [
        { name: 'a', private: true },
        { name: 'b', private: true },
      ]
      expect(filterOutPrivatePackages(packages)).toEqual([])
    })
  })

  describe('When called with only public packages', () => {
    it('Then returns all of them unchanged', () => {
      const packages = [
        { name: 'a', private: false },
        { name: 'b', private: false },
      ]
      expect(filterOutPrivatePackages(packages)).toEqual(packages)
    })
  })
})

describe('Given filterPrivatePackagesUnlessIncluded function', () => {
  const packages = [
    { name: 'a', private: false },
    { name: 'b', private: true },
  ]

  describe('When privatePackages is release', () => {
    it('Then keeps private packages', () => {
      expect(filterPrivatePackagesUnlessIncluded(packages, 'release')).toEqual(packages)
    })
  })

  describe('When privatePackages is ignore or not set', () => {
    it('Then removes private packages', () => {
      expect(filterPrivatePackagesUnlessIncluded(packages, 'ignore')).toEqual([
        { name: 'a', private: false },
      ])
      expect(filterPrivatePackagesUnlessIncluded(packages, undefined)).toEqual([
        { name: 'a', private: false },
      ])
    })
  })
})
