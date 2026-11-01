import type { ResolvedRelizyConfig } from '../../core'
import type { ReadPackage, VersionGroup, VersionMode } from '../../types'

import { relative } from 'node:path'
import { z } from 'zod'
import { hasVersionGroups, readPackages, resolveVersionGroups } from '../../core'

export const configArgSchema = z.string().optional().describe('Name of the relizy config, as `--config`: "relizy.standalone" for relizy.standalone.config.ts. Default: relizy.config')

export interface PackageSet {
  /** Version group, with `monorepo.groups` */
  group?: VersionGroup
  versionMode: VersionMode | 'standalone'
  config: ResolvedRelizyConfig
  packages: ReadPackage[]
}

/** Version mode of a config: `standalone` without monorepo config */
export function getVersionMode(config: ResolvedRelizyConfig): VersionMode | 'standalone' {
  return config.monorepo?.versionMode ?? (config.monorepo?.packages ? 'unified' : 'standalone')
}

/** The packages released by a config, per version group */
export function readPackageSets(config: ResolvedRelizyConfig): PackageSet[] {
  const read = (setConfig: ResolvedRelizyConfig) => readPackages({
    cwd: setConfig.cwd,
    patterns: setConfig.monorepo?.packages,
    ignorePackageNames: setConfig.monorepo?.ignorePackageNames,
    ignored: setConfig.monorepo?.ignored,
    includePrivates: setConfig.monorepo?.includePrivates,
  })

  if (hasVersionGroups(config)) {
    return resolveVersionGroups({ config }).map(({ group, config: groupConfig }) => ({
      group,
      versionMode: group.versionMode,
      config: groupConfig,
      packages: read(groupConfig),
    }))
  }

  return [{ versionMode: getVersionMode(config), config, packages: read(config) }]
}

export function relativePath(cwd: string, path: string): string {
  return relative(cwd, path).split('\\').join('/') || '.'
}
