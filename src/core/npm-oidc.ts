import type { PackageManager } from '../types'
import { execSync } from 'node:child_process'
import process from 'node:process'
import * as semver from 'semver'

/**
 * npm trusted publishing: a CI job proves who it is with a short-lived OIDC
 * token instead of an npm token, and npm adds the provenance of the package.
 * The npm CLI does the exchange itself; relizy only has to detect it, so its
 * checks do not require a token (`npm whoami` does not work with OIDC).
 * See https://docs.npmjs.com/trusted-publishers
 */

type Env = NodeJS.ProcessEnv

/** The CI providers npm trusts, as relizy detects them */
export type TrustedPublishingProvider = 'GitHub Actions' | 'GitLab CI'

/** The first npm version doing the OIDC exchange */
export const TRUSTED_PUBLISHING_NPM_VERSION = '11.5.1'

/**
 * The token `actions/setup-node` writes to `NODE_AUTH_TOKEN` when a
 * `registry-url` is set without token: not a token
 */
const SETUP_NODE_PLACEHOLDER_TOKEN = 'XXXXX-XXXXX-XXXXX-XXXXX'

/**
 * The npm token of the environment (`RELIZY_NPM_TOKEN`, `NPM_TOKEN`,
 * `NODE_AUTH_TOKEN`), without the placeholder of `actions/setup-node`
 */
export function getEnvNpmToken(env: Env = process.env): string | undefined {
  return [env.RELIZY_NPM_TOKEN, env.NPM_TOKEN, env.NODE_AUTH_TOKEN].find(token => token && token !== SETUP_NODE_PLACEHOLDER_TOKEN)
}

/**
 * The CI provider of the job when it can get an OIDC token for npm: GitHub
 * Actions with the `id-token: write` permission, GitLab CI with the
 * `NPM_ID_TOKEN` id token
 */
export function getTrustedPublishingProvider(env: Env = process.env): TrustedPublishingProvider | undefined {
  if (env.GITHUB_ACTIONS === 'true' && env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    return 'GitHub Actions'
  }

  if (env.GITLAB_CI === 'true' && env.NPM_ID_TOKEN) {
    return 'GitLab CI'
  }

  return undefined
}

/** Trusted publishing only exists on the public npm registry */
export function isNpmjsRegistry(registry: string): boolean {
  try {
    return new URL(registry).host === 'registry.npmjs.org'
  }
  catch {
    return false
  }
}

/**
 * The provider of the job when a registry without token is published with
 * trusted publishing, undefined otherwise. With a token, npm still tries
 * OIDC first and falls back to the token: the token is checked as usual.
 */
export function getTrustedPublishing({ registry, token, env = process.env }: { registry: string, token: string | undefined, env?: Env }): TrustedPublishingProvider | undefined {
  if (token || !isNpmjsRegistry(registry)) {
    return undefined
  }

  return getTrustedPublishingProvider(env)
}

function readVersion(command: string, cwd: string): string | undefined {
  try {
    return semver.valid(execSync(`${command} --version`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()) ?? undefined
  }
  catch {
    return undefined
  }
}

/**
 * The npm version that publishes with the package manager, undefined when the
 * package manager publishes by itself: pnpm 11 and later do the OIDC exchange,
 * pnpm 10 and earlier run `npm publish`
 */
export function getPublishingNpmVersion(packageManager: PackageManager, cwd: string): string | undefined {
  if (packageManager === 'pnpm') {
    const pnpmVersion = readVersion('pnpm', cwd)
    if (pnpmVersion && semver.major(pnpmVersion) >= 11) {
      return undefined
    }
  }
  else if (packageManager !== 'npm') {
    return undefined
  }

  return readVersion('npm', cwd)
}

/**
 * Throws when the npm of the job cannot do the OIDC exchange: the publish
 * would fail with a misleading E404 after the bump
 */
export function assertTrustedPublishingNpm({ packageManager, cwd, provider }: { packageManager: PackageManager, cwd: string, provider: TrustedPublishingProvider }): void {
  const npmVersion = getPublishingNpmVersion(packageManager, cwd)

  if (npmVersion && semver.lt(npmVersion, TRUSTED_PUBLISHING_NPM_VERSION)) {
    throw new Error(
      `Trusted publishing (OIDC) from ${provider} needs npm ${TRUSTED_PUBLISHING_NPM_VERSION} or later, the job has npm ${npmVersion}.\n`
      + 'Run "npm install -g npm@latest" before the release, or set an npm token (NPM_TOKEN).',
    )
  }
}
