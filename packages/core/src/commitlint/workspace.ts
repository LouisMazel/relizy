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
  return name.startsWith('@')
    ? name.slice(name.indexOf('/') + 1)
    : name
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
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

/** A config file of the repository root, `undefined` when it is missing or invalid */
function readConfigFile(cwd: string, file: string): Record<string, any> | undefined {
  const content = readFile(join(cwd, file))
  if (content === undefined) {
    return undefined
  }
  try {
    const parsed = file.endsWith('.yaml')
      ? parseYAML(content)
      : parseJSONC(content, { allowTrailingComma: true })
    return parsed && typeof parsed === 'object'
      ? parsed as Record<string, any>
      : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Package globs declared by the tools of the monorepo: the `workspaces` of the
 * package.json (npm, yarn, bun, and Turborepo or Nx on top of them),
 * `pnpm-workspace.yaml`, `lerna.json`, `rush.json` and the `workspace` of `deno.json`.
 * Missing or invalid files are skipped.
 * @param cwd - Repository root
 * @returns The deduplicated globs, empty when no tool declares a workspace
 * @example
 * ```ts
 * getPackageManagerWorkspaces('/repo') // ['packages/*', 'apps/*']
 * ```
 */
export function getPackageManagerWorkspaces(cwd: string): string[] {
  return [
    ...new Set(getPackageManagerWorkspaceSources(cwd).flatMap(source => source.patterns)),
  ]
}

/**
 * Package globs of `getPackageManagerWorkspaces`, grouped by the file declaring them.
 * @param cwd - Repository root
 * @returns One entry per file declaring at least one glob
 * @example
 * ```ts
 * getPackageManagerWorkspaceSources('/repo') // [{ file: 'pnpm-workspace.yaml', patterns: ['packages/*'] }]
 * ```
 */
export function getPackageManagerWorkspaceSources(cwd: string): { file: string, patterns: string[] }[] {
  const workspaces = readConfigFile(cwd, 'package.json')?.workspaces
  const deno = readConfigFile(cwd, 'deno.json')
    ? 'deno.json'
    : 'deno.jsonc'
  return [
    {
      file: 'package.json',
      patterns: toStrings(Array.isArray(workspaces)
        ? workspaces
        : workspaces?.packages),
    },
    {
      file: 'pnpm-workspace.yaml',
      patterns: toStrings(readConfigFile(cwd, 'pnpm-workspace.yaml')?.packages),
    },
    {
      file: 'lerna.json',
      patterns: toStrings(readConfigFile(cwd, 'lerna.json')?.packages),
    },
    {
      file: 'rush.json',
      patterns: toStrings((readConfigFile(cwd, 'rush.json')?.projects ?? []).map((project: { projectFolder?: unknown }) => project?.projectFolder)),
    },
    {
      file: deno,
      patterns: toStrings(readConfigFile(cwd, deno)?.workspace),
    },
  ].filter(source => source.patterns.length > 0)
}

/**
 * Packages of the monorepo, private ones included: a commit can touch a package
 * that is never published. Besides the `patterns` given (the directories the
 * tool releases, the ones the user adds), the workspace of the package manager
 * adds the directories the tool does not release (e.g. apps). Empty in
 * standalone mode without them. Directories without a package.json name are
 * skipped, `node_modules`, `dist` and `.git` are ignored, and the result is sorted by path.
 * @param options - Where to look
 * @param options.cwd - Repository root
 * @param options.patterns - Glob patterns of directories to treat as workspace packages, in addition to the ones of the package manager
 * @returns The packages with the scopes designating them
 * @example
 * ```ts
 * getWorkspacePackages({ cwd: '/repo', patterns: ['packages/*'] })
 * // [{ name: '@acme/nuxt', path: 'packages/nuxt', scopes: ['nuxt', '@acme/nuxt'] }]
 * ```
 */
export function getWorkspacePackages({ cwd, patterns: extraPatterns = [] }: {
  cwd: string
  patterns?: string[]
}): WorkspacePackage[] {
  const patterns = [
    ...new Set([
      ...extraPatterns,
      ...getPackageManagerWorkspaces(cwd),
    ].map(pattern => pattern.replace(/^\.\//, ''))),
  ]
  if (patterns.length === 0) {
    return []
  }

  const directories = fastGlob.sync(patterns, {
    cwd,
    onlyDirectories: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
  })

  return [
    ...new Set(directories),
  ]
    .map(directory => directory.replace(/\/$/, ''))
    .filter(directory => directory !== '' && directory !== '.')
    .sort()
    .flatMap((path) => {
      // Only the name matters to the linter: apps without version are packages too
      const name = readPackageName(join(cwd, path))
      return name
        ? [
            {
              name,
              path,
              scopes: [
                ...new Set([
                  getShortName(name),
                  name,
                  basename(path),
                ]),
              ],
            },
          ]
        : []
    })
}

function readPackageName(directory: string): string | undefined {
  try {
    const { name } = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    return typeof name === 'string' && name
      ? name
      : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Scopes allowed: the workspace packages, the keys of the scope map and the
 * explicit `scopes`. `undefined` when any scope is allowed (standalone mode
 * without an explicit list).
 * @param options - Sources of the scopes
 * @param options.packages - Workspace packages, their scopes are allowed
 * @param options.scopes - Scopes allowed in addition to the packages
 * @param options.scopeMap - The renamed scopes (`{ ui: 'components' }`), their keys are allowed too
 * @returns The deduplicated allowed scopes, `undefined` when there is no package and no explicit scope
 * @example
 * ```ts
 * getAllowedScopes({ packages, scopes: ['deps'], scopeMap: { ui: 'components' } })
 * // ['nuxt', '@acme/nuxt', 'ui', 'deps']
 * ```
 */
export function getAllowedScopes({ packages, scopes = [], scopeMap = {} }: {
  packages: WorkspacePackage[]
  scopes?: string[]
  scopeMap?: Record<string, string>
}): string[] | undefined {
  if (packages.length === 0 && scopes.length === 0) {
    return undefined
  }

  return [
    ...new Set([
      ...packages.flatMap(pkg => pkg.scopes),
      ...Object.keys(scopeMap),
      ...scopes,
    ]),
  ]
}

/**
 * Names of the packages containing at least one of the files.
 * @param files - Paths relative to the repository root, POSIX separators
 * @param packages - Workspace packages, see `getWorkspacePackages`
 * @returns The package names, in the order of `packages`, empty when no file belongs to a package
 * @example
 * ```ts
 * getPackagesOfFiles(['packages/nuxt/src/index.ts', 'README.md'], packages) // ['@acme/nuxt']
 * ```
 */
export function getPackagesOfFiles(files: string[], packages: WorkspacePackage[]): string[] {
  return packages
    .filter(pkg => files.some(file => file === pkg.path || file.startsWith(`${pkg.path}/`)))
    .map(pkg => pkg.name)
}

/**
 * The package designated by a scope, if any.
 * @param scope - Scope of a commit header, e.g. `nuxt`
 * @param packages - Workspace packages, see `getWorkspacePackages`
 * @returns The first package having this scope, `undefined` when none does
 */
export function findPackageByScope(scope: string, packages: WorkspacePackage[]): WorkspacePackage | undefined {
  return packages.find(pkg => pkg.scopes.includes(scope))
}
