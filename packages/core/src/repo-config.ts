import type { GitProvider, Reference, RepoConfig } from './types'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseJSON, parseJSONC } from 'confbox'
import { runGitSync } from './git-exec'

/**
 * Repository resolution and links, ported from changelogen 0.6.2:
 * https://github.com/unjs/changelogen/blob/v0.6.2/src/repo.ts. One change: the
 * provider of a self-hosted host is read from its name, or undefined, instead
 * of the host itself.
 *
 * MIT License - Copyright (c) Pooya Parsa <pooya@pi0.io>
 */

const providerToRefSpec: Record<GitProvider, Record<Reference['type'], string>> = {
  github: { 'pull-request': 'pull', 'hash': 'commit', 'issue': 'issues' },
  gitlab: { 'pull-request': 'merge_requests', 'hash': 'commit', 'issue': 'issues' },
  bitbucket: { 'pull-request': 'pull-requests', 'hash': 'commit', 'issue': 'issues' },
}

const providerToDomain: Record<GitProvider, string> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
}

const domainToProvider: Record<string, GitProvider> = {
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'bitbucket.org': 'bitbucket',
}

/**
 * Provider of a host other than the public ones (GitHub Enterprise, a
 * self-hosted GitLab), from its name, as `detectGitProvider()` does
 */
function getHostProvider(host: string): GitProvider | undefined {
  return (['github', 'gitlab', 'bitbucket'] as const).find(provider => host.includes(provider))
}

// https://regex101.com/r/NA4Io6/1
const PROVIDER_URL_REGEX = /^(?:(?<user>[\w-]+)@)?(?:(?<provider>[^/:]+):)?(?<repo>[\w-]+\/(?:\w|\.(?!git$)|-)+)(?:\.git)?$/

function baseUrl(config: RepoConfig) {
  return `https://${config.domain}/${config.repo}`
}

/**
 * Markdown link of a commit hash, an issue or a pull request, the raw value
 * when the provider is unknown
 *
 * @param ref - The reference, its type picks the path (`commit`, `issues`, `pull` or `merge_requests`, `pull-requests` on Bitbucket)
 * @param repo - The repository, the raw value is returned without it or without a known provider
 * @returns The markdown link, the leading `#` of the value is kept in the text and dropped in the URL
 * @example
 * ```ts
 * formatReference({ type: 'issue', value: '#12' }, { provider: 'github', domain: 'github.com', repo: 'maz-ui/relizy' })
 * // '[#12](https://github.com/maz-ui/relizy/issues/12)'
 * ```
 */
export function formatReference(ref: Reference, repo?: RepoConfig): string {
  if (!repo || !(repo.provider! in providerToRefSpec)) {
    return ref.value
  }
  const refSpec = providerToRefSpec[repo.provider!]
  return `[${ref.value}](${baseUrl(repo)}/${refSpec[ref.type]}/${ref.value.replace(/^#/, '')})`
}

/**
 * Markdown link comparing `config.from` to `v` (or `config.to`), the
 * `compare` page of the repository (`branches/compare` on Bitbucket)
 *
 * @param v - The version or ref to compare to, `config.to` when undefined or empty
 * @param config - The repository and the refs to compare
 * @param config.repo - The repository
 * @param config.from - The ref to compare from
 * @param config.to - The ref to compare to when `v` is not given
 * @returns The `[compare changes](url)` markdown link
 * @example
 * ```ts
 * formatCompareChanges('v1.1.0', { repo, from: 'v1.0.0', to: 'HEAD' })
 * // '[compare changes](https://github.com/maz-ui/relizy/compare/v1.0.0...v1.1.0)'
 * ```
 */
export function formatCompareChanges(
  v: string | undefined,
  config: { repo: RepoConfig, from: string, to: string },
): string {
  const part = config.repo.provider === 'bitbucket'
    ? 'branches/compare'
    : 'compare'
  const changes = config.repo.provider === 'bitbucket'
    ? `${v || config.to}%0D${config.from}`
    : `${config.from}...${v || config.to}`
  return `[compare changes](${baseUrl(config.repo)}/${part}/${changes})`
}

/** Closest `package.json` from `cwd`, in `cwd` or one of its parents */
function readClosestPackageJson(cwd: string): { repository?: string | { url?: string } } | undefined {
  let dir = resolve(cwd)

  while (true) {
    const path = join(dir, 'package.json')

    if (existsSync(path) && statSync(path).isFile()) {
      const content = readFileSync(path, 'utf8')
      try {
        return parseJSON(content)
      }
      catch {
        return parseJSONC(content, { allowTrailingComma: true })
      }
    }

    const parent = dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}

function getGitRemoteURL(cwd: string, remote = 'origin'): string {
  // A repository without remote is expected: the stderr of git (`error: No such remote`) is not shown
  return runGitSync([
    `--work-tree=${cwd}`,
    'remote',
    'get-url',
    remote,
  ], { cwd })
}

/**
 * Repository of the project, from the `repository` field of the closest
 * `package.json` (in `cwd` or a parent), else from the `origin` remote.
 * Undefined without both. Reads files and runs `git remote get-url origin`
 * in `cwd` when the `package.json` has no `repository`. Never throws.
 *
 * @param cwd - The directory to start from
 * @returns The repository parsed with `getRepoConfig`, or undefined
 * @example
 * ```ts
 * const repo = await resolveRepoConfig(process.cwd())
 * // { provider: 'github', repo: 'maz-ui/relizy', domain: 'github.com' }
 * ```
 */
// Async for the callers of the public API
// eslint-disable-next-line require-await
export async function resolveRepoConfig(cwd: string): Promise<RepoConfig | undefined> {
  let pkg: ReturnType<typeof readClosestPackageJson>
  try {
    pkg = readClosestPackageJson(cwd)
  }
  catch {
    // Ignore
  }

  if (pkg && pkg.repository) {
    const url = typeof pkg.repository === 'string'
      ? pkg.repository
      : pkg.repository.url
    return getRepoConfig(url)
  }

  try {
    const gitRemote = getGitRemoteURL(cwd)
    if (gitRemote) {
      return getRepoConfig(gitRemote)
    }
  }
  catch {
    // Ignore
  }

  return undefined
}

/**
 * Provider, domain and `owner/name` of a repository URL (`https://`, `git@`,
 * `github:owner/name` or `owner/name`). A bare `owner/name` is a GitHub
 * repository; the provider of a self-hosted host is read from its name
 * (`gitlab.example.com` is `gitlab`), undefined when it names none. Never throws:
 * unparsable input gives undefined fields.
 *
 * @param repoUrl - The repository URL or shorthand, empty by default
 * @returns The provider, the `owner/name` path and the domain, each undefined when not found
 * @example
 * ```ts
 * getRepoConfig('git@gitlab.com:group/project.git')
 * // { provider: 'gitlab', repo: 'group/project', domain: 'gitlab.com' }
 * getRepoConfig('maz-ui/relizy')
 * // { provider: 'github', repo: 'maz-ui/relizy', domain: 'github.com' }
 * ```
 */
export function getRepoConfig(repoUrl = ''): RepoConfig {
  let provider: GitProvider | undefined
  let repo: string | undefined
  let domain: string | undefined

  let url: URL | undefined
  try {
    url = new URL(repoUrl)
  }
  catch {
    // Ignore error
  }

  const m = repoUrl.match(PROVIDER_URL_REGEX)?.groups ?? {}
  if (m.repo && m.provider) {
    repo = m.repo
    // A prefix (`github:`) or a host (`git@gitlab.example.com:`)
    const isPrefix = Object.hasOwn(providerToDomain, m.provider)
    provider = isPrefix
      ? m.provider as GitProvider
      : domainToProvider[m.provider] ?? getHostProvider(m.provider)
    domain = isPrefix ? providerToDomain[m.provider as GitProvider] : m.provider
  }
  else if (url) {
    domain = url.hostname
    const paths = url.pathname.split('/')
    repo = paths
      .slice(1)
      .join('/')
      .replace(/\.git$/, '')
    provider = domainToProvider[domain] ?? getHostProvider(domain)
  }
  else if (m.repo) {
    repo = m.repo
    provider = 'github'
    domain = providerToDomain[provider]
  }

  return {
    provider,
    repo,
    domain,
  }
}
