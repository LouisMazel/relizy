import type { PackageManager } from './types'
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

/** The CI providers npm trusts for trusted publishing (OIDC), as relizy detects them */
export type TrustedPublishingProvider = 'GitHub Actions' | 'GitLab CI'

/** The first npm version doing the OIDC exchange (`'11.5.1'`), the minimum for trusted publishing with npm */
export const TRUSTED_PUBLISHING_NPM_VERSION = '11.5.1'

/**
 * The token `actions/setup-node` writes to `NODE_AUTH_TOKEN` when a
 * `registry-url` is set without token: not a token
 */
const SETUP_NODE_PLACEHOLDER_TOKEN = 'XXXXX-XXXXX-XXXXX-XXXXX'

/**
 * The npm token of the environment (`RELIZY_NPM_TOKEN`, `NPM_TOKEN`,
 * `NODE_AUTH_TOKEN`), without the placeholder of `actions/setup-node`
 *
 * @param env - Environment to read (`process.env` by default).
 * @returns The first of the three variables that is set and is not the placeholder, `undefined` when there is none.
 * @example
 * ```ts
 * getEnvNpmToken({ NPM_TOKEN: 'abc' }) // 'abc'
 * getEnvNpmToken({ NODE_AUTH_TOKEN: 'XXXXX-XXXXX-XXXXX-XXXXX' }) // undefined
 * ```
 */
export function getEnvNpmToken(env: Env = process.env): string | undefined {
  return [env.RELIZY_NPM_TOKEN, env.NPM_TOKEN, env.NODE_AUTH_TOKEN].find(token => token && token !== SETUP_NODE_PLACEHOLDER_TOKEN)
}

/**
 * The CI provider of the job when it can get an OIDC token for npm: GitHub
 * Actions with the `id-token: write` permission, GitLab CI with the
 * `NPM_ID_TOKEN` id token
 *
 * @param env - Environment to read (`process.env` by default).
 * @returns `'GitHub Actions'` or `'GitLab CI'`, `undefined` when the job cannot get an OIDC token.
 * @example
 * ```ts
 * getTrustedPublishingProvider({ GITLAB_CI: 'true', NPM_ID_TOKEN: 'eyJ...' }) // 'GitLab CI'
 * getTrustedPublishingProvider({}) // undefined
 * ```
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

/**
 * Trusted publishing only exists on the public npm registry
 *
 * @param registry - Registry URL.
 * @returns `true` when the host of the URL is `registry.npmjs.org`, `false` otherwise (including an invalid URL).
 * @example
 * ```ts
 * isNpmjsRegistry('https://registry.npmjs.org/') // true
 * isNpmjsRegistry('https://nexus.acme.dev/') // false
 * ```
 */
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
 *
 * @param options - Registry, token and environment.
 * @param options.registry - Registry URL to publish to.
 * @param options.token - Token of the registry target, if any.
 * @param options.env - Environment to read (`process.env` by default).
 * @returns The CI provider when there is no token, the registry is npmjs and the job can get an OIDC token, `undefined` otherwise.
 * @example
 * ```ts
 * getTrustedPublishing({ registry: 'https://registry.npmjs.org/', token: undefined })
 * // 'GitHub Actions' inside a GitHub job with id-token: write, else undefined
 * ```
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
 *
 * Side effect: runs `npm --version` (and `pnpm --version` for pnpm) in `cwd`.
 *
 * @param packageManager - Package manager of the project.
 * @param cwd - Directory where `npm --version` and `pnpm --version` run.
 * @returns The version of the `npm` binary, `undefined` for pnpm 11+, for yarn and bun, or when the version cannot be read.
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
 *
 * @param options - Package manager, directory and provider.
 * @param options.packageManager - Package manager of the project.
 * @param options.cwd - Directory where the versions are read.
 * @param options.provider - CI provider, named in the error message.
 * @throws When the publishing npm is older than `TRUSTED_PUBLISHING_NPM_VERSION` (message: `Trusted publishing (OIDC) from <provider> needs npm 11.5.1 or later, the job has npm <version>`, with the fix). Nothing happens when the version is unknown or the package manager publishes by itself.
 * @example
 * ```ts
 * assertTrustedPublishingNpm({ packageManager: 'npm', cwd: '/repo', provider: 'GitHub Actions' })
 * ```
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
