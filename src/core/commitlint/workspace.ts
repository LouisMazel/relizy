import type { ResolvedRelizyConfig } from '../config'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseJSONC, parseYAML } from 'confbox'
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

function readFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  }
  catch {
    return undefined
  }
}

function toStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** A config file of the repository root, `undefined` when it is missing or invalid */
function readConfigFile(cwd: string, file: string): Record<string, any> | undefined {
  const content = readFile(join(cwd, file))
  if (content === undefined) {
    return undefined
  }
  try {
    const parsed = file.endsWith('.yaml') ? parseYAML(content) : parseJSONC(content)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Package globs declared by the tools of the monorepo: the `workspaces` of the
 * package.json (npm, yarn, bun, and Turborepo or Nx on top of them),
 * `pnpm-workspace.yaml`, `lerna.json`, `rush.json` and the `workspace` of `deno.json`.
 */
export function getPackageManagerWorkspaces(cwd: string): string[] {
  const workspaces = readConfigFile(cwd, 'package.json')?.workspaces
  return [...new Set([
    ...toStrings(Array.isArray(workspaces) ? workspaces : workspaces?.packages),
    ...toStrings(readConfigFile(cwd, 'pnpm-workspace.yaml')?.packages),
    ...toStrings(readConfigFile(cwd, 'lerna.json')?.packages),
    ...toStrings((readConfigFile(cwd, 'rush.json')?.projects ?? []).map((project: { projectFolder?: unknown }) => project?.projectFolder)),
    ...toStrings((readConfigFile(cwd, 'deno.json') ?? readConfigFile(cwd, 'deno.jsonc'))?.workspace),
  ])]
}

/**
 * Packages of the monorepo, private ones included: a commit can touch a package
 * that is never published. Besides `monorepo.packages`, the workspace of the
 * package manager and `commitlint.packages` add the directories that relizy
 * does not release (e.g. apps). `monorepo.ignored` is not applied: an ignored
 * package is released by another config, it is still a valid scope.
 * Empty in standalone mode without them.
 */
export function getWorkspacePackages(config: ResolvedRelizyConfig): WorkspacePackage[] {
  const patterns = [...new Set([
    ...(config.monorepo?.packages ?? []),
    ...getPackageManagerWorkspaces(config.cwd),
    ...(config.commitlint?.packages ?? []),
  ].map(pattern => pattern.replace(/^\.\//, '')))]
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
