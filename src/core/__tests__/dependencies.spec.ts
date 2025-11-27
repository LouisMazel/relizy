import type { PackageBase } from '../../types'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockPackageInfo } from '../../../tests/mocks'
import {
  expandPackagesToBumpWithDependents,
  getDependentsOf,
  getPackageDependencies,
  topologicalSort,
} from '../dependencies'

logger.setLevel('silent')

vi.mock('node:fs')
vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path')
  return {
    ...actual,
    join: vi.fn((...args) => args.join('/')),
  }
})

describe('Given getPackageDependencies function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(join).mockImplementation((...args) => args.join('/'))
  })

  describe('When package.json exists', () => {
    it('Then returns workspace dependencies from dependencies field', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        dependencies: {
          '@workspace/pkg-a': '1.0.0',
          '@workspace/pkg-b': '1.0.0',
          'external-pkg': '1.0.0',
        },
      }))
      const allPackageNames = new Set(['@workspace/pkg-a', '@workspace/pkg-b'])

      const result = getPackageDependencies({
        packagePath: '/packages/test',
        allPackageNames,
        dependencyTypes: ['dependencies'],
      })

      expect(result).toEqual(['@workspace/pkg-a', '@workspace/pkg-b'])
    })

    it('Then returns workspace dependencies from peerDependencies', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        peerDependencies: {
          '@workspace/pkg-a': '1.0.0',
          'react': '18.0.0',
        },
      }))
      const allPackageNames = new Set(['@workspace/pkg-a'])

      const result = getPackageDependencies({
        packagePath: '/packages/test',
        allPackageNames,
        dependencyTypes: ['peerDependencies'],
      })

      expect(result).toEqual(['@workspace/pkg-a'])
    })

    it('Then returns workspace dependencies from devDependencies', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        devDependencies: {
          '@workspace/pkg-a': '1.0.0',
          'vitest': '1.0.0',
        },
      }))
      const allPackageNames = new Set(['@workspace/pkg-a'])

      const result = getPackageDependencies({
        packagePath: '/packages/test',
        allPackageNames,
        dependencyTypes: ['devDependencies'],
      })

      expect(result).toEqual(['@workspace/pkg-a'])
    })

    it('Then combines all dependency types when specified', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { '@workspace/pkg-a': '1.0.0' },
        peerDependencies: { '@workspace/pkg-b': '1.0.0' },
        devDependencies: { '@workspace/pkg-c': '1.0.0' },
      }))
      const allPackageNames = new Set(['@workspace/pkg-a', '@workspace/pkg-b', '@workspace/pkg-c'])

      const result = getPackageDependencies({
        packagePath: '/packages/test',
        allPackageNames,
        dependencyTypes: ['dependencies', 'peerDependencies', 'devDependencies'],
      })

      expect(result).toEqual(['@workspace/pkg-a', '@workspace/pkg-b', '@workspace/pkg-c'])
    })

    it('Then excludes external dependencies', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        dependencies: {
          '@workspace/pkg-a': '1.0.0',
          'lodash': '4.17.21',
          'react': '18.0.0',
        },
      }))
      const allPackageNames = new Set(['@workspace/pkg-a'])

      const result = getPackageDependencies({
        packagePath: '/packages/test',
        allPackageNames,
        dependencyTypes: ['dependencies'],
      })

      expect(result).toEqual(['@workspace/pkg-a'])
      expect(result).not.toContain('lodash')
      expect(result).not.toContain('react')
    })

    it('Then returns empty array when no workspace dependencies', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        dependencies: {
          lodash: '4.17.21',
        },
      }))
      const allPackageNames = new Set(['@workspace/pkg-a'])

      const result = getPackageDependencies({
        packagePath: '/packages/test',
        allPackageNames,
        dependencyTypes: ['dependencies'],
      })

      expect(result).toEqual([])
    })

    it('Then returns empty array when dependency type not included', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        devDependencies: {
          '@workspace/pkg-a': '1.0.0',
        },
      }))
      const allPackageNames = new Set(['@workspace/pkg-a'])

      const result = getPackageDependencies({
        packagePath: '/packages/test',
        allPackageNames,
        dependencyTypes: ['dependencies'],
      })

      expect(result).toEqual([])
    })
  })

  describe('When package.json does not exist', () => {
    it('Then returns empty array', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const allPackageNames = new Set(['@workspace/pkg-a'])

      const result = getPackageDependencies({
        packagePath: '/packages/test',
        allPackageNames,
        dependencyTypes: ['dependencies'],
      })

      expect(result).toEqual([])
    })
  })
})

describe('Given getDependentsOf function', () => {
  describe('When finding dependents', () => {
    it('Then returns packages that depend on given package', () => {
      const allPackages = [
        { name: 'pkg-a', dependencies: ['pkg-b'] },
        { name: 'pkg-b', dependencies: [] },
        { name: 'pkg-c', dependencies: ['pkg-b'] },
      ]

      const result = getDependentsOf({
        allPackages,
        packageName: 'pkg-b',
      })

      expect(result).toHaveLength(2)
      expect(result.map(p => p.name)).toEqual(['pkg-a', 'pkg-c'])
    })

    it('Then returns empty array when no dependents', () => {
      const allPackages = [
        { name: 'pkg-a', dependencies: [] },
        { name: 'pkg-b', dependencies: [] },
      ]

      const result = getDependentsOf({
        allPackages,
        packageName: 'pkg-a',
      })

      expect(result).toHaveLength(0)
    })

    it('Then handles packages with multiple dependencies', () => {
      const allPackages = [
        { name: 'pkg-a', dependencies: ['pkg-b', 'pkg-c'] },
        { name: 'pkg-b', dependencies: [] },
        { name: 'pkg-c', dependencies: [] },
      ]

      const result = getDependentsOf({
        allPackages,
        packageName: 'pkg-b',
      })

      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('pkg-a')
    })

    it('Then excludes package if not a dependent', () => {
      const allPackages = [
        { name: 'pkg-a', dependencies: ['pkg-c'] },
        { name: 'pkg-b', dependencies: [] },
      ]

      const result = getDependentsOf({
        allPackages,
        packageName: 'pkg-b',
      })

      expect(result).toHaveLength(0)
    })
  })
})

describe('Given expandPackagesToBumpWithDependents function', () => {
  describe('When expanding packages with commits', () => {
    it('Then includes original packages with commits', () => {
      const allPackages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
      ]
      const packagesWithCommits: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
      ]

      const result = expandPackagesToBumpWithDependents({
        allPackages,
        packagesWithCommits,
      })

      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('pkg-a')
      expect(result[0]?.reason).toBe('commits')
    })

    it('Then includes direct dependents', () => {
      const allPackages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
        { ...createMockPackageInfo(), name: 'pkg-b', dependencies: ['pkg-a'] },
      ]
      const packagesWithCommits: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
      ]

      const result = expandPackagesToBumpWithDependents({
        allPackages,
        packagesWithCommits,
      })

      expect(result).toHaveLength(2)
      expect(result.map(p => p.name)).toContain('pkg-b')
    })

    it('Then includes transitive dependents', () => {
      const allPackages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
        { ...createMockPackageInfo(), name: 'pkg-b', dependencies: ['pkg-a'] },
        { ...createMockPackageInfo(), name: 'pkg-c', dependencies: ['pkg-b'] },
      ]
      const packagesWithCommits: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
      ]

      const result = expandPackagesToBumpWithDependents({
        allPackages,
        packagesWithCommits,
      })

      expect(result).toHaveLength(3)
      expect(result.map(p => p.name)).toContain('pkg-c')
    })

    it('Then sets reason to dependency for dependents', () => {
      const allPackages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
        { ...createMockPackageInfo(), name: 'pkg-b', dependencies: ['pkg-a'] },
      ]
      const packagesWithCommits: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
      ]

      const result = expandPackagesToBumpWithDependents({
        allPackages,
        packagesWithCommits,
      })

      const pkgB = result.find(p => p.name === 'pkg-b')
      expect(pkgB?.reason).toBe('dependency')
    })

    it('Then builds dependency chain for dependents', () => {
      const allPackages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
        { ...createMockPackageInfo(), name: 'pkg-b', dependencies: ['pkg-a'] },
        { ...createMockPackageInfo(), name: 'pkg-c', dependencies: ['pkg-b'] },
      ]
      const packagesWithCommits: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
      ]

      const result = expandPackagesToBumpWithDependents({
        allPackages,
        packagesWithCommits,
      })

      const pkgB = result.find(p => p.name === 'pkg-b')
      const pkgC = result.find(p => p.name === 'pkg-c')

      expect(pkgB?.dependencyChain).toEqual(['pkg-a'])
      expect(pkgC?.dependencyChain).toEqual(['pkg-a', 'pkg-b'])
    })

    it('Then does not duplicate packages', () => {
      const allPackages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
        { ...createMockPackageInfo(), name: 'pkg-b', dependencies: ['pkg-a'] },
        { ...createMockPackageInfo(), name: 'pkg-c', dependencies: ['pkg-a'] },
      ]
      const packagesWithCommits: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
      ]

      const result = expandPackagesToBumpWithDependents({
        allPackages,
        packagesWithCommits,
      })

      const names = result.map(p => p.name)
      const uniqueNames = new Set(names)
      expect(names.length).toBe(uniqueNames.size)
    })

    it('Then handles multiple packages with commits', () => {
      const allPackages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
        { ...createMockPackageInfo(), name: 'pkg-b', dependencies: [] },
        { ...createMockPackageInfo(), name: 'pkg-c', dependencies: ['pkg-a', 'pkg-b'] },
      ]
      const packagesWithCommits: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
        { ...createMockPackageInfo(), name: 'pkg-b', dependencies: [] },
      ]

      const result = expandPackagesToBumpWithDependents({
        allPackages,
        packagesWithCommits,
      })

      expect(result).toHaveLength(3)
      expect(result.map(p => p.name)).toContain('pkg-c')
    })

    it('Then handles empty packagesWithCommits', () => {
      const allPackages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
      ]
      const packagesWithCommits: PackageBase[] = []

      const result = expandPackagesToBumpWithDependents({
        allPackages,
        packagesWithCommits,
      })

      expect(result).toHaveLength(0)
    })
  })
})

describe('Given topologicalSort function', () => {
  describe('When sorting packages', () => {
    it('Then sorts packages in dependency order', () => {
      const packages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-c', dependencies: ['pkg-b'] },
        { ...createMockPackageInfo(), name: 'pkg-b', dependencies: ['pkg-a'] },
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
      ]

      const result = topologicalSort(packages)

      const names = result.map(p => p.name)
      const aIndex = names.indexOf('pkg-a')
      const bIndex = names.indexOf('pkg-b')
      const cIndex = names.indexOf('pkg-c')

      expect(aIndex).toBeLessThan(bIndex)
      expect(bIndex).toBeLessThan(cIndex)
    })

    it('Then handles packages with no dependencies', () => {
      const packages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
        { ...createMockPackageInfo(), name: 'pkg-b', dependencies: [] },
      ]

      const result = topologicalSort(packages)

      expect(result).toHaveLength(2)
    })

    it('Then handles diamond dependency pattern', () => {
      const packages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-d', dependencies: ['pkg-b', 'pkg-c'] },
        { ...createMockPackageInfo(), name: 'pkg-c', dependencies: ['pkg-a'] },
        { ...createMockPackageInfo(), name: 'pkg-b', dependencies: ['pkg-a'] },
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
      ]

      const result = topologicalSort(packages)

      const names = result.map(p => p.name)
      const aIndex = names.indexOf('pkg-a')
      const bIndex = names.indexOf('pkg-b')
      const cIndex = names.indexOf('pkg-c')
      const dIndex = names.indexOf('pkg-d')

      expect(aIndex).toBeLessThan(bIndex)
      expect(aIndex).toBeLessThan(cIndex)
      expect(bIndex).toBeLessThan(dIndex)
      expect(cIndex).toBeLessThan(dIndex)
    })

    it('Then handles circular dependencies gracefully', () => {
      const packages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: ['pkg-b'] },
        { ...createMockPackageInfo(), name: 'pkg-b', dependencies: ['pkg-a'] },
      ]
      const loggerSpy = vi.spyOn(logger, 'warn')

      const result = topologicalSort(packages)

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Circular dependency detected'),
      )
      expect(result.length).toBeGreaterThan(0)
    })

    it('Then handles self-dependency', () => {
      const packages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: ['pkg-a'] },
      ]
      const loggerSpy = vi.spyOn(logger, 'warn')

      topologicalSort(packages)

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Circular dependency'),
      )
    })

    it('Then handles packages with multiple dependencies', () => {
      const packages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-d', dependencies: ['pkg-a', 'pkg-b', 'pkg-c'] },
        { ...createMockPackageInfo(), name: 'pkg-c', dependencies: [] },
        { ...createMockPackageInfo(), name: 'pkg-b', dependencies: [] },
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: [] },
      ]

      const result = topologicalSort(packages)

      const names = result.map(p => p.name)
      const dIndex = names.indexOf('pkg-d')
      const aIndex = names.indexOf('pkg-a')
      const bIndex = names.indexOf('pkg-b')
      const cIndex = names.indexOf('pkg-c')

      expect(aIndex).toBeLessThan(dIndex)
      expect(bIndex).toBeLessThan(dIndex)
      expect(cIndex).toBeLessThan(dIndex)
    })

    it('Then skips packages not in map', () => {
      const packages: PackageBase[] = [
        { ...createMockPackageInfo(), name: 'pkg-a', dependencies: ['non-existent'] },
      ]

      const result = topologicalSort(packages)

      expect(result).toHaveLength(1)
    })

    it('Then handles empty package list', () => {
      const packages: PackageBase[] = []

      const result = topologicalSort(packages)

      expect(result).toHaveLength(0)
    })
  })
})
