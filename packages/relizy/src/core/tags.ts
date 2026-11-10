import type { ReadPackage, VersionMode } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { logger } from '@maz-ui/node'
import { resolveFromTag as coreResolveFromTag, resolveToTag as coreResolveToTag, isGraduating, isGraduatingToStableBetweenVersion } from '@relizy/core'

export type Step = 'bump' | 'changelog' | 'publish' | 'provider-release' | 'social'

export interface ResolvedTags {
  from: string
  to: string
}

async function resolveFromTag({
  config,
  versionMode,
  step,
  pkg,
  graduating,
}: {
  config: ResolvedRelizyConfig
  versionMode?: VersionMode | 'standalone'
  step: Step
  pkg: ReadPackage
  graduating: boolean
}) {
  const from = await coreResolveFromTag({
    cwd: config.cwd,
    pkg,
    independent: versionMode === 'independent',
    graduating,
    tagBody: config.templates.tagBody,
    movedPackages: config.monorepo?.movedPackages,
    logger,
  })

  logger.debug(`[${versionMode}](${step}) Using from tag: ${from}`)

  return config.from || from
}

function resolveToTag({
  config,
  versionMode,
  newVersion,
  step,
  packageName,
}: {
  config: ResolvedRelizyConfig
  versionMode?: VersionMode | 'standalone'
  newVersion?: string
  step: Step
  packageName?: string
}) {
  const to = coreResolveToTag({
    cwd: config.cwd,
    independent: versionMode === 'independent',
    untagged: step === 'bump' || step === 'changelog',
    newVersion,
    packageName,
    tagBody: config.templates.tagBody,
  })

  logger.debug(`[${versionMode}](${step}) Using to tag: ${to}`)

  return config.to || to
}

export async function resolveTags<S extends Step, NewVersion = S extends 'bump' ? undefined : string>({
  config,
  step,
  pkg,
  newVersion,
}: {
  config: ResolvedRelizyConfig
  step: S
  pkg: ReadPackage
  newVersion: NewVersion
}): Promise<ResolvedTags> {
  const versionMode = config.monorepo?.versionMode || 'standalone'

  logger.debug(`[${versionMode}](${step}) Resolving tags`)

  const releaseType = config.bump.type

  const graduating = typeof newVersion === 'string'
    ? isGraduatingToStableBetweenVersion(pkg.version, newVersion)
    : isGraduating(pkg.version, releaseType)

  const from = await resolveFromTag({
    config,
    versionMode,
    step,
    pkg,
    graduating,
  })

  const to = resolveToTag({
    config,
    versionMode,
    newVersion: newVersion as string | undefined,
    step,
    packageName: pkg.name,
  })

  logger.debug(`[${versionMode}](${step}) Using tags: ${from} → ${to}`)

  return { from, to }
}
