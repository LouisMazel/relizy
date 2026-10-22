import type { ResolvedRelizyConfig } from '../config'
import { basename, relative, sep } from 'node:path'
import { readPackages } from '../repo'

/**
 * A workspace package as seen by the commit linter.
 */
export interface WorkspacePackage {
  /** Name from the package.json, e.g. `@maz-ui/nuxt` */
  name: string
  /** Path relative to the repository root, POSIX separators, e.g. `packages/nuxt` */
  path: string
  /** Scopes designating the package: short name, full name and folder name */
  scopes: string[]
}

/** `@maz-ui/nuxt` → `nuxt` */
function getShortName(name: string): string {
  return name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name
}

/**
 * Packages of the monorepo, private ones included: a commit can touch a package
 * that is never published. Empty in standalone mode.
 */
export function getWorkspacePackages(config: ResolvedRelizyConfig): WorkspacePackage[] {
  const patterns = config.monorepo?.packages
  if (!patterns || patterns.length === 0) {
    return []
  }

  return readPackages({
    cwd: config.cwd,
    patterns,
    ignorePackageNames: [],
    ignored: config.monorepo?.ignored,
    includePrivates: true,
  })
    .filter(pkg => pkg.path !== config.cwd)
    .map(pkg => ({
      name: pkg.name,
      path: relative(config.cwd, pkg.path).split(sep).join('/'),
      scopes: [...new Set([getShortName(pkg.name), pkg.name, basename(pkg.path)])],
    }))
}

/**
 * Scopes allowed by the config: the workspace packages, the `scopeMap` keys and
 * `commitlint.scopes`. `undefined` when any scope is allowed (standalone mode
 * without an explicit list).
 */
export function getAllowedScopes(config: ResolvedRelizyConfig, packages: WorkspacePackage[]): string[] | undefined {
  const explicit = config.commitlint?.scopes ?? []
  if (packages.length === 0 && explicit.length === 0) {
    return undefined
  }

  return [...new Set([
    ...packages.flatMap(pkg => pkg.scopes),
    ...Object.keys(config.scopeMap ?? {}),
    ...explicit,
  ])]
}

/** Names of the packages containing at least one of the files */
export function getPackagesOfFiles(files: string[], packages: WorkspacePackage[]): string[] {
  return packages
    .filter(pkg => files.some(file => file === pkg.path || file.startsWith(`${pkg.path}/`)))
    .map(pkg => pkg.name)
}

/** The package designated by a scope, if any */
export function findPackageByScope(scope: string, packages: WorkspacePackage[]): WorkspacePackage | undefined {
  return packages.find(pkg => pkg.scopes.includes(scope))
}
