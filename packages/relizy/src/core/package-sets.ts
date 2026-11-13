import type { ReadPackage, VersionGroup, VersionMode } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { relative } from 'node:path'
import { hasVersionGroups, resolveVersionGroups } from './groups'
import { readPackages } from './repo'

/**
 * Packages released together: the ones of a version group, or all of them without `monorepo.groups`
 */
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
    ignored: setConfig.monorepo?.ignored,
    privatePackages: setConfig.monorepo?.privatePackages,
  })

  if (hasVersionGroups(config)) {
    return resolveVersionGroups({ config }).map(({ group, config: groupConfig }) => ({
      group,
      versionMode: group.versionMode,
      config: groupConfig,
      packages: read(groupConfig),
    }))
  }

  return [
    {
      versionMode: getVersionMode(config),
      config,
      packages: read(config),
    },
  ]
}

export function relativePath(cwd: string, path: string): string {
  return relative(cwd, path).split('\\').join('/') || '.'
}
