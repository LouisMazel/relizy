import type { GitProvider, Reference, RepoConfig } from '../types'
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
 */
export function formatReference(ref: Reference, repo?: RepoConfig): string {
  if (!repo || !(repo.provider! in providerToRefSpec)) {
    return ref.value
  }
  const refSpec = providerToRefSpec[repo.provider!]
  return `[${ref.value}](${baseUrl(repo)}/${refSpec[ref.type]}/${ref.value.replace(/^#/, '')})`
}

/**
 * Markdown link comparing `config.from` to `v` (or `config.to`)
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
 * `package.json`, else from the `origin` remote. Undefined without both.
 */
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
 * `github:owner/name` or `owner/name`)
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
