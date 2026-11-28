import type { PublishToRegistryOptions } from '@relizy/core'
import type { PackageBase, PackageManager, RegistryTarget } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { formatJson } from '@maz-ui/utils/helpers/formatJson'
import { getAuthCommand as coreGetAuthCommand, getIndependentTag, getPublishRoute, getPublishTag, isInCI, isOtpError, isPaymentRequiredError, isPrerelease, isStageRequiredError, isVersionAlreadyPublishedError, isVersionAlreadyStagedError, packAndUpload, parseStageOutput, publishToRegistry, publishToRegistryWithResult, StageRequiredError, VersionAlreadyStagedError } from '@relizy/core'
import { isRelizyCancelError, RelizyCancelError } from './errors'
import { getAppHandlers } from './events'
import { buildLegacyRegistryTarget, getNpmRegistry, normalizeRegistryKey, resolveRegistryTargetsForPackage } from './npm-registry'
import { isVersionPublished } from './npm-versions'
import { askText, assertInteractivePrompt } from './prompts'
import { getTargetPublishAuth, getTargetRegistry, getTrustedPublisherMismatchMessage } from './publish-checks'
import { promptInReleaseUi } from './release-ui'
import { getStagedVersions, isVersionStaged, recordAlreadyStagedVersion, recordStagedVersion } from './staging'
import { peekPublishedPackages } from './step-data'
import { getPublishWebAuthHandler } from './two-factor'

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

    promptInReleaseUi(() => askText({ message }))
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
 * refused a restricted scoped package or when npm did not trust the job
 * (trusted publishing), else the original one (logged)
 */
function getPublishFailure({
  error,
  pkg,
  config,
  registryTarget,
  packageNameAndVersion,
  registryLabel,
}: {
  error: unknown
  pkg: PackageBase
  config: ResolvedRelizyConfig
  registryTarget: RegistryTarget
  packageNameAndVersion: string
  registryLabel: string
}): unknown {
  // npm swallows a failed trusted publishing exchange, then fails with a misleading ENEEDAUTH
  if (/ENEEDAUTH/i.test(String((error as { message?: unknown })?.message ?? error)) && getTargetPublishAuth(config, registryTarget).mode === 'oidc') {
    return new Error(`Failed to publish ${packageNameAndVersion}${registryLabel}: ${getTrustedPublisherMismatchMessage({
      packages: [pkg.name],
    })}`, { cause: error })
  }

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
    // A JavaScript application may give anything
    const otp: unknown = await onOtp({ registry, packageName })

    // No password: the application cancelled, the packages published before stay published
    if (typeof otp !== 'string' || !otp.trim()) {
      throw new RelizyCancelError(`No one-time password given for ${packageName}: publish cancelled`)
    }

    return otp.trim()
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

/** How a package goes to one registry target: its dist-tag, staged or not, and the route */
interface TargetPlan {
  tag: string
  registry: string
  staged: boolean
  route: 'native' | 'pack-and-upload'
}

function planTarget({ pkg, config, packageManager, dryRun, registryTarget }: {
  pkg: PackageBase
  config: ResolvedRelizyConfig
  packageManager: PackageManager
  dryRun: boolean
  registryTarget: RegistryTarget
}): TargetPlan {
  // A registry-specific `tag` wins; otherwise fall back to the global
  // `publish.tag` (also set by `--tag`, and by canary mode to `canary`) so the
  // resolved tag is consistent across every target, not just the default one.
  const tag = determinePublishTag(pkg.newVersion || pkg.version, registryTarget.tag ?? config.publish.tag)
  const registry = getTargetRegistry(config, registryTarget)
  const staged = isVersionStaged({
    config,
    packageName: pkg.name,
    tag,
    registry,
  })
  // A direct dry run of yarn and bun skips the command, as always: only a
  // staged one packs and uploads with --dry-run
  const route = !staged && dryRun
    ? 'native'
    : getPublishRoute({
        packageManager,
        cwd: config.cwd,
        staged,
        authMode: getTargetPublishAuth(config, registryTarget).mode,
      })

  return { tag, registry, staged, route }
}

/** A staged version, recorded for the run with its stage id */
function recordStaged({ pkg, tag, registry, stdout }: { pkg: PackageBase, tag: string, registry: string, stdout: string }): 'staged' {
  const { stageId } = parseStageOutput(stdout)
  recordStagedVersion({
    name: pkg.name,
    version: pkg.newVersion || pkg.version,
    tag,
    registry,
    ...(stageId
      ? { stageId }
      : {}),
  })
  return 'staged'
}

/** The error of a direct publish npm refused because the version may only be staged */
function getStageRequiredError({ error, pkg, config, registryTarget, tag, packageNameAndVersion, registryLabel }: {
  error: unknown
  pkg: PackageBase
  config: ResolvedRelizyConfig
  registryTarget: RegistryTarget
  tag: string
  packageNameAndVersion: string
  registryLabel: string
}): StageRequiredError {
  const cause = getTargetPublishAuth(config, registryTarget).mode === 'oidc'
    ? 'the trusted publisher configuration of this workflow only allows staging'
    : 'this token only allows staging'
  const done = [
    ...peekPublishedPackages().filter(published => published.status === 'published').map(published => `${published.name}@${published.version}`),
    ...getStagedVersions().map(staged => `${staged.name}@${staged.version} (staged)`),
  ]

  return new StageRequiredError({
    packageName: pkg.name,
    tag,
    cause: error,
    message: `npm refused to publish ${packageNameAndVersion}${registryLabel} directly with tag "${tag}": ${cause}. `
      + `Stage this tag (publish.staged: { tags: ['${tag}'] }, or --staged), or allow direct publish ("relizy trust" with direct publish for this workflow, or a token allowed to publish).${
        done.length > 0
          ? ` This run already published: ${done.join(', ')}.`
          : ''}`,
  })
}

/** Runs the publish of a package on a target by its route: native, staged, or packed and uploaded with npm */
async function runTargetCommand({ options, pkg, plan }: {
  options: PublishToRegistryOptions
  pkg: PackageBase
  plan: TargetPlan
}): Promise<'published' | 'staged'> {
  const { tag, registry, staged, route } = plan

  const onWebAuth = getPublishWebAuthHandler(registry)

  if (route === 'pack-and-upload') {
    const { stdout } = await packAndUpload({
      ...options,
      staged,
      ...(onWebAuth
        ? { onWebAuth }
        : {}),
    })
    return staged
      ? recordStaged({ pkg, tag, registry, stdout })
      : 'published'
  }

  if (staged) {
    const { stdout } = await publishToRegistryWithResult({ ...options, staged })
    return recordStaged({ pkg, tag, registry, stdout })
  }

  if (!onWebAuth) {
    await publishToRegistry(options)
    return 'published'
  }

  try {
    await publishToRegistry({ ...options, onWebAuth })
  }
  catch (error) {
    // pnpm, yarn and bun give no web 2FA link without a terminal: npm uploads what they pack
    if (options.packageManager === 'npm' || options.dryRun || !isOtpError(error)) {
      throw error
    }
    logger.debug(`${options.packageNameAndVersion}: the registry asks a one-time password, uploading the package with npm for the web 2FA`)
    await packAndUpload({ ...options, staged: false, onWebAuth })
  }
  return 'published'
}

/**
 * The refusals of npm about staging: a version that may only be staged
 * (thrown, never retried as a stage), a version already staged (skipped with
 * `publish.skipExistingVersions`, thrown otherwise). Nothing for another error.
 */
async function handleStagingError({ error, pkg, config, packageManager, registryTarget, plan, packageNameAndVersion, registryLabel }: {
  error: unknown
  pkg: PackageBase
  config: ResolvedRelizyConfig
  packageManager: PackageManager
  registryTarget: RegistryTarget
  plan: TargetPlan
  packageNameAndVersion: string
  registryLabel: string
}): Promise<'skipped' | undefined> {
  // With trusted publishing, npm gives no E_STAGE_REQUIRED: the token of the exchange lacks the permission
  const oidcDenied = getTargetPublishAuth(config, registryTarget).mode === 'oidc'
    && /oidc permission denied/i.test(String((error as { message?: unknown })?.message ?? error))
  if (oidcDenied && plan.staged) {
    throw new Error(`npm refused to stage ${packageNameAndVersion}${registryLabel}: the trusted publisher configuration of this workflow does not allow staged publish. Run "relizy trust" from your machine: it allows the staged publish for the packages of publish.staged.`, { cause: error })
  }
  if (isStageRequiredError(error) || oidcDenied) {
    throw getStageRequiredError({
      error,
      pkg,
      config,
      registryTarget,
      tag: plan.tag,
      packageNameAndVersion,
      registryLabel,
    })
  }

  if (!isVersionAlreadyStagedError(error)) {
    return undefined
  }

  const version = pkg.newVersion || pkg.version
  // npm says the same to a stage of a version already published: only a
  // packument without the version tells it is staged
  const ambiguous = /cannot stage previously published/i.test(String((error as { message?: unknown })?.message ?? error))
  if (ambiguous && await isVersionPublished({
    pkg,
    version,
    config,
    packageManager,
    registryTarget,
  }) !== false) {
    return undefined
  }

  if (config.publish.skipExistingVersions) {
    logger.warn(`Skipping ${packageNameAndVersion}${registryLabel}: already staged, awaiting approval (publish.skipExistingVersions enabled)`)
    recordAlreadyStagedVersion({
      name: pkg.name,
      version,
      tag: plan.tag,
      registry: plan.registry,
    })
    return 'skipped'
  }

  throw new VersionAlreadyStagedError({
    packageName: pkg.name,
    version,
    message: `${packageNameAndVersion}${registryLabel} is already staged, awaiting approval: approve it with "relizy stage approve ${pkg.name}" or reject it with "relizy stage reject ${pkg.name}". Enable publish.skipExistingVersions (or pass --skip-existing-versions) to skip it instead of failing.`,
    cause: error,
  })
}

/** Success: the OTP prompted for this registry is kept for the next packages */
function rememberSessionOtp(registryTarget: RegistryTarget, otp: string | undefined): void {
  const registryKey = normalizeRegistryKey(registryTarget.registry)
  if (otp && !sessionOtpByRegistry.has(registryKey)) {
    sessionOtpByRegistry.set(registryKey, otp)
    logger.debug('OTP stored for session')
  }
}

/**
 * Primary idempotency check: when skipping existing versions is requested,
 * ask the registry up front whether this version is already published and
 * skip the publish entirely if so. Only runs when the option is enabled (no
 * needless round-trip otherwise) and never in dry-run. An inconclusive answer
 * (`null`) falls through to the publish attempt, where the error-matching net
 * still catches an already-published version (and races).
 */
async function isAlreadyPublished({ pkg, config, packageManager, dryRun, registryTarget, packageNameAndVersion, registryLabel }: {
  pkg: PackageBase
  config: ResolvedRelizyConfig
  packageManager: PackageManager
  dryRun: boolean
  registryTarget: RegistryTarget
  packageNameAndVersion: string
  registryLabel: string
}): Promise<boolean> {
  if (!config.publish.skipExistingVersions || dryRun) {
    return false
  }

  const alreadyPublished = await isVersionPublished({
    pkg,
    version: pkg.newVersion || pkg.version,
    config,
    packageManager,
    registryTarget,
  })
  if (alreadyPublished) {
    logger.warn(`Skipping ${packageNameAndVersion}${registryLabel}: version already exists on the registry (publish.skipExistingVersions enabled)`)
  }
  return Boolean(alreadyPublished)
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
  plan,
}: {
  pkg: PackageBase
  config: ResolvedRelizyConfig
  packageManager: PackageManager
  dryRun: boolean
  registryTarget: RegistryTarget
  packageNameAndVersion: string
  registryLabel: string
  plan: TargetPlan
}): Promise<PublishTargetStatus> {
  if (await isAlreadyPublished({
    pkg,
    config,
    packageManager,
    dryRun,
    registryTarget,
    packageNameAndVersion,
    registryLabel,
  })) {
    return 'skipped'
  }

  let dynamicOtp: string | undefined
  const maxAttempts = 2

  // Each attempt publishes, throws, or retries with an OTP before the last one
  for (let attempt = 0; ; attempt++) {
    try {
      const options: PublishToRegistryOptions = {
        pkg,
        cwd: config.cwd,
        packageManager,
        registryTarget,
        tag: plan.tag,
        // Priority: dynamic OTP > session OTP for this registry > target OTP
        otp: dynamicOtp ?? sessionOtpByRegistry.get(normalizeRegistryKey(registryTarget.registry)),
        extraArgs: config.publish.args,
        dryRun,
        packageNameAndVersion,
        registryLabel,
        logLevel: config.logLevel,
        logger,
      }

      if (await runTargetCommand({ options, pkg, plan }) === 'staged') {
        return 'staged'
      }

      rememberSessionOtp(registryTarget, dynamicOtp)
      return 'published'
    }
    catch (error) {
      // Before the OTP: a message of npm about staging can look like one
      if (await handleStagingError({
        error,
        pkg,
        config,
        packageManager,
        registryTarget,
        plan,
        packageNameAndVersion,
        registryLabel,
      }) === 'skipped') {
        return 'skipped'
      }

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
          return 'skipped'
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
          config,
          registryTarget,
          packageNameAndVersion,
          registryLabel,
        })
      }
    }
  }
}

/**
 * What the publish of a package did on a registry: `skipped` when the
 * version is already there (`publish.skipExistingVersions`), `staged` when it
 * awaits approval (`publish.staged`)
 */
export type PublishTargetStatus = 'published' | 'skipped' | 'staged'

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
}): Promise<PublishTargetStatus[]> {
  const packageNameAndVersion = getIndependentTag({ name: pkg.name, version: pkg.newVersion || pkg.version })
  const registryTargets = resolveRegistryTargetsForPackage(pkg, config)

  logger.debug(`Building publish command for ${pkg.name}`)

  // In dry-run mode, npm/pnpm publish reads the version directly from package.json on disk.
  // Since bump --dry-run does not write to disk, the on-disk version is still the previously
  // published one, and `publish --dry-run` fails with "You cannot publish over the previously
  // published versions". To validate against the real new version, write it temporarily and
  // restore the original after the publish attempt (always, even on failure).
  const plans = registryTargets.map(registryTarget => planTarget({
    pkg,
    config,
    packageManager,
    dryRun,
    registryTarget,
  }))
  // The pack of a staged dry run reads the version on disk too
  const needsTempVersionWrite = dryRun
    && (packageManager === 'npm' || packageManager === 'pnpm' || plans.some(plan => plan.route === 'pack-and-upload'))
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
    const statuses: PublishTargetStatus[] = []

    for (const [index, registryTarget] of registryTargets.entries()) {
      const registryLabel = showRegistryLabel
        ? ` [${registryTarget.name ?? registryTarget.registry ?? 'default'}]`
        : ''

      statuses.push(await publishToRegistryTarget({
        pkg,
        config,
        packageManager,
        dryRun,
        registryTarget,
        packageNameAndVersion,
        registryLabel,
        plan: plans[index]!,
      }))
    }

    return statuses
  }
  finally {
    if (originalContent !== undefined) {
      logger.debug(`[dry-run] Restoring ${pkg.name} version to ${pkg.version}`)
      writeFileSync(packageJsonPath, originalContent, 'utf8')
    }
  }
}
