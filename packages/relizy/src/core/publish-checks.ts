import type { PublishAuth, TrustedPublisherCheck } from '@relizy/core'
import type { PackageBase, RegistryTarget } from '../types'
import type { ResolvedRelizyConfig } from './config'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { checkTrustedPublisher, getPublishAuth, getUnsupportedRunnerReason, isNpmjsRegistry, oncePerRun } from '@relizy/core'
import { getNpmRegistry, normalizeRegistryKey, resolveRegistryTargetsForPackage, resolveRegistryTargetsForPackages } from './npm-registry'

/**
 * What relizy tells before a publish, by auth mode: the trusted publishing
 * pre-flight, the token fallback, the end of direct publishes with granular
 * tokens. Warnings only: a run that works is never stopped by them.
 */

/** The end of direct publishes with a granular access token, one place for the wording and the date */
export const TOKEN_DIRECT_PUBLISH_END = {
  date: 'January 2027',
  source: 'https://docs.npmjs.com/about-access-tokens/',
  guide: 'https://relizy.dev/guide/trusted-publishing',
}

/** The registry of a target, the one of the `.npmrc` when it has none */
export function getTargetRegistry(config: ResolvedRelizyConfig, registryTarget: RegistryTarget): string {
  return registryTarget.registry || getNpmRegistry(config.cwd)
}

/** How a publish to a registry target authenticates, see `getPublishAuth` */
export function getTargetPublishAuth(config: ResolvedRelizyConfig, registryTarget: RegistryTarget): PublishAuth {
  return getPublishAuth({
    registry: getTargetRegistry(config, registryTarget),
    token: registryTarget.token,
  })
}

/**
 * Once per run, the notes of the auth of the registries the packages need:
 * the mode at debug level, the unsupported runner, the token fallback and the
 * end of direct publishes with a token on npmjs
 */
export function reportPublishAuth({ config, packages, directPublish = true }: {
  config: ResolvedRelizyConfig
  packages: Pick<PackageBase, 'name'>[]
  /** Some versions may be published directly (not every one staged) */
  directPublish?: boolean
}): void {
  for (const registryTarget of resolveRegistryTargetsForPackages(packages, config)) {
    const registry = getTargetRegistry(config, registryTarget)
    const auth = getTargetPublishAuth(config, registryTarget)
    logger.debug(`Publish auth to ${registry}: ${auth.mode}${auth.provider
      ? ` (${auth.provider})`
      : ''}`)

    if (!isNpmjsRegistry(registry)) {
      continue
    }

    if (auth.provider) {
      const unsupported = getUnsupportedRunnerReason()
      if (unsupported) {
        oncePerRun({
          key: 'relizy:unsupported-runner',
          cwd: config.cwd,
          run: () => logger.warn(`${unsupported}: trusted publishing (OIDC) will not work here, publish with a token. See https://relizy.dev/guide/trusted-publishing`),
        })
      }
    }

    if (auth.tokenFallback) {
      oncePerRun({
        key: 'relizy:token-fallback',
        cwd: config.cwd,
        run: () => logger.info(`A token is configured and npm tries trusted publishing (OIDC) from ${auth.provider} first: once "relizy trust" is done, remove the secret`),
      })
    }

    if (auth.mode === 'token' && directPublish) {
      oncePerRun({
        key: 'relizy:token-direct-publish-end',
        cwd: config.cwd,
        run: () => logger.warn(auth.tokenFallback
          ? `Granular access tokens lose direct publishing in ${TOKEN_DIRECT_PUBLISH_END.date} (${TOKEN_DIRECT_PUBLISH_END.source}): this token is only a fallback of trusted publishing and can be removed once "relizy trust" is done. See ${TOKEN_DIRECT_PUBLISH_END.guide}`
          : `Granular access tokens lose direct publishing in ${TOKEN_DIRECT_PUBLISH_END.date} (${TOKEN_DIRECT_PUBLISH_END.source}): move to trusted publishing ("relizy trust") or stage these versions. See ${TOKEN_DIRECT_PUBLISH_END.guide}`),
      })
    }
  }
}

/** What the job is, as npm matches it: repository, calling workflow, environment */
function describeJob(env: NodeJS.ProcessEnv = process.env): string {
  const parts = [
    env.GITHUB_REPOSITORY || env.CI_PROJECT_PATH,
    env.GITHUB_WORKFLOW_REF
      ? `workflow ${env.GITHUB_WORKFLOW_REF.split('@')[0]?.split('/').pop()}`
      : env.CI_CONFIG_PATH
        ? `CI file ${env.CI_CONFIG_PATH}`
        : undefined,
    env.CI_ENVIRONMENT_NAME
      ? `environment ${env.CI_ENVIRONMENT_NAME}`
      : undefined,
  ].filter(Boolean)

  return parts.length > 0
    ? ` (${parts.join(', ')})`
    : ''
}

/** The message of a trusted publishing exchange that npm refused, also used when a publish fails with ENEEDAUTH under OIDC */
export function getTrustedPublisherMismatchMessage({ packages, check }: { packages: string[], check?: TrustedPublisherCheck }): string {
  const status = check?.httpStatus
    ? ` (HTTP ${check.httpStatus}${check.message
      ? `: ${check.message}`
      : ''})`
    : check?.message
      ? ` (${check.message})`
      : ''

  return `npm does not trust this job to publish ${packages.join(', ')}${describeJob()}${status}. `
    + 'Run "relizy trust" to set up its trusted publisher; it must name the calling workflow (not a reusable one) and the environment of the job. '
    + 'Created more than 2 days ago and never used? npm removed it: run "relizy trust" again. '
    + 'See https://relizy.dev/guide/trusted-publishing'
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!)
    }
  }
  await Promise.all(Array.from({
    length: Math.min(concurrency, items.length),
  }, worker))
  return results
}

/**
 * The trusted publishing pre-flight: for the packages the run publishes to
 * npmjs with OIDC (no token), the exchange npm does at publish time, four at
 * a time, so a missing or wrong trusted publisher is told before the publish.
 * Warnings only; the token is thrown away.
 */
export async function runTrustedPublishingPreflight({ config, packages }: {
  config: ResolvedRelizyConfig
  packages: Pick<PackageBase, 'name'>[]
}): Promise<void> {
  if (!config.safetyCheck || !config.publish.safetyCheck || packages.length === 0) {
    return
  }

  const timeoutMs = config.publish.safetyCheckTimeout ?? 15000

  for (const registryTarget of resolveRegistryTargetsForPackages(packages, config)) {
    const registry = getTargetRegistry(config, registryTarget)
    const auth = getTargetPublishAuth(config, registryTarget)
    if (auth.mode !== 'oidc') {
      continue
    }

    const registryKey = normalizeRegistryKey(registry)
    const names = packages
      .filter(pkg => resolveRegistryTargetsForPackage(pkg, config).some(target => normalizeRegistryKey(getTargetRegistry(config, target)) === registryKey))
      .map(pkg => pkg.name)

    const checks = await mapWithConcurrency(names, 4, name => checkTrustedPublisher({
      registry,
      packageName: name,
      timeoutMs,
      logger,
    }))
    const byStatus = (status: TrustedPublisherCheck['status']) => names.filter((_, index) => checks[index]!.status === status)

    const matched = byStatus('matched')
    const missing = byStatus('missing-package')
    const noMatch = names
      .map((name, index) => ({ name, check: checks[index]! }))
      .filter(({ check }) => check.status === 'no-match')

    if (matched.length > 0) {
      logger.info(`Trusted publishing (OIDC) from ${auth.provider}: ${matched.length} package${matched.length > 1
        ? 's'
        : ''} matched`)
    }

    if (missing.length > 0) {
      logger.warn(
        `Not on npm yet: ${missing.join(', ')}. Trusted publishing cannot create a package: `
        + 'publish its first version from your npm login (npm login), or with a token while tokens can still publish (then stage with a stage-only token), '
        + 'then run "relizy trust". See https://relizy.dev/guide/trusted-publishing',
      )
    }

    // One warning per answer of npm, naming its packages
    const groups = new Map<string, { packages: string[], check: TrustedPublisherCheck }>()
    for (const { name, check } of noMatch) {
      const key = `${check.httpStatus}:${check.message}`
      const group = groups.get(key) ?? { packages: [], check }
      group.packages.push(name)
      groups.set(key, group)
    }
    for (const group of groups.values()) {
      logger.warn(getTrustedPublisherMismatchMessage(group))
    }
  }
}
