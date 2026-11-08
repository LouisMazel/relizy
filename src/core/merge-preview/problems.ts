import type { ResolvedRelizyConfig } from '../config'
import type { MergePreviewContext } from './context'
import type { MergePreviewOutcome, MergePreviewPlan } from './plan'
import { getCommitsInRange, hasRelizyCommitMsgHook, lintCommitMessage } from '../commitlint'
import { getWorkspacePackages } from '../commitlint/workspace'
import { parseGitCommit } from '../commits'
import { isSetInUserConfig } from '../config'
import { getReleaseTagNames } from '../git'
import { tryGit } from '../git-exec'
import { resolveRegistryTargetsForPackage } from '../npm-registry'
import { isVersionPublished } from '../npm-versions'

/**
 * What would make the release of the merge fail, or release a broken result.
 * A major bump or nothing to release are normal outcomes, not problems.
 */
export interface MergePreviewProblem {
  kind: 'version-taken' | 'tag-taken' | 'squash-title' | 'commitlint' | 'error'
  message: string
}

export interface MergePreviewChecks {
  problems: MergePreviewProblem[]
  /** What could not be checked (registry or remote unreachable), or computed as is */
  warnings: string[]
}

/** The squash merge is possible: forced, detected, or the merge method is unknown */
function canSquash(plan: MergePreviewPlan): boolean {
  return plan.squash.mode !== 'commits' && Boolean(plan.squash.squash)
}

/** The outcomes of the plan: the release of the merge, and the one of a squash merge when it differs */
function getOutcomes(plan: MergePreviewPlan): MergePreviewOutcome[] {
  return plan.squashOutcome ? [plan.outcome, plan.squashOutcome] : [plan.outcome]
}

async function checkPublishedVersions(config: ResolvedRelizyConfig, outcome: MergePreviewOutcome, checks: MergePreviewChecks): Promise<void> {
  if (!config.release.publish || !outcome.bumpResult.bumped) {
    return
  }

  const packages = outcome.bumpResult.bumpedPackages.filter(pkg => !pkg.private && pkg.newVersion)
  await Promise.all(packages.flatMap((pkg) => {
    const registryTargets = resolveRegistryTargetsForPackage(pkg, config)
    return registryTargets.map(async (registryTarget) => {
      const version = pkg.newVersion!
      const published = await isVersionPublished({ pkg, version, config, packageManager: config.publish.packageManager, registryTarget })
      // The registry is only named when the package is published to several ones, as the publish does
      const registry = registryTargets.length > 1 ? ` (${registryTarget.name ?? registryTarget.registry ?? 'default'})` : ''
      if (published) {
        checks.problems.push({ kind: 'version-taken', message: `${pkg.name}@${version} is already published${registry}: the publish would fail. Check the versions in the package.json files, they are behind the latest release` })
      }
      else if (published === null) {
        checks.warnings.push(`Could not check whether ${pkg.name}@${version} is already published${registry}`)
      }
    })
  }))
}

async function checkRemoteTags(config: ResolvedRelizyConfig, outcome: MergePreviewOutcome, checks: MergePreviewChecks): Promise<void> {
  if (!config.release.commit || !outcome.bumpResult.bumped) {
    return
  }

  const { bumpedPackages, newVersion, groups } = outcome.bumpResult
  const tags = getReleaseTagNames({ config, bumpedPackages, newVersion, groups })
  if (tags.length === 0) {
    return
  }

  const output = await tryGit(['ls-remote', '--tags', 'origin', ...tags.map(tag => `refs/tags/${tag}`)], { cwd: config.cwd })
  if (output === undefined) {
    checks.warnings.push('Could not check the tags of the remote')
    return
  }

  const remoteTags = new Set(output.split('\n').map(line => line.split('\t')[1]?.replace(/^refs\/tags\//, '').replace(/\^\{\}$/, '')).filter(Boolean))
  for (const tag of tags.filter(tag => remoteTags.has(tag))) {
    checks.problems.push({ kind: 'tag-taken', message: `The tag ${tag} already exists on the remote: the release would fail. Check the versions in the package.json files, they are behind the latest release` })
  }
}

function checkSquashTitle(plan: MergePreviewPlan, context: MergePreviewContext, checks: MergePreviewChecks): void {
  const commit = plan.squash.squash?.commit
  if (!canSquash(plan) || !commit || parseGitCommit(commit, {})) {
    return
  }

  checks.problems.push({
    kind: 'squash-title',
    message: `A squash merge creates the commit "${commit.message}", which is not a Conventional Commit: the release would ignore the changes of the ${context.pullRequest.kind}. Write its title as "type(scope): subject"`,
  })
}

/**
 * Lint the commits of the pull request, and the commit of its squash merge,
 * with the commitlint of relizy: when `mergePreview.commitlint` is
 * true, or `auto` and the project uses it (a `commitlint` option in its
 * config, or a commit-msg hook running `relizy commitlint`)
 */
async function checkCommitlint({ config, plan, context, option, checks }: {
  config: ResolvedRelizyConfig
  plan: MergePreviewPlan
  context: MergePreviewContext
  option: 'auto' | boolean
  checks: MergePreviewChecks
}): Promise<void> {
  const enabled = option === 'auto' ? isSetInUserConfig(config, 'commitlint') || hasRelizyCommitMsgHook(config.cwd) : option
  if (!enabled) {
    return
  }

  const packages = getWorkspacePackages(config)
  const commits = getCommitsInRange({ from: context.targetSha, to: context.headSha, cwd: config.cwd })
  const squash = canSquash(plan) ? plan.squash.squash : undefined
  const entries = [
    ...(squash ? [{ label: 'the squash commit', message: squash.commit.message, files: [...new Set(commits.flatMap(commit => commit.files))], hash: undefined }] : []),
    ...commits.map(commit => ({ label: commit.hash.slice(0, 7), message: commit.message, files: commit.files, hash: commit.hash })),
  ]

  for (const entry of entries) {
    const result = await lintCommitMessage(entry.message, { config, packages, files: entry.files, hash: entry.hash, suggest: false })
    const errors = result.problems.filter(problem => problem.severity === 'error')
    if (errors.length > 0) {
      checks.problems.push({
        kind: 'commitlint',
        message: `${entry.label} "${entry.message.split('\n')[0]}": ${errors.map(problem => problem.message).join('; ')}`,
      })
    }
  }
}

/**
 * Check the release of the merge for what would make it fail: a version or a
 * tag already taken, a squash commit that is not a Conventional Commit, the
 * commitlint of the project
 */
export async function checkMergePreview({ config, plan, context, commitlint }: {
  config: ResolvedRelizyConfig
  plan: MergePreviewPlan
  /** The pull request and its merge, none outside a pull request pipeline: its commits are not linted */
  context?: MergePreviewContext
  commitlint: 'auto' | boolean
}): Promise<MergePreviewChecks> {
  const checks: MergePreviewChecks = { problems: [], warnings: context?.warning ? [context.warning] : [] }

  for (const outcome of getOutcomes(plan)) {
    await Promise.all([checkPublishedVersions(config, outcome, checks), checkRemoteTags(config, outcome, checks)])
  }
  if (context) {
    checkSquashTitle(plan, context, checks)
    await checkCommitlint({ config, plan, context, option: commitlint, checks })
  }

  // The same version or tag found by both outcomes is one problem
  checks.problems = checks.problems.filter((problem, index) => checks.problems.findIndex(other => other.message === problem.message) === index)
  checks.warnings = [...new Set(checks.warnings)]

  return checks
}
