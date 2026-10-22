import type { ResolvedRelizyConfig } from '../config'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import fastGlob from 'fast-glob'

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
 * that is never published. `commitlint.packages` adds directories that relizy
 * does not release (e.g. apps). `monorepo.ignored` is not applied: an ignored
 * package is released by another config, it is still a valid scope.
 * Empty in standalone mode without them.
 */
export function getWorkspacePackages(config: ResolvedRelizyConfig): WorkspacePackage[] {
  const patterns = [...new Set([...(config.monorepo?.packages ?? []), ...(config.commitlint?.packages ?? [])])]
  if (patterns.length === 0) {
    return []
  }

  const directories = fastGlob.sync(patterns, {
    cwd: config.cwd,
    onlyDirectories: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
  })

  return [...new Set(directories)]
    .map(directory => directory.replace(/\/$/, ''))
    .filter(directory => directory !== '' && directory !== '.')
    .sort()
    .flatMap((path) => {
      // Only the name matters to the linter: apps without version are packages too
      const name = readPackageName(join(config.cwd, path))
      return name ? [{ name, path, scopes: [...new Set([getShortName(name), name, basename(path)])] }] : []
    })
}

function readPackageName(directory: string): string | undefined {
  try {
    const { name } = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    return typeof name === 'string' && name ? name : undefined
  }
  catch {
    return undefined
  }
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
