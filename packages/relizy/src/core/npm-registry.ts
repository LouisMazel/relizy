import type { PackageBase, PackageManager, RegistryTarget } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { logger } from '@maz-ui/node'
import { detectPackageManager as coreDetectPackageManager, resolveRegistryTargetsForPackage as coreResolveRegistryTargetsForPackage, resolveRegistryTargetsForPackages as coreResolveRegistryTargetsForPackages, withRegistryNpmrc as coreWithRegistryNpmrc, getNpmRegistry } from '@relizy/core'

/**
 * The registries of the packages (`publish.registry`, `publish.registries`,
 * the `.npmrc`) of a config, on top of the generic registry helpers of
 * `@relizy/core`
 */

export { getExecCommand, getNpmRegistry, isYarnBerry, normalizeRegistryKey } from '@relizy/core'

export function detectPackageManager(cwd: string = process.cwd()): PackageManager {
  return coreDetectPackageManager(cwd, logger)
}

const npmrcRegistryByConfig = new WeakMap<ResolvedRelizyConfig, string>()

/**
 * The registry of the npm config / `.npmrc`, read once per config: the
 * registry of a package that no `registries` entry covers when
 * `publish.registry` is not set.
 */
function getNpmrcRegistry(config: ResolvedRelizyConfig): string {
  let registry = npmrcRegistryByConfig.get(config)

  if (registry === undefined) {
    registry = getNpmRegistry(config.cwd)
    npmrcRegistryByConfig.set(config, registry)
  }

  return registry
}

/**
 * Build the implicit registry target from the legacy single-registry config
 * fields (`publish.registry`/`token`/`tag`/`access`/`otp`). Publishing to this
 * target reproduces the exact pre-multi-registry behavior.
 */
export function buildLegacyRegistryTarget(config: ResolvedRelizyConfig): RegistryTarget {
  return {
    name: 'default',
    // Left unset by resolveConfig when `registries` are declared
    registry: config.publish.registry || (config.publish.registries?.length
      ? getNpmrcRegistry(config)
      : ''),
    token: config.tokens.registry,
    tag: config.publish.tag,
    access: config.publish.access,
    otp: config.publish.otp,
  }
}

function getRegistryTargetsOptions(config: ResolvedRelizyConfig) {
  return {
    registry: config.publish.registry,
    registries: config.publish.registries,
    buildDefaultTarget: () => buildLegacyRegistryTarget(config),
    logger,
  }
}

/**
 * Resolve the registry targets a given package should be published to, see
 * `resolveRegistryTargetsForPackage()` of `@relizy/core`
 */
export function resolveRegistryTargetsForPackage(
  pkg: Pick<PackageBase, 'name'>,
  config: ResolvedRelizyConfig,
): RegistryTarget[] {
  return coreResolveRegistryTargetsForPackage(pkg, getRegistryTargetsOptions(config))
}

/**
 * Resolve every distinct registry actually needed to publish the given set of
 * packages, used for the pre-publish authentication safety check once the
 * package list to publish is known.
 */
export function resolveRegistryTargetsForPackages(
  packages: Pick<PackageBase, 'name'>[],
  config: ResolvedRelizyConfig,
): RegistryTarget[] {
  return coreResolveRegistryTargetsForPackages(packages, getRegistryTargetsOptions(config))
}

/**
 * Run `fn` with the token and the scope registry of the registry target
 * temporarily written to the `.npmrc` of the project, see `withRegistryNpmrc()`
 * of `@relizy/core`
 */
export function withRegistryNpmrc<T>({
  config,
  registryTarget,
  packageName,
  packageManager,
  fn,
}: {
  config: ResolvedRelizyConfig
  registryTarget: RegistryTarget
  packageName?: string
  packageManager: PackageManager
  fn: () => Promise<T>
}): Promise<T> {
  return coreWithRegistryNpmrc({
    cwd: config.cwd,
    registryTarget,
    packageName,
    packageManager,
    logger,
    fn,
  })
}
