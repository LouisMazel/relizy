import type { ExecLogLevel } from './npm-versions'
import type { PublishAuthMode } from './publish-auth'
import type { CoreLogger, PackageManager, ReadPackage, RegistryTarget } from './types'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { execPromise } from '@maz-ui/node'
import * as semver from 'semver'
import { readToolVersion, TRUSTED_PUBLISHING_NPM_VERSION } from './npm-oidc'
import { isYarnBerry } from './package-manager'
import { getPublishCommand, quoteShellPath } from './publish'
import { withRegistryNpmrc } from './registry'
import { withSignalCleanup } from './signal-cleanup'
import { PNPM_STAGE_VERSION, STAGED_PUBLISHING_NPM_VERSION, StagingUnavailableError } from './stage-publish'

/**
 * How a version reaches the registry:
 * - `native`: the package manager publishes (`<pm> publish`) or stages (`npm stage publish`, `pnpm stage publish`) by itself
 * - `pack-and-upload`: the package manager packs the package (resolving `workspace:` and `catalog:`) and npm uploads the tarball, for what the package manager cannot do (stage with yarn, bun and pnpm before 11.3; trusted publishing with bun and yarn classic)
 */
export type PublishRoute = 'native' | 'pack-and-upload'

/**
 * The npm on the PATH, the one that uploads a tarball whatever the package
 * manager of the project
 *
 * Side effect: runs `npm --version` in `cwd`.
 *
 * @param cwd - Directory where `npm --version` runs.
 * @returns The npm version, `undefined` when it cannot be read.
 * @example
 * ```ts
 * getUploadNpmVersion('/repo') // '11.15.0'
 * ```
 */
export function getUploadNpmVersion(cwd: string): string | undefined {
  return readToolVersion('npm', cwd)
}

/**
 * How a version is published or staged, see `PublishRoute`. A token keeps the
 * native route of bun and yarn classic: only trusted publishing without token
 * (which they cannot do) goes through the upload with npm.
 *
 * Side effect: runs `pnpm --version` for pnpm when `staged`.
 *
 * @param options - Package manager, staging and auth.
 * @param options.packageManager - Package manager of the project.
 * @param options.cwd - Root of the project (Yarn Berry detection, pnpm version).
 * @param options.staged - The version is staged.
 * @param options.authMode - Auth mode of the registry, see `getPublishAuth`.
 * @returns `'native'` or `'pack-and-upload'`.
 * @example
 * ```ts
 * getPublishRoute({ packageManager: 'bun', cwd: '/repo', staged: true, authMode: 'token' }) // 'pack-and-upload'
 * getPublishRoute({ packageManager: 'npm', cwd: '/repo', staged: true, authMode: 'oidc' }) // 'native'
 * ```
 */
export function getPublishRoute({ packageManager, cwd, staged, authMode }: {
  packageManager: PackageManager
  cwd: string
  staged: boolean
  authMode: PublishAuthMode
}): PublishRoute {
  if (staged) {
    if (packageManager === 'npm') {
      return 'native'
    }
    if (packageManager === 'pnpm') {
      const pnpmVersion = readToolVersion('pnpm', cwd)
      return pnpmVersion && semver.gte(pnpmVersion, PNPM_STAGE_VERSION)
        ? 'native'
        : 'pack-and-upload'
    }
    return 'pack-and-upload'
  }

  const cannotDoOidc = packageManager === 'bun' || (packageManager === 'yarn' && !isYarnBerry(cwd))

  return authMode === 'oidc' && cannotDoOidc
    ? 'pack-and-upload'
    : 'native'
}

/**
 * Throws when the npm that would run a staged publish or an upload is too old:
 * npm 11.15.0 to stage (with npm itself, pnpm before 11.3, or the upload of
 * yarn and bun), npm 11.5.1 to upload under trusted publishing. Nothing
 * happens when the package manager stages by itself (pnpm 11.3+) or the
 * version cannot be read.
 *
 * Side effect: runs `npm --version` (and `pnpm --version`) in `cwd`.
 *
 * @param options - Package manager, route and staging.
 * @param options.packageManager - Package manager of the project.
 * @param options.cwd - Root of the project.
 * @param options.staged - The versions are staged.
 * @param options.route - The route the versions take, see `getPublishRoute`.
 * @throws `StagingUnavailableError` naming the version found, the version needed and the upgrade command.
 * @example
 * ```ts
 * assertPublishNpmVersion({ packageManager: 'bun', cwd: '/repo', staged: true, route: 'pack-and-upload' })
 * ```
 */
export function assertPublishNpmVersion({ packageManager, cwd, staged, route }: {
  packageManager: PackageManager
  cwd: string
  staged: boolean
  route: PublishRoute
}): void {
  if (route === 'native' && packageManager !== 'npm') {
    return
  }
  if (route === 'native' && !staged) {
    return
  }

  const needed = staged
    ? STAGED_PUBLISHING_NPM_VERSION
    : TRUSTED_PUBLISHING_NPM_VERSION
  const found = getUploadNpmVersion(cwd)

  if (found && semver.lt(found, needed)) {
    const what = staged
      ? 'Staging a version'
      : `Publishing with trusted publishing (OIDC) through npm with ${packageManager}`
    throw new StagingUnavailableError(`${what} needs npm ${needed} or later, npm ${found} is installed.\nRun "npm install -g npm@latest" before the release.`)
  }
}

function getPackCommand(packageManager: PackageManager, cwd: string, destination: string): string {
  const tarball = join(destination, 'package.tgz')

  if (packageManager === 'pnpm') {
    return `pnpm pack --pack-destination ${quoteShellPath(destination)} --json`
  }
  if (packageManager === 'bun') {
    return `bun pm pack --destination ${quoteShellPath(destination)} --quiet`
  }
  if (packageManager === 'yarn') {
    return isYarnBerry(cwd)
      ? `yarn pack --out ${quoteShellPath(tarball)} --json`
      : `yarn pack --filename ${quoteShellPath(tarball)}`
  }
  return `npm pack --pack-destination ${quoteShellPath(destination)} --json`
}

function findTgzPath(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.endsWith('.tgz')
      ? value
      : undefined
  }
  if (Array.isArray(value)) {
    return value.map(findTgzPath).find(Boolean)
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return findTgzPath(record.output ?? record.filename)
  }
  return undefined
}

/** The JSON of the output, whole or after the lines a `prepack` script printed before it */
function findJsonTgz(stdout: string): string | undefined {
  try {
    return findTgzPath(JSON.parse(stdout))
  }
  catch {
    for (const match of stdout.matchAll(/^[[{]/gm)) {
      try {
        const found = findTgzPath(JSON.parse(stdout.slice(match.index)))
        if (found) {
          return found
        }
      }
      catch {
        // Not the start of the JSON
      }
    }
    return undefined
  }
}

/** The last line naming the tarball: NDJSON (Yarn Berry), `Wrote tarball to` (Yarn classic), a bare path (bun) */
function findLineTgz(stdout: string): string | undefined {
  const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (const line of lines.reverse()) {
    let found: string | undefined
    try {
      found = findTgzPath(JSON.parse(line))
    }
    catch {
      found = /Wrote tarball to "(.+\.tgz)"/.exec(line)?.[1] ?? (line.endsWith('.tgz')
        ? line
        : undefined)
    }
    if (found) {
      return found
    }
  }
  return undefined
}

/**
 * The tarball path printed by a pack command, never rebuilt from the package
 * name (scoped names): the `filename` of the pnpm and npm JSON, the `output`
 * of the last line of the Yarn Berry NDJSON, the `Wrote tarball to "<path>"`
 * of Yarn classic, the last line of `bun pm pack --quiet`. A relative path is
 * resolved from the destination.
 *
 * @param stdout - Output of the pack command.
 * @param destination - Directory the tarball was packed into.
 * @returns The absolute tarball path, `undefined` when the output names none.
 * @example
 * ```ts
 * parsePackOutput('{"filename":"/tmp/relizy-pack-1/scope-pkg-1.0.0.tgz"}', '/tmp/relizy-pack-1')
 * // '/tmp/relizy-pack-1/scope-pkg-1.0.0.tgz'
 * ```
 */
export function parsePackOutput(stdout: string, destination: string): string | undefined {
  const found = findJsonTgz(stdout) ?? findLineTgz(stdout)
  if (!found) {
    return undefined
  }

  // npm prints a bare file name, pnpm the path as passed
  return isAbsolute(found)
    ? found
    : resolve(destination, found)
}

/**
 * Publish or stage a package the package manager cannot publish that way by
 * itself: pack it with the package manager in its directory (resolving
 * `workspace:` and `catalog:`, running `prepack`), into a temporary directory,
 * then upload the tarball with npm (`npm [stage] publish '<tarball>'`) from
 * the root of the project, where `withRegistryNpmrc` writes the token (also
 * for yarn, through npm) and where the scope registries are. A tarball upload
 * runs no lifecycle script: `prepublishOnly`, `publish` and `postpublish` are
 * skipped. The temporary directory is removed afterwards, also on failure and
 * when the process stops.
 *
 * @param options - Package, registry and publish settings.
 * @param options.pkg - Name and directory of the package.
 * @param options.cwd - Root of the project, where its `.npmrc` is.
 * @param options.packageManager - Package manager that packs.
 * @param options.registryTarget - Registry to upload to, with its optional token.
 * @param options.tag - Dist-tag.
 * @param options.staged - Stage the version (`npm stage publish`) instead of publishing it.
 * @param options.otp - One-time password of a direct upload, else the one of the registry target (never passed when staging).
 * @param options.extraArgs - Arguments added to the upload command (`publish.args`), they must suit `npm publish`.
 * @param options.dryRun - Packs, then uploads with `--dry-run`.
 * @param options.packageNameAndVersion - `name@version`, to name the package in the logs.
 * @param options.registryLabel - Appended to the log line, to name the registry when there are several.
 * @param options.logLevel - Log level of the commands run.
 * @param options.logger - Receives the progress messages.
 * @returns `{ stdout, tarball }`: the output of the upload (see `parseStageOutput`) and the tarball path (removed once done).
 * @throws The error of the pack or of the upload command, or an error when the pack output names no tarball.
 * @example
 * ```ts
 * const { stdout } = await packAndUpload({
 *   pkg: { name: '@scope/pkg', path: '/repo/packages/pkg' },
 *   cwd: '/repo',
 *   packageManager: 'bun',
 *   registryTarget: { registry: 'https://registry.npmjs.org/' },
 *   tag: 'latest',
 *   staged: true,
 *   dryRun: false,
 *   packageNameAndVersion: '@scope/pkg@1.2.0',
 * })
 * ```
 */
export async function packAndUpload({
  pkg,
  cwd,
  packageManager,
  registryTarget,
  tag,
  staged,
  otp,
  extraArgs,
  dryRun,
  packageNameAndVersion,
  registryLabel = '',
  logLevel,
  logger,
}: {
  pkg: Pick<ReadPackage, 'name' | 'path'>
  cwd: string
  packageManager: PackageManager
  registryTarget: RegistryTarget
  tag: string
  staged: boolean
  otp?: string
  extraArgs?: string[]
  dryRun: boolean
  packageNameAndVersion: string
  registryLabel?: string
  logLevel?: ExecLogLevel
  logger?: CoreLogger
}): Promise<{ stdout: string, tarball: string }> {
  const destination = mkdtempSync(join(tmpdir(), 'relizy-pack-'))

  return await withSignalCleanup(() => rmSync(destination, { recursive: true, force: true }), async () => {
    logger?.info?.(`${dryRun
      ? '[dry-run] '
      : ''}Packing ${packageNameAndVersion} with ${packageManager}, then ${staged
      ? 'staging'
      : 'publishing'} it with npm with tag "${tag}"${registryLabel}`)

    const packed = await execPromise(getPackCommand(packageManager, cwd, destination), {
      noStderr: true,
      noStdout: true,
      noSuccess: true,
      noError: true,
      logLevel,
      cwd: pkg.path,
    })

    const tarball = parsePackOutput(packed?.stdout ?? '', destination)
    if (!tarball) {
      throw new Error(`${packageManager} packed ${packageNameAndVersion} but its output names no tarball`)
    }

    const command = getPublishCommand({
      packageManager: 'npm',
      tag,
      registryTarget,
      otp,
      dryRun,
      cwd,
      extraArgs,
      staged,
      tarball,
    })

    const uploaded = await withRegistryNpmrc({
      cwd,
      registryTarget,
      packageName: pkg.name,
      // The upload runs npm: the token is written for npm, also with yarn
      packageManager: 'npm',
      logger,
      fn: () => execPromise(command, {
        noStderr: true,
        noStdout: true,
        noSuccess: true,
        noError: true,
        logLevel,
        cwd,
      }),
    })

    return { stdout: uploaded?.stdout ?? '', tarball }
  })
}
