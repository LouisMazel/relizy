import type { ReleaseType } from 'semver'
import type { PlannedBumps } from '../../commands/bump'
import type { ResolvedRelizyConfig } from '../../core'
import type { BumpResult, BumpResultTruthy, GitCommit, PackageBase } from '../../types'
import type { ServerContext } from '../context'
import type { PackageSet } from './project'

import { z } from 'zod'
import { planBumps } from '../../commands/bump'
import { fetchGitTags } from '../../core'
import { code } from '../markdown'
import { loadProjectConfig } from '../runtime'
import { configArgSchema, readPackageSets } from './project'

const RELEASE_TYPES = ['release', 'major', 'minor', 'patch', 'prerelease', 'premajor', 'preminor', 'prepatch'] as const satisfies readonly ReleaseType[]

export const releasePlanSchema = {
  config: configArgSchema,
  type: z.enum(RELEASE_TYPES).optional().describe('Release type, as the CLI flags (`--minor`, `--prerelease`...). Default: `release`, the bump computed from the commits'),
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
  type?: ReleaseType
  preid?: string
  groups?: string[]
  from?: string
  to?: string
  canary?: boolean
  force?: boolean
  fetchTags?: boolean
}

export interface ReleasePlan {
  config: ResolvedRelizyConfig
  planned: PlannedBumps
  /** Packages of each version group (a single set without groups) */
  sets: PackageSet[]
  /** The bump of each set, `{ bumped: false }` when the set does not release */
  results: { set: PackageSet, result: BumpResult }[]
}

/** Plan the next release like `relizy release` does, without confirmation, hook, write nor network (unless `fetchTags`) */
export async function planRelease(context: ServerContext, args: ReleasePlanArgs): Promise<ReleasePlan> {
  const config = await loadProjectConfig({
    config: args.config,
    cwd: context.cwd,
    overrides: {
      bump: { type: args.type, preid: args.preid },
      from: args.from,
      to: args.to,
    },
  })

  if (args.fetchTags) {
    await fetchGitTags(config.cwd)
  }

  const planned = await planBumps({ config, dryRun: true, force: args.force, canary: args.canary, groups: args.groups })
  const sets = readPackageSets(config).filter(set => !set.group || !args.groups?.length || args.groups.includes(set.group.name))
  const results = sets.map(set => ({
    set,
    result: set.group
      ? planned.groups?.find(({ group }) => group.name === set.group!.name)?.result ?? { bumped: false as const }
      : planned.result,
  }))

  return { config, planned, sets, results }
}

function formatCommit(commit: GitCommit): string {
  const scope = commit.scope ? `(${commit.scope})` : ''

  return `${commit.type}${scope}${commit.isBreaking ? '!' : ''}: ${commit.description} (${commit.shortHash})`
}

/** The first commits of a list (all of them without `max`), on one line */
export function formatCommits(commits: GitCommit[], max = Infinity): string {
  const more = commits.length > max ? `; and ${commits.length - max} more (\`full: true\` lists them all)` : ''

  return `${commits.slice(0, max).map(formatCommit).join('; ')}${more}`
}

/** Why a package is released, in words */
export function explainBump(pkg: PackageBase, { set, plan, full = false }: { set: PackageSet, plan: ReleasePlan, full?: boolean }): string {
  const commits = pkg.commits ?? []
  const commitsText = commits.length > 0 ? `${commits.length} commit(s): ${formatCommits(commits, full ? undefined : 5)}` : ''

  if (set.versionMode === 'unified') {
    return commitsText ? `follows the unified version, ${commitsText}` : 'follows the unified version'
  }

  if (pkg.reason === 'graduation') {
    return 'graduates from its prerelease version'
  }

  if (pkg.reason === 'dependency') {
    const dependency = pkg.dependencyChain?.[0]
    const otherGroup = dependency ? plan.sets.find(other => other !== set && other.packages.some(candidate => candidate.name === dependency))?.group : undefined

    if (pkg.outOfRangePeer) {
      return `the published range of its peer dependency \`${pkg.outOfRangePeer}\` rejects the new version of it (\`bump.outOfRangePeers\`)`
    }

    if (otherGroup) {
      return `depends on \`${dependency}\`, bumped by the \`${otherGroup.name}\` group`
    }

    return `depends on ${(pkg.dependencyChain ?? []).map(code).join(' → ')} (\`bump.dependencyTypes\`)`
  }

  return commitsText || 'forced (`force`)'
}

export function isBumped(result: BumpResult): result is BumpResultTruthy {
  return result.bumped
}
