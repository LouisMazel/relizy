import type { LogLevel } from '@maz-ui/node'
import type { ReadPackage, VersionMode } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { execPromise, logger } from '@maz-ui/node'
import { getCurrentGitRef, getFirstCommit } from './git'
import { isGraduating, isGraduatingToStableBetweenVersion } from './version'

export function getIndependentTag({ version, name }: { version: string, name: string }) {
  return `${name}@${version}`
}

export async function getLastStableTag({ logLevel, cwd }: { logLevel?: LogLevel, cwd?: string }) {
  const { stdout } = await execPromise(
    `git tag --sort=-creatordate | grep -E '^[^0-9]*[0-9]+\\.[0-9]+\\.[0-9]+$' | head -n 1`,
    {
      logLevel,
      noStderr: true,
      noStdout: true,
      noSuccess: true,
      cwd,
    },
  )

  const lastTag = stdout.trim()

  logger.debug('Last stable tag:', lastTag || 'No stable tags found')

  return lastTag
}

export async function getLastTag({ logLevel, cwd }: { logLevel?: LogLevel, cwd?: string }) {
  const { stdout } = await execPromise(`git tag --sort=-creatordate | head -n 1`, {
    logLevel,
    noStderr: true,
    noStdout: true,
    noSuccess: true,
    cwd,
  })

  const lastTag = stdout.trim()

  logger.debug('Last tag:', lastTag || 'No tags found')

  return lastTag
}

export function getLastRepoTag(options?: {
  onlyStable?: boolean
  logLevel?: LogLevel
  cwd?: string
}): Promise<string | null> {
  if (options?.onlyStable) {
    return getLastStableTag({ logLevel: options?.logLevel, cwd: options?.cwd })
  }

  return getLastTag({ logLevel: options?.logLevel, cwd: options?.cwd })
}

export async function getLastPackageTag({
  packageName,
  onlyStable,
  logLevel,
  cwd,
}: {
  packageName: string
  onlyStable?: boolean
  logLevel?: LogLevel
  cwd?: string
}): Promise<string | null> {
  try {
    const escapedPackageName = packageName.replace(/[@/]/g, '\\$&')

    let grepPattern: string
    if (onlyStable) {
      grepPattern = `^${escapedPackageName}@[0-9]+\\.[0-9]+\\.[0-9]+$`
    }
    else {
      grepPattern = `^${escapedPackageName}@`
    }

    const { stdout } = await execPromise(
      `git tag --sort=-creatordate | grep -E '${grepPattern}' | sed -n '1p'`,
      {
        logLevel,
        noStderr: true,
        noStdout: true,
        noSuccess: true,
        cwd,
      },
    )

    const tag = stdout.trim()
    return tag || null
  }
  catch {
    return null
  }
}

export type Step = 'bump' | 'changelog' | 'publish' | 'provider-release'

export interface ResolvedTags {
  from: string
  to: string
}

async function resolveFromTagIndependent({
  cwd,
  packageName,
  graduating,
  logLevel,
}: {
  cwd: string
  packageName: string
  graduating: boolean
  logLevel?: LogLevel
}): Promise<string> {
  const lastPackageTag = await getLastPackageTag({
    packageName,
    onlyStable: graduating,
    logLevel,
  })

  if (!lastPackageTag) {
    return getFirstCommit(cwd)
  }

  return lastPackageTag
}

async function resolveFromTagUnified({
  config,
  graduating,
  logLevel,
}: {
  config: ResolvedRelizyConfig
  graduating: boolean
  logLevel?: LogLevel
}): Promise<string> {
  const from = await getLastRepoTag({ onlyStable: graduating, logLevel }) || getFirstCommit(config.cwd)

  return from
}

async function resolveFromTag({
  config,
  versionMode,
  step,
  packageName,
  graduating,
  logLevel,
}: {
  config: ResolvedRelizyConfig
  versionMode?: VersionMode | 'standalone'
  step: Step
  packageName?: string
  graduating: boolean
  logLevel?: LogLevel
}) {
  let from: string

  if (versionMode === 'independent') {
    if (!packageName) {
      throw new Error('Package name is required for independent version mode')
    }

    from = await resolveFromTagIndependent({
      cwd: config.cwd,
      packageName,
      graduating,
      logLevel,
    })
  }
  else {
    from = await resolveFromTagUnified({
      config,
      graduating,
      logLevel,
    })
  }

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
  const isUntaggedStep = step === 'bump' || step === 'changelog'

  let to: string

  if (isUntaggedStep) {
    to = getCurrentGitRef(config.cwd)
  }

  else if (versionMode === 'independent') {
    if (!packageName) {
      throw new Error('Package name is required for independent version mode')
    }

    if (!newVersion) {
      throw new Error('New version is required for independent version mode')
    }

    to = getIndependentTag({ version: newVersion, name: packageName })
  }
  else {
    to = newVersion ? config.templates.tagBody.replace('{{newVersion}}', newVersion) : getCurrentGitRef(config.cwd)
  }

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
  const logLevel = config.logLevel

  logger.debug(`[${versionMode}](${step}) Resolving tags`)

  const releaseType = config.bump.type

  const graduating = typeof newVersion === 'string' ? isGraduatingToStableBetweenVersion(pkg.version, newVersion) : isGraduating(pkg.version, releaseType)

  const from = await resolveFromTag({
    config,
    versionMode,
    step,
    packageName: pkg.name,
    graduating,
    logLevel,
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
