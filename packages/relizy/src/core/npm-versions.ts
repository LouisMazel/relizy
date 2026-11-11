import type { PackageBase, PackageManager, RegistryTarget } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { logger } from '@maz-ui/node'
import { isVersionPublished as coreIsVersionPublished } from '@relizy/core'

/**
 * Ask the registry whether `pkg@version` already exists, with the token, the
 * timeout (`publish.safetyCheckTimeout`) and the log level of a config, see
 * `isVersionPublished()` of `@relizy/core`
 */
export function isVersionPublished({
  pkg,
  version,
  config,
  packageManager,
  registryTarget,
}: {
  pkg: PackageBase
  version: string
  config: ResolvedRelizyConfig
  packageManager: PackageManager
  registryTarget: RegistryTarget
}): Promise<boolean | null> {
  return coreIsVersionPublished({
    pkg,
    version,
    cwd: config.cwd,
    packageManager,
    registryTarget,
    token: config.tokens.registry,
    timeoutMs: config.publish.safetyCheckTimeout,
    logLevel: config.logLevel,
    logger,
  })
}
