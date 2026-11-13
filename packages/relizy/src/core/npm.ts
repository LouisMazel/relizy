import type { PackageBase, PackageManager, RegistryTarget } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { formatJson } from '@maz-ui/utils/helpers/formatJson'
import { getAuthCommand as coreGetAuthCommand, getIndependentTag, getPublishTag, isInCI, isOtpError, isPaymentRequiredError, isPrerelease, isVersionAlreadyPublishedError, publishToRegistry } from '@relizy/core'
import { isRelizyCancelError } from './errors'
import { getAppHandlers } from './events'
import { buildLegacyRegistryTarget, getNpmRegistry, normalizeRegistryKey, resolveRegistryTargetsForPackage } from './npm-registry'
import { isVersionPublished } from './npm-versions'
import { askText, assertInteractivePrompt } from './prompts'

// Store OTP per registry for the session to avoid re-prompting for each package
const sessionOtpByRegistry = new Map<string, string>()

export function determinePublishTag(version: string, configTag?: string): string {
  const tag = getPublishTag(version, configTag)

  if (isPrerelease(version) && !configTag) {
    logger.warn('You are about to publish a "prerelease" version with the "latest" tag. To avoid mistake, the tag is set to "next"')
  }

  if (isPrerelease(version) && configTag === 'latest') {
    logger.warn('Please note, you are about to publish a "prerelease" version with the "latest" tag.')
  }

  return tag
}

function promptOtpWithTimeout(timeout: number = 90000): Promise<string> {
  const message = 'This operation requires a one-time password (OTP). Please enter your OTP:'

  try {
    assertInteractivePrompt({ message, whenNotInteractive: 'pass the one-time password with --otp' })
  }
  catch (error) {
    return Promise.reject(error)
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('OTP input timeout'))
    }, timeout)

    askText({ message })
      .then((otp) => {
        clearTimeout(timer)
        resolve(otp)
      })
      .catch((error) => {
        clearTimeout(timer)
        // Not a cancelled run: packages may already be published, the publish fails
        reject(isRelizyCancelError(error)
          ? new Error('OTP input cancelled', { cause: error })
          : error)
      })
  })
}

/**
 * The error a failed publish throws: an actionable one when the registry
 * refused a restricted scoped package, else the original one (logged)
 */
function getPublishFailure({
  error,
  pkg,
  registryTarget,
  packageNameAndVersion,
  registryLabel,
}: {
  error: unknown
  pkg: PackageBase
  registryTarget: RegistryTarget
  packageNameAndVersion: string
  registryLabel: string
}): unknown {
  if (isPaymentRequiredError(error) && pkg.name.startsWith('@') && registryTarget.access !== 'public') {
    return new Error(
      `Failed to publish ${packageNameAndVersion}${registryLabel}: the registry requires a paid plan to publish a private package (402 Payment Required). `
      + 'A scoped package is published as restricted unless told otherwise. '
      + 'To publish it publicly, set `publish.access: \'public\'` in your relizy config or `"publishConfig": { "access": "public" }` in its package.json.',
      { cause: error },
    )
  }

  logger.error(`Failed to publish ${packageNameAndVersion}:`, error)
  return error
}

/**
 * The one-time password the registry asks for: from the `onOtp` of the
 * application, else from the prompt of the terminal
 */
async function handleOtpError({ registry, packageName }: { registry: string, packageName: string }): Promise<string> {
  const { onOtp } = getAppHandlers()

  if (onOtp) {
    logger.debug(`OTP required by ${registry}: asking the application`)
    return onOtp({ registry, packageName })
  }

  if (isInCI()) {
    logger.error('OTP required but running in CI environment. Please provide OTP via config or `--otp` flag')
    throw new Error('OTP required in CI environment')
  }

  logger.warn('Publish failed: OTP required')

  try {
    const otp = await promptOtpWithTimeout()
    logger.debug('OTP received, retrying publish...')
    return otp
  }
  catch (promptError) {
    logger.fail('Failed to get OTP')
    throw promptError
  }
}

export function getAuthCommand({
  packageManager,
  config,
  otp,
  registryTarget,
}: {
  packageManager: PackageManager
  config: ResolvedRelizyConfig
  otp?: string
  registryTarget?: RegistryTarget
}): string {
  const target = registryTarget ?? buildLegacyRegistryTarget(config)

  return coreGetAuthCommand({
    packageManager,
    cwd: config.cwd,
    // Priority: given OTP > session OTP for this registry > target OTP
    otp: otp ?? sessionOtpByRegistry.get(normalizeRegistryKey(target.registry)),
    registryTarget: target,
  })
}

/**
 * Publish a package to a single resolved registry target, retrying once with
 * a prompted OTP if the registry requires one.
 */
async function publishToRegistryTarget({
  pkg,
  config,
  packageManager,
  dryRun,
  registryTarget,
  packageNameAndVersion,
  registryLabel,
}: {
  pkg: PackageBase
  config: ResolvedRelizyConfig
  packageManager: PackageManager
  dryRun: boolean
  registryTarget: RegistryTarget
  packageNameAndVersion: string
  registryLabel: string
}): Promise<void> {
  // A registry-specific `tag` wins; otherwise fall back to the global
  // `publish.tag` (also set by `--tag`, and by canary mode to `canary`) so the
  // resolved tag is consistent across every target, not just the default one.
  const tag = determinePublishTag(pkg.newVersion || pkg.version, registryTarget.tag ?? config.publish.tag)

  // Primary idempotency check: when skipping existing versions is requested,
  // ask the registry up front whether this version is already published and
  // skip the publish entirely if so. Only runs when the option is enabled (no
  // needless round-trip otherwise) and never in dry-run. An inconclusive answer
  // (`null`) falls through to the publish attempt, where the error-matching net
  // still catches an already-published version (and races).
  if (config.publish.skipExistingVersions && !dryRun) {
    const version = pkg.newVersion || pkg.version
    const alreadyPublished = await isVersionPublished({
      pkg,
      version,
      config,
      packageManager,
      registryTarget,
    })
    if (alreadyPublished) {
      logger.warn(`Skipping ${packageNameAndVersion}${registryLabel}: version already exists on the registry (publish.skipExistingVersions enabled)`)
      return
    }
  }

  let dynamicOtp: string | undefined
  const maxAttempts = 2

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await publishToRegistry({
        pkg,
        cwd: config.cwd,
        packageManager,
        registryTarget,
        tag,
        // Priority: dynamic OTP > session OTP for this registry > target OTP
        otp: dynamicOtp ?? sessionOtpByRegistry.get(normalizeRegistryKey(registryTarget.registry)),
        extraArgs: config.publish.args,
        dryRun,
        packageNameAndVersion,
        registryLabel,
        logLevel: config.logLevel,
        logger,
      })

      // Success - store OTP for this registry for next packages if it was prompted
      const registryKey = normalizeRegistryKey(registryTarget.registry)
      if (dynamicOtp && !sessionOtpByRegistry.has(registryKey)) {
        sessionOtpByRegistry.set(registryKey, dynamicOtp)
        logger.debug('OTP stored for session')
      }

      return
    }
    catch (error) {
      // Check if it's an OTP error and we haven't exhausted retries
      if (isOtpError(error) && attempt < maxAttempts - 1) {
        dynamicOtp = await handleOtpError({
          registry: registryTarget.registry || getNpmRegistry(config.cwd),
          packageName: pkg.name,
        })
      }
      // The version is already on the registry (immutable asset). This makes a
      // retry safe - the artifact exists, so there is nothing left to publish.
      else if (isVersionAlreadyPublishedError(error)) {
        if (config.publish.skipExistingVersions) {
          logger.warn(`Skipping ${packageNameAndVersion}${registryLabel}: version already exists on the registry (publish.skipExistingVersions enabled)`)
          return
        }

        throw new Error(
          `Version ${packageNameAndVersion} already exists on the registry${registryLabel} and cannot be overwritten. `
          + 'This usually happens when re-running a release on the same commit (e.g. a canary rerun), '
          + 'or after a release that published this version but failed to push its release commit (merge its tag into your branch to recover). '
          + 'Enable publish.skipExistingVersions (or pass --skip-existing-versions) to skip already-published versions instead of failing.',
          { cause: error },
        )
      }
      else {
        throw getPublishFailure({
          error,
          pkg,
          registryTarget,
          packageNameAndVersion,
          registryLabel,
        })
      }
    }
  }
}

export async function publishPackage({
  pkg,
  config,
  packageManager,
  dryRun,
}: {
  pkg: PackageBase
  config: ResolvedRelizyConfig
  packageManager: PackageManager
  dryRun: boolean
}): Promise<void> {
  const packageNameAndVersion = getIndependentTag({ name: pkg.name, version: pkg.newVersion || pkg.version })
  const registryTargets = resolveRegistryTargetsForPackage(pkg, config)

  logger.debug(`Building publish command for ${pkg.name}`)

  // In dry-run mode, npm/pnpm publish reads the version directly from package.json on disk.
  // Since bump --dry-run does not write to disk, the on-disk version is still the previously
  // published one, and `publish --dry-run` fails with "You cannot publish over the previously
  // published versions". To validate against the real new version, write it temporarily and
  // restore the original after the publish attempt (always, even on failure).
  const needsTempVersionWrite = dryRun
    && (packageManager === 'npm' || packageManager === 'pnpm')
    && !!pkg.newVersion
    && pkg.newVersion !== pkg.version

  const packageJsonPath = join(pkg.path, 'package.json')
  // Restored byte for byte, with the uncommitted changes of the file
  let originalContent: string | undefined
  if (needsTempVersionWrite) {
    originalContent = readFileSync(packageJsonPath, 'utf8')
    logger.debug(`[dry-run] Temporarily writing ${pkg.newVersion} to ${pkg.name} for publish --dry-run validation`)
    writeFileSync(packageJsonPath, `${formatJson({
      ...JSON.parse(originalContent),
      version: pkg.newVersion,
    })}\n`, 'utf8')
  }

  try {
    // Only label the registry in logs when there is more than one target -
    // keeps single-registry output identical to before this feature existed.
    const showRegistryLabel = registryTargets.length > 1

    for (const registryTarget of registryTargets) {
      const registryLabel = showRegistryLabel
        ? ` [${registryTarget.name ?? registryTarget.registry ?? 'default'}]`
        : ''

      await publishToRegistryTarget({
        pkg,
        config,
        packageManager,
        dryRun,
        registryTarget,
        packageNameAndVersion,
        registryLabel,
      })
    }
  }
  finally {
    if (originalContent !== undefined) {
      logger.debug(`[dry-run] Restoring ${pkg.name} version to ${pkg.version}`)
      writeFileSync(packageJsonPath, originalContent, 'utf8')
    }
  }
}
