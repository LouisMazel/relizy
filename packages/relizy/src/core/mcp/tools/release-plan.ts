import type { ReleaseType } from 'semver'
import type { PreviewCommit, PreviewPackage, PreviewReleaseOptions, PreviewSet } from '../../release-preview'
import type { ServerContext } from '../context'
import { describeOutOfRange } from '@relizy/core'
import { z } from 'zod'
import { UnknownProfileError } from '../../profiles'
import { code } from '../markdown'
import { assertConfigName } from '../runtime'
import { configArgSchema } from './project'
import { ToolInputError } from './types'

const RELEASE_TYPES = [
  'release',
  'major',
  'minor',
  'patch',
  'prerelease',
  'premajor',
  'preminor',
  'prepatch',
] as const satisfies readonly ReleaseType[]

export const releasePlanSchema = {
  config: configArgSchema,
  profile: z.string().optional().describe('Release profile of the config (`profiles`: beta, canary...), as `--profile`: its options come over the config, the other arguments over it. `get_project` lists the profiles'),
  type: z.enum(RELEASE_TYPES).optional().describe('Release type, as the CLI flags (`--minor`, `--prerelease`...). Default: `bump.type` of the config or of the profile, `release` (the bump computed from the commits) without one'),
  preid: z.string().optional().describe('Prerelease identifier (beta, alpha, rc), as `--preid`'),
  groups: z.array(z.string()).optional().describe('Only these version groups of `monorepo.groups`, as `--group`'),
  from: z.string().optional().describe('Start ref of the commits, as `--from`. Default: the last release tag'),
  to: z.string().optional().describe('End ref of the commits, as `--to`. Default: HEAD'),
  canary: z.boolean().optional().describe('Preview a canary release, as `--canary`'),
  force: z.boolean().optional().describe('Bump even without commits, as `--force`'),
  fetchTags: z.boolean().optional().describe('Run `git fetch --tags` first, as the release does (network). Default: false, the local tags are used'),
}

export interface ReleasePlanArgs {
  config?: string
  profile?: string
  type?: ReleaseType
  preid?: string
  groups?: string[]
  from?: string
  to?: string
  canary?: boolean
  force?: boolean
  fetchTags?: boolean
}

/**
 * The options of `previewRelease()` and `previewChangelog()` for the arguments of a
 * tool: the previews of the API are the ones of the tools, a wrong config name is
 * a wrong argument
 */
export function toPreviewOptions(context: ServerContext, args: ReleasePlanArgs): PreviewReleaseOptions {
  assertConfigName({ config: args.config, cwd: context.cwd })

  return {
    cwd: context.cwd,
    configName: args.config,
    profile: args.profile,
    type: args.type,
    preid: args.preid,
    groups: args.groups,
    from: args.from,
    to: args.to,
    canary: args.canary,
    force: args.force,
    fetchTags: args.fetchTags,
  }
}

/** A profile that is not in the config is a wrong argument of the tool */
export function toToolError(error: unknown): unknown {
  return error instanceof UnknownProfileError
    ? new ToolInputError(error.message)
    : error
}

function formatCommit(commit: PreviewCommit): string {
  const scope = commit.scope
    ? `(${commit.scope})`
    : ''

  return `${commit.type}${scope}${commit.breaking ? '!' : ''}: ${commit.description} (${commit.shortHash})`
}

/** The first commits of a list (all of them without `max`), on one line */
export function formatCommits(commits: PreviewCommit[], max = Infinity): string {
  const more = commits.length > max
    ? `; and ${commits.length - max} more (\`full: true\` lists them all)`
    : ''

  return `${commits.slice(0, max).map(formatCommit).join('; ')}${more}`
}

/** Why a package is released, in words */
export function explainBump(pkg: PreviewPackage, { set, full = false }: { set: PreviewSet, full?: boolean }): string {
  const commitsText = pkg.commits.length > 0
    ? `${pkg.commits.length} commit(s): ${formatCommits(pkg.commits, full ? undefined : 5)}`
    : ''

  if (set.versionMode === 'unified') {
    return commitsText
      ? `follows the unified version, ${commitsText}`
      : 'follows the unified version'
  }

  if (pkg.reason === 'graduation') {
    return 'graduates from its prerelease version'
  }

  if (pkg.reason === 'dependency') {
    const dependency = pkg.dependency?.chain[0]
    const otherGroup = pkg.dependency?.group

    if (pkg.dependency?.outOfRange) {
      const { name, ...outOfRange } = pkg.dependency.outOfRange
      const option = outOfRange.field === 'peerDependencies'
        ? 'bump.outOfRangePeers'
        : 'bump.dependents'

      const group = otherGroup
        ? `, bumped by the \`${otherGroup}\` group`
        : ''

      return `${describeOutOfRange({ dependency: name, ...outOfRange })}${group} (\`${option}\`)`
    }

    if (otherGroup) {
      return `depends on \`${dependency}\`, bumped by the \`${otherGroup}\` group`
    }

    return `depends on ${(pkg.dependency?.chain ?? []).map(code).join(' → ')} (\`bump.dependencyTypes\`)`
  }

  return commitsText || 'forced (`force`)'
}
