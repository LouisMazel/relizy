import type { PackageBase, VersionMode } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { logger } from '@maz-ui/node'
import { hasLernaJson } from '@relizy/core'
import { confirmBumpWithOutput } from './bump-prompt'
import { RelizyCancelError } from './errors'
import { askConfirm, assertInteractivePrompt, BUMP_NOT_INTERACTIVE } from './prompts'

/**
 * The display of the packages a bump updates, and its confirmation (the
 * prompt, or the output of the CLI through `bump-prompt.ts`)
 */

function displayRootAndLernaUpdates({
  versionMode,
  currentVersion,
  newVersion,
  dryRun,
  lernaJsonExists,
}: {
  versionMode: VersionMode
  currentVersion?: string
  newVersion?: string
  dryRun: boolean
  lernaJsonExists: boolean
}) {
  if (versionMode !== 'independent' && currentVersion && newVersion) {
    logger.log(`${dryRun ? '[dry-run] ' : ''}Root package.json: ${currentVersion} → ${newVersion}`)
    logger.log('')

    if (lernaJsonExists) {
      logger.log(`${dryRun ? '[dry-run] ' : ''}lerna.json: ${currentVersion} → ${newVersion}`)
      logger.log('')
    }
  }
}

const PRIVATE_SUFFIX = ' 🔒 [private: bump only, not published]'

function displayUnifiedModePackages({
  packages,
  newVersion,
  force,
}: {
  packages: PackageBase[]
  newVersion: string
  force: boolean
}) {
  logger.log(`${packages.length} package(s):`)
  packages.forEach((pkg) => {
    logger.log(`  • ${pkg.name}: ${pkg.version} → ${newVersion} (${pkg.commits.length} commits) ${force ? '(force)' : ''}${pkg.private ? PRIVATE_SUFFIX : ''}`)
  })
  logger.log('')
}

function displaySelectiveModePackages({
  packages,
  newVersion,
  force,
}: {
  packages: PackageBase[]
  newVersion: string
  force: boolean
}) {
  if (force) {
    logger.log(`${packages.length} package(s):`)
    packages.forEach((pkg) => {
      logger.log(`  • ${pkg.name}: ${pkg.version} → ${newVersion} (force)${pkg.private ? PRIVATE_SUFFIX : ''}`)
    })
    logger.log('')
  }
  else {
    const packagesWithCommits = packages.filter(p => 'reason' in p && p.reason === 'commits')
    const packagesAsDependents = packages.filter(p => 'reason' in p && p.reason === 'dependency')
    const packagesAsGraduation = packages.filter(p => 'reason' in p && p.reason === 'graduation')

    if (packagesWithCommits.length > 0) {
      logger.log(`${packagesWithCommits.length} package(s) with commits:`)
      packagesWithCommits.forEach((pkg) => {
        logger.log(`  • ${pkg.name}: ${pkg.version} → ${newVersion} (${pkg.commits.length} commits) ${force ? '(force)' : ''}${pkg.private ? PRIVATE_SUFFIX : ''}`)
      })
      logger.log('')
    }

    if (packagesAsDependents.length > 0) {
      logger.log(`${packagesAsDependents.length} dependent package(s):`)
      packagesAsDependents.forEach((pkg) => {
        logger.log(`  • ${pkg.name}: ${pkg.version} → ${newVersion} ${force ? '(force)' : ''}${pkg.private ? PRIVATE_SUFFIX : ''}`)
      })
      logger.log('')
    }

    if (packagesAsGraduation.length > 0) {
      logger.log(`${packagesAsGraduation.length} graduation package(s):`)
      packagesAsGraduation.forEach((pkg) => {
        logger.log(`  • ${pkg.name}: ${pkg.version} → ${newVersion} ${force ? '(force)' : ''}${pkg.private ? PRIVATE_SUFFIX : ''}`)
      })
      logger.log('')
    }
  }
}

function displayIndependentModePackages({
  packages,
  force,
}: {
  packages: PackageBase[]
  force: boolean
}) {
  if (force) {
    logger.log(`${packages.length} package(s):`)
    packages.forEach((pkg) => {
      logger.log(`  • ${pkg.name}: ${pkg.version} → ${pkg.newVersion} (force)${pkg.private ? PRIVATE_SUFFIX : ''}`)
    })
    logger.log('')
  }
  else {
    const packagesWithCommits = packages.filter(p => 'reason' in p && p.reason === 'commits')
    const packagesAsDependents = packages.filter(p => 'reason' in p && p.reason === 'dependency')
    const packagesAsGraduation = packages.filter(p => 'reason' in p && p.reason === 'graduation')

    if (packagesWithCommits.length > 0) {
      logger.log(`${packagesWithCommits.length} package(s) with commits:`)
      packagesWithCommits.forEach((pkg) => {
        pkg.newVersion && logger.log(`  • ${pkg.name}: ${pkg.version} → ${pkg.newVersion} (${pkg.commits.length} commits) ${force ? '(force)' : ''}${pkg.private ? PRIVATE_SUFFIX : ''}`)
      })
      logger.log('')
    }

    if (packagesAsDependents.length > 0) {
      logger.log(`${packagesAsDependents.length} dependent package(s):`)
      packagesAsDependents.forEach((pkg) => {
        pkg.newVersion && logger.log(`  • ${pkg.name}: ${pkg.version} → ${pkg.newVersion} ${force ? '(force)' : ''}${pkg.private ? PRIVATE_SUFFIX : ''}`)
      })
      logger.log('')
    }

    if (packagesAsGraduation.length > 0) {
      logger.log(`${packagesAsGraduation.length} graduation package(s):`)
      packagesAsGraduation.forEach((pkg) => {
        pkg.newVersion && logger.log(`  • ${pkg.name}: ${pkg.version} → ${pkg.newVersion} ${force ? '(force)' : ''}${pkg.private ? PRIVATE_SUFFIX : ''}`)
      })
      logger.log('')
    }
  }
}

/**
 * Print the packages a bump updates (and the root and `lerna.json` versions),
 * before its confirmation.
 */
export function displayBump({
  versionMode,
  config,
  packages,
  force,
  currentVersion,
  newVersion,
  dryRun,
}: {
  versionMode: VersionMode
  config: ResolvedRelizyConfig
  packages: PackageBase[]
  force: boolean
  currentVersion?: string
  newVersion?: string
  dryRun: boolean
}) {
  if (packages.length === 0) {
    logger.debug('No packages to bump')
    return
  }

  displayRootAndLernaUpdates({
    versionMode,
    currentVersion,
    newVersion,
    lernaJsonExists: hasLernaJson(config.cwd),
    dryRun,
  })

  if (versionMode === 'unified') {
    if (!newVersion) {
      throw new Error('Cannot display a bump in unified mode without a new version')
    }

    displayUnifiedModePackages({ packages, newVersion, force })
  }
  else if (versionMode === 'selective') {
    if (!newVersion) {
      throw new Error('Cannot display a bump in selective mode without a new version')
    }

    displaySelectiveModePackages({ packages, newVersion, force })
  }
  else if (versionMode === 'independent') {
    displayIndependentModePackages({ packages, force })
  }
}

/**
 * Ask once to confirm the bumps of a run: `display` prints them (see
 * `displayBump`), for every version group. Throws a `RelizyCancelError` when
 * the bump is refused or the prompt cancelled.
 */
export async function confirmBump({
  packages,
  display,
  dryRun,
}: {
  /**
   * Every package the run bumps
   */
  packages: Pick<PackageBase, 'private'>[]
  display: () => void
  dryRun: boolean
}) {
  if (packages.length === 0) {
    logger.debug('No packages to bump')
    return
  }

  // The output of the CLI asks within its steps, and throws when refused
  const answer = await confirmBumpWithOutput(packages as PackageBase[])
  if (answer !== undefined) {
    if (!answer) {
      throw new RelizyCancelError('Bump refused')
    }
    return
  }

  logger.log('')
  logger.info(`${dryRun ? '[dry-run] ' : ''}The following packages will be updated:\n`)

  if (packages.some(p => p.private)) {
    logger.log('🔒 Private packages are versioned and get a CHANGELOG, but are never published to a registry, nor included in provider releases or PR comments.\n')
  }

  display()

  const message = `${dryRun ? '[dry-run] ' : ''}Do you want to proceed with these version updates?`
  assertInteractivePrompt({ message, whenNotInteractive: BUMP_NOT_INTERACTIVE })

  const confirmed = await askConfirm({
    message,
    initialValue: true,
    cancelMessage: 'Bump cancelled',
  })

  if (!confirmed) {
    throw new RelizyCancelError('Bump refused')
  }

  logger.log('')
}
