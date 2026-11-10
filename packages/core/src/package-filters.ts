import type { PackageBase, PrivatePackages } from './types'

/**
 * True for a package that went through a bump: it carries the version it had
 * before (`oldVersion`, non-empty). Narrows the type to expose `oldVersion`.
 *
 * @param pkg - The package to test
 * @returns True when `oldVersion` is set
 */
export function isBumpedPackage(pkg: PackageBase): pkg is PackageBase & { oldVersion: string } {
  return 'oldVersion' in pkg && !!pkg.oldVersion
}

/**
 * The packages without the private ones.
 *
 * @param packages - Objects with a `private` flag
 * @returns A new array of the public packages
 */
export function filterOutPrivatePackages<T extends { private: boolean }>(packages: T[]): T[] {
  return packages.filter(p => !p.private)
}

/**
 * Keep private packages only with `privatePackages: 'release'`: they are then
 * versioned and tagged like public ones. Publishing ignores them regardless.
 *
 * @param packages - Objects with a `private` flag
 * @param privatePackages - The `privatePackages` setting; anything but `'release'` (or undefined) drops the private ones
 * @returns All the packages with `'release'`, else the public ones
 * @example
 * ```ts
 * filterPrivatePackagesUnlessIncluded(packages, 'release') // every package
 * filterPrivatePackagesUnlessIncluded(packages, undefined) // public packages only
 * ```
 */
export function filterPrivatePackagesUnlessIncluded<T extends { private: boolean }>(
  packages: T[],
  privatePackages: PrivatePackages | undefined,
): T[] {
  return privatePackages === 'release'
    ? packages
    : filterOutPrivatePackages(packages)
}
