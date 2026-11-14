import type { ReleaseReport, ReleaseStepReport, ResolvedRelizyConfig } from '../core'
import type { StepCheck } from '../core/events'
import type { AIRewrite, ReleaseLink } from '../core/progress'
import type { GitProvider, HookContext, PostedRelease, PublishResponse, ReleaseContext, ReleaseOptions, SocialResult } from '../types'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { assertBranchUpToDateWithRemote, assertReleaseTagsAvailable, BranchBehindRemoteError, getCIName, getGitPushTarget, getHeadCommit, getPullRequestOutdatedWarning, getPullRequestPushWarning, isPullRequestRun, plural, prepareCiRepository, withGitCache } from '@relizy/core'
import { createCommandUi, createCommitAndTags, describeBumpResult, executeHook, getBumpResultDetails, getHookContext, getReleaseTagNames, isFancyUi, isRelizyCancelError, loadRelizyConfig, mergeConfig, pushCommitAndTags, rollbackModifiedFiles, writeReleaseReport } from '../core'
import { applyAIOverride } from '../core/ai'
import { assertBumpConfirmable } from '../core/bump-prompt'
import { ensurePushAccess } from '../core/ci'
import { runWithEvents } from '../core/events'
import { takeReleaseFacts } from '../core/progress'
import { attachStepLinks, getNpmLinks, getProviderReleaseLinks, getReleaseAI, getReleaseContent, getReleaseGit, getReleasePublish } from '../core/release-facts'
import { describeTags } from '../core/release-report'
import { getBumpStepData, getProviderReleaseStepData, getSocialStepData, takeChangelogFiles, takeCommitAndTagStepData, takePrCommentStepData, takePublishStepData } from '../core/step-data'
import { bump } from './bump'
import { changelog } from './changelog'
import { tryPostPrComment } from './pr-comment'
import { describeProviderReleaseResult, providerRelease, providerReleaseSafetyCheck } from './provider-release'
import { publish, publishSafetyCheck } from './publish'

import { describeSocialResult, isAnySocialPlatformEnabled, social, socialSafetyCheck } from './social'

/** The options of `release` that canary mode turns off */
export const CANARY_OFF_OPTIONS: ReadonlySet<string> = new Set([
  'changelog',
  'commit',
  'push',
  'providerRelease',
  'social',
  'gitTag',
])

type ReleaseStepOption = 'changelog' | 'publish' | 'commit' | 'push' | 'providerRelease' | 'social' | 'prComment'

/**
 * Why a step of the release is off: the flag of the run (`--no-social`), canary
 * mode (`canary`), else the config or the profile (`release.social: false`)
 */
function getOffReason({ config, options, option, flag }: { config: ResolvedRelizyConfig, options: Partial<ReleaseOptions>, option: ReleaseStepOption, flag: string }): string {
  if (options[option] === false) {
    return flag
  }

  if (config.release.canary && CANARY_OFF_OPTIONS.has(option)) {
    return 'canary'
  }

  return `release.${option}: false`
}

/** Why the push is off: the release commit is off, or the push itself */
function getPushOffReason(config: ResolvedRelizyConfig, options: Partial<ReleaseOptions>): string {
  return config.release.commit
    ? getOffReason({
        config,
        options,
        option: 'push',
        flag: '--no-push',
      })
    : getOffReason({
        config,
        options,
        option: 'commit',
        flag: '--no-commit',
      })
}

/**
 * Canary mode (`release.canary`, `--canary`): a prerelease published under its own
 * tag, never committed nor pushed, and without changelog, provider release, tag nor
 * social post. The tag and the preid are the ones of the run, else the ones of the
 * profile when the profile itself is a canary one (`release.canary`), `canary` otherwise:
 * `--profile beta --canary` publishes a canary under `canary`, not under the tag of `beta`.
 */
export function applyCanaryMode(config: ResolvedRelizyConfig, options: Pick<ReleaseOptions, 'preid' | 'tag'> = {}): void {
  const profile = config.profile
    ? config.profiles?.[config.profile]
    : undefined
  const canaryProfile = profile?.release?.canary === true
    ? profile
    : undefined

  config.release.commit = false
  config.release.push = false
  config.release.changelog = false
  config.release.providerRelease = false
  config.release.social = false
  config.release.gitTag = false

  config.bump.type = 'prerelease'
  config.bump.preid = options.preid || canaryProfile?.bump?.preid || 'canary'
  config.publish.tag = options.tag || canaryProfile?.publish?.tag || 'canary'
}

/** The config of a release run: the config file and the profile, with the options of the run */
export async function getReleaseConfig(options: Partial<ReleaseOptions> = {}): Promise<ResolvedRelizyConfig> {
  const config = await loadReleaseConfig(options)

  if (config.release.canary) {
    applyCanaryMode(config, options)
  }

  return config
}

function loadReleaseConfig(options: Partial<ReleaseOptions>) {
  return loadRelizyConfig({
    configFile: options.configName,
    baseConfig: options.config,
    profile: options.profile,
    // The options of the call over `overrides`
    overrides: mergeConfig({
      logLevel: options.logLevel,
      from: options.from,
      to: options.to,
      tokens: {
        github: options.token,
        gitlab: options.token,
        registry: options.publishToken,
      },
      bump: {
        type: options.type,
        preid: options.preid,
        clean: options.clean,
        yes: options.yes,
        dependencyTypes: options.dependencyTypes,
        capZeroMajor: options.capZeroMajor,
        outOfRangePeers: options.outOfRangePeers,
        dependents: options.dependents,
      },
      changelog: {
        formatCmd: options.formatCmd,
        rootChangelog: options.rootChangelog,
        includeCommitBody: options.includeCommitBody,
      },
      publish: {
        access: options.access,
        otp: options.otp,
        registry: options.registry,
        registries: options.registries,
        tag: options.tag,
        buildCmd: options.buildCmd,
        skipExistingVersions: options.skipExistingVersions,
        checkWorkspaceDependencies: options.checkWorkspaceDependencies,
        args: options.args,
        packageManager: options.packageManager,
        safetyCheckTimeout: options.safetyCheckTimeout,
      },
      release: {
        commit: options.commit,
        changelog: options.changelog,
        push: options.push,
        publish: options.publish,
        noVerify: options.noVerify,
        providerRelease: options.providerRelease,
        canary: options.canary,
        clean: options.clean,
        gitTag: options.gitTag,
        social: options.social,
        prComment: options.prComment,
        report: options.report,
      },
      monorepo: options.privatePackages !== undefined
        ? { privatePackages: options.privatePackages }
        : undefined,
      safetyCheck: options.safetyCheck,
    }, options.overrides),
  })
}

function shouldPushReleaseCommit(config: ResolvedRelizyConfig): boolean {
  return Boolean(config.release.push && config.release.commit)
}

/**
 * Run a pre-publish guard and restore the release files it leaves behind when
 * it fails, so a re-run starts from a clean tree.
 */
async function guardBeforePublish({ config, dryRun, guard }: { config: ResolvedRelizyConfig, dryRun: boolean, guard: () => Promise<void> }) {
  try {
    await guard()
  }
  catch (error) {
    if (!dryRun) {
      logger.fail('Release aborted before publishing, rolling back modified files...')
      await rollbackModifiedFiles({ config })
    }
    throw error
  }
}

/**
 * Check that the release can be pushed. A dry run of a pull request only
 * warns: its token is read-only, while the release runs where it can push
 */
async function checkPushAccess({ config, dryRun }: { config: ResolvedRelizyConfig, dryRun: boolean }) {
  try {
    await ensurePushAccess({ config })
  }
  catch (error) {
    if (!dryRun || !isPullRequestRun()) {
      throw error
    }

    logger.warn(getPullRequestPushWarning())
  }
}

const outdatedRunWarned = new WeakSet<ResolvedRelizyConfig>()

/**
 * Check that the branch is up to date with its remote. A dry run of a pull
 * request only warns, once: the commits pushed after it started get their own
 * run, and the release checks the branch again
 */
async function checkBranchUpToDate({ config, dryRun }: { config: ResolvedRelizyConfig, dryRun: boolean }) {
  try {
    await assertBranchUpToDateWithRemote({ cwd: config.cwd, logger })
  }
  catch (error) {
    if (!(error instanceof BranchBehindRemoteError) || !dryRun || !isPullRequestRun()) {
      throw error
    }

    if (!outdatedRunWarned.has(config)) {
      outdatedRunWarned.add(config)
      logger.warn(getPullRequestOutdatedWarning(error))
    }
  }
}

/**
 * A safety check of the release, as data: skipped when its step does not run,
 * passed or failed once it has run
 */
async function runCheck(checks: StepCheck[], { name, skippedBy, check }: { name: string, skippedBy?: string, check: () => Promise<void> }): Promise<void> {
  const entry: StepCheck = { name, status: 'passed' }
  checks.push(entry)

  if (skippedBy) {
    entry.status = 'skipped'
    entry.message = skippedBy
    return
  }

  try {
    await check()
  }
  catch (error) {
    entry.status = 'failed'
    entry.message = getErrorMessage(error)
    throw error
  }
}

async function releaseSafetyCheck({
  config,
  options = {},
  provider,
  ai,
  dryRun,
  checks = [],
}: {
  config: ResolvedRelizyConfig
  /** The options of the run, for why a check is skipped */
  options?: Partial<ReleaseOptions>
  provider?: GitProvider
  ai?: boolean
  dryRun: boolean
  /** Filled with each check and its status */
  checks?: StepCheck[]
}) {
  if (!config.safetyCheck) {
    return
  }

  logger.box('Safety checks')
  logger.start('Start safety checks')

  const pushSkippedBy = getPushOffReason(config, options)
  const pushes = shouldPushReleaseCommit(config)
  // Every check runs to the end, so each one has its status: the first failure is thrown
  const results = await Promise.allSettled([
    runCheck(checks, {
      name: 'provider-release',
      skippedBy: config.release.providerRelease
        ? undefined
        : getOffReason({
            config,
            options,
            option: 'providerRelease',
            flag: '--no-provider-release',
          }),
      check: () => providerReleaseSafetyCheck({ config, provider, ai }),
    }),
    // The release only publishes with release.publish (disabled by --no-publish)
    runCheck(checks, {
      name: 'publish',
      skippedBy: config.release.publish
        ? undefined
        : getOffReason({
            config,
            options,
            option: 'publish',
            flag: '--no-publish',
          }),
      check: () => publishSafetyCheck({ config }),
    }),
    // The release only posts with release.social (disabled by --no-social and --canary)
    runCheck(checks, {
      name: 'social',
      skippedBy: config.release.social
        ? undefined
        : getOffReason({
            config,
            options,
            option: 'social',
            flag: '--no-social',
          }),
      check: () => socialSafetyCheck({ config }),
    }),
    runCheck(checks, {
      name: 'branch',
      skippedBy: pushes ? undefined : pushSkippedBy,
      check: () => checkBranchUpToDate({ config, dryRun }),
    }),
    runCheck(checks, {
      name: 'push',
      skippedBy: pushes ? undefined : pushSkippedBy,
      check: () => checkPushAccess({ config, dryRun }),
    }),
  ])
  const failure = results.find(result => result.status === 'rejected')

  if (failure) {
    logger.error('Safety checks failed')
    throw failure.reason
  }

  logger.success('Safety checks passed')
}

/** The published versions: `relizy@2.0.0`, or their count */
function describePublished(packages: PublishResponse['publishedPackages']): string {
  return packages.length === 1
    ? `${packages[0]!.name}@${packages[0]!.newVersion ?? packages[0]!.version}`
    : plural(packages.length, 'package')
}

export function release(options: Partial<ReleaseOptions> = {}): Promise<ReleaseReport> {
  // One git cache for the run: the same refs and ranges are read for each package and each step
  return runWithEvents(options.onProgress, () => withGitCache(() => runRelease(options)), {
    onConfirm: options.onConfirm,
    onOtp: options.onOtp,
    command: 'release',
  })
}

// eslint-disable-next-line sonarjs/cognitive-complexity, complexity
async function runRelease(options: Partial<ReleaseOptions> = {}): Promise<ReleaseReport> {
  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  const force = options.force ?? false
  logger.debug(`Force bump: ${force}`)

  const config = await getReleaseConfig(options)
  const isCanary = config.release.canary === true

  if (isCanary) {
    logger.info('Canary mode enabled')
  }

  applyAIOverride(config, options.ai)

  logger.debug(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)
  logger.debug(`Push: ${config.release.push}, Publish: ${config.release.publish}, Provider Release: ${config.release.providerRelease}`)

  const ui = createCommandUi({
    command: 'release',
    title: `relizy release${config.profile
      ? ` --profile ${config.profile}`
      : ''}${isCanary ? ' --canary' : ''}`,
    dryRun,
    logLevel: config.logLevel,
    cwd: config.cwd,
  })
  // The facts recorded by the steps (links, AI rewrites) start with this release
  takeReleaseFacts()
  // The step running when the release fails
  let currentStep = 'Checks'

  // Known once the bump is done, for the hooks of the next steps
  let hookContext: HookContext | undefined
  let createdTags: string[] = []
  const steps: ReleaseStepReport[] = []
  // What the release brings, for its summary and its report
  const facts: Pick<ReleaseReport, 'content' | 'git' | 'publish' | 'ai'> = {}
  const links: ReleaseLink[] = []
  const aiRewrites: AIRewrite[] = []
  let committed = false
  const collectFacts = async () => {
    const recorded = takeReleaseFacts()
    links.push(...recorded.links)
    aiRewrites.push(...recorded.aiRewrites)
    facts.ai = getReleaseAI(aiRewrites)
    facts.git = await getReleaseGit({ config, committed, dryRun })
    attachStepLinks(steps, links)
  }
  // The detail only says what a step did: none for a skipped step
  const addStep = (name: ReleaseStepReport['name'], done: boolean, detail?: string) => {
    steps.push({
      name,
      status: done ? 'done' : 'skipped',
      ...(done && detail
        ? { detail }
        : {}),
    })
  }
  const reportOf = (status: ReleaseReport['status'], error?: unknown): ReleaseReport => ({
    status,
    released: status === 'released' && !dryRun,
    dryRun,
    canary: isCanary,
    release: hookContext?.release,
    version: hookContext?.release.groups.find(group => group.versionMode !== 'independent')?.version,
    tags: [...createdTags],
    // A copy: the report of the PR comment is the release so far
    steps: steps.map(step => ({ ...step })),
    ...Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== undefined)),
    ...(error === undefined
      ? {}
      : {
          error: error instanceof Error
            ? error.message
            : String(error),
          failedStep: currentStep,
        }),
  })
  // Before the release commit: after a merge, its pull request is the one commented
  const startCommit = getHeadCommit(config.cwd)
  const postPrComment = (releaseContext: ReleaseContext) => tryPostPrComment({
    config,
    releaseContext: { ...releaseContext, sha: startCommit },
    prNumber: options.prNumber,
    dryRun,
  })

  try {
    // A failed check also writes the report, comments the pull request and runs error:release
    // The application confirms with onConfirm, without terminal
    assertBumpConfirmable({
      command: 'release',
      yes: config.bump.yes || Boolean(options.onConfirm),
      ciName: getCIName(),
    })
    // The CI clone: full history, branch, identity
    prepareCiRepository(config.cwd, { logger })

    if (config.safetyCheck) {
      const checks: StepCheck[] = []
      await ui.step({
        name: 'checks',
        running: 'Checking the release',
        done: () => 'Ready to release (tokens, registry, branch)',
        data: () => ({ checks }),
        failedData: () => ({ checks }),
        run: () => releaseSafetyCheck({
          config,
          options,
          provider: options.provider,
          ai: options.ai,
          dryRun,
          checks,
        }),
      })
    }
    else {
      ui.skip({
        name: 'checks',
        title: 'Safety checks',
        label: 'Checks',
        reason: options.safetyCheck === false
          ? '--no-safety-check'
          : 'safetyCheck: false',
      })
    }

    await executeHook('before:release', config, dryRun)

    currentStep = 'Bump'
    const bumpResult = await ui.step({
      name: 'bump',
      title: [
        'Bump versions',
        `- type: ${config.bump.type}`,
        ...(config.bump.preid
          ? [`- preid: ${config.bump.preid}`]
          : []),
      ],
      running: 'Computing the versions',
      done: describeBumpResult,
      data: getBumpStepData,
      // Already listed before the confirmation
      details: result => getBumpResultDetails(result, config.bump.yes || Boolean(options.onConfirm)),
      run: () => bump({
        dryRun,
        config,
        force,
        configName: options.configName,
        suffix: options.suffix,
        canary: isCanary,
        groups: options.groups,
      }),
    })

    hookContext = getHookContext(config, bumpResult.bumped ? bumpResult : undefined)
    if (bumpResult.bumped) {
      facts.content = getReleaseContent({ bumpResult, config })
    }

    if (!bumpResult.bumped) {
      logger.debug('No packages bumped')

      await collectFacts()

      if (config.release.prComment) {
        await ui.step({
          name: 'pr-comment',
          title: 'Post PR comment',
          running: 'Commenting the pull request',
          done: posted => posted ? 'Pull request commented' : 'No pull request to comment',
          data: takePrCommentStepData,
          run: () => postPrComment({
            status: 'no-release',
            report: reportOf('nothing'),
          }),
        })
        await collectFacts()
      }

      const report = reportOf('nothing')
      ui.finish(report)
      writeReleaseReport({ config, report })

      return report
    }

    if (config.release.commit) {
      await guardBeforePublish({
        config,
        dryRun,
        guard: () => assertReleaseTagsAvailable({
          tags: getReleaseTagNames({
            config,
            bumpedPackages: bumpResult.bumpedPackages,
            newVersion: bumpResult.newVersion,
            groups: bumpResult.groups,
          }),
          cwd: config.cwd,
        }),
      })
    }

    currentStep = 'Changelog'
    if (config.release.changelog) {
      const files = new Set(bumpResult.bumpedPackages.map(pkg => pkg.path))
      if (config.changelog.rootChangelog) {
        files.add(config.cwd)
      }
      const count = files.size
      await ui.step({
        name: 'changelog',
        title: 'Generate changelogs',
        running: 'Writing the changelogs',
        done: () => `${plural(count, 'changelog')} written`,
        data: takeChangelogFiles,
        failedData: takeChangelogFiles,
        run: () => changelog({
          dryRun,
          bumpResult,
          config,
          configName: options.configName,
          force,
          suffix: options.suffix,
          groups: options.groups,
        }),
      })
    }
    else {
      ui.skip({
        name: 'changelog',
        title: 'Generate changelogs',
        label: 'Changelogs',
        reason: getOffReason({
          config,
          options,
          option: 'changelog',
          flag: '--no-changelog',
        }),
      })
    }
    addStep('changelog', Boolean(config.release.changelog))

    currentStep = 'Publish'
    let publishResponse: PublishResponse | undefined

    if (config.release.publish) {
      publishResponse = await ui.step({
        name: 'publish',
        title: 'Publish packages to registry',
        running: 'Publishing the packages',
        done: (response) => {
          const packages = response?.publishedPackages.map(pkg => `${pkg.name}@${pkg.newVersion ?? pkg.version}`).join(', ')
          const tag = config.publish.tag
            ? ` (${config.publish.tag})`
            : ''
          return packages
            ? `Published ${packages}${tag}`
            : 'Nothing to publish'
        },
        data: () => takePublishStepData(config, { dryRun }),
        failedData: () => takePublishStepData(config, { dryRun }),
        run: async () => {
          // Packages are published before the push: make sure the release commit
          // will be pushable, as new commits may have landed while the release ran.
          if (shouldPushReleaseCommit(config)) {
            await guardBeforePublish({
              config,
              dryRun,
              guard: () => checkBranchUpToDate({ config, dryRun }),
            })
          }

          try {
            const response = await publish({
              bumpResult,
              dryRun,
              config,
              configName: options.configName,
              suffix: options.suffix,
              force,
              safetyCheck: false,
              groups: options.groups,
            })

            if (isCanary) {
              logger.debug('Canary publish done, rolling back modified files...')
              await rollbackModifiedFiles({ config })
            }

            return response
          }
          catch (error) {
            logger.fail('Publish failed, rolling back modified files...')
            await rollbackModifiedFiles({ config })
            throw error
          }
        },
      })
    }
    else {
      if (shouldPushReleaseCommit(config)) {
        await guardBeforePublish({
          config,
          dryRun,
          guard: () => checkBranchUpToDate({ config, dryRun }),
        })
      }
      ui.skip({
        name: 'publish',
        title: 'Publish packages to registry',
        label: 'Publish',
        reason: getOffReason({
          config,
          options,
          option: 'publish',
          flag: '--no-publish',
        }),
      })

      // A canary is never committed: its versions are restored, as after its publish
      if (isCanary) {
        await rollbackModifiedFiles({ config })
      }
    }
    addStep('publish', Boolean(config.release.publish), publishResponse && describePublished(publishResponse.publishedPackages))
    if (publishResponse) {
      facts.publish = getReleasePublish({ config, packages: publishResponse.publishedPackages })
      links.push(...getNpmLinks({ config, packages: publishResponse.publishedPackages }))
    }

    currentStep = 'Commit'
    if (config.release.commit) {
      createdTags = await ui.step({
        name: 'commit-and-tag',
        title: 'Commit changes and create tag',
        running: 'Committing and tagging',
        done: tags => `Committed and tagged ${tags.join(', ')}`,
        data: takeCommitAndTagStepData,
        // The commit made before the tags failed
        failedData: () => takeCommitAndTagStepData([]),
        run: () => createCommitAndTags({
          config,
          noVerify: config.release.noVerify,
          bumpedPackages: bumpResult.bumpedPackages,
          newVersion: bumpResult.newVersion,
          groups: bumpResult.groups,
          dryRun,
        }),
      })
    }
    else {
      ui.skip({
        name: 'commit-and-tag',
        title: 'Commit changes and create tag',
        label: 'Commit and tags',
        reason: getOffReason({
          config,
          options,
          option: 'commit',
          flag: '--no-commit',
        }),
      })
    }
    committed = Boolean(config.release.commit)
    addStep('commit', committed, committed
      ? describeTags(createdTags)
      : undefined)

    currentStep = 'Push'
    if (config.release.push && config.release.commit) {
      await ui.step({
        name: 'push',
        title: 'Push changes and tags',
        running: 'Pushing',
        done: () => 'Pushed the commit and the tags',
        data: target => ({
          ...target,
          tags: Boolean(config.release.gitTag) && createdTags.length > 0,
        }),
        run: async () => {
          try {
            await executeHook('before:push', config, dryRun, hookContext)
            const target = await getGitPushTarget(config.cwd)
            await pushCommitAndTags({
              config,
              dryRun,
              cwd: config.cwd,
              tags: createdTags,
            })
            await executeHook('success:push', config, dryRun, hookContext)
            return target
          }
          catch (error) {
            await executeHook('error:push', config, dryRun, hookContext)
            throw error
          }
        },
      })
    }
    else {
      ui.skip({
        name: 'push',
        title: 'Push changes and tags',
        label: 'Push',
        reason: getPushOffReason(config, options),
      })
    }
    addStep('push', Boolean(config.release.push && config.release.commit))

    currentStep = 'Provider release'
    let provider = options.provider || config.repo?.provider
    let postedReleases: PostedRelease[] = []
    let providerError: string | undefined

    if (config.release.providerRelease) {
      logger.debug(`Provider from config: ${provider}`)

      const response = await ui.step({
        name: 'provider-release',
        title: 'Publish Git release',
        running: 'Creating the releases',
        done: describeProviderReleaseResult,
        failed: result => Boolean(result.error),
        data: result => getProviderReleaseStepData(config, result),
        run: () => providerRelease({
          provider,
          dryRun,
          config,
          bumpResult,
          configName: options.configName,
          force,
          suffix: options.suffix,
          safetyCheck: false,
          groups: options.groups,
          ai: options.ai,
        }),
      })
      provider = response.detectedProvider
      postedReleases = response.postedReleases
      providerError = response.error
      links.push(...getProviderReleaseLinks({ config, postedReleases }))
    }
    else {
      ui.skip({
        name: 'provider-release',
        title: 'Publish Git release',
        label: 'GitHub/GitLab release',
        reason: getOffReason({
          config,
          options,
          option: 'providerRelease',
          flag: '--no-provider-release',
        }),
      })
    }
    if (providerError) {
      steps.push({ name: 'providerRelease', status: 'failed', detail: providerError })
    }
    else {
      addStep('providerRelease', Boolean(config.release.providerRelease), `${plural(postedReleases.length, 'release')} on ${provider}`)
    }

    currentStep = 'Social media'
    let socialResults: SocialResult | undefined

    if (config.release.social && isAnySocialPlatformEnabled(config)) {
      socialResults = await ui.step({
        name: 'social',
        title: 'Post release to social media',
        running: 'Posting the release',
        done: describeSocialResult,
        failed: result => result.hasErrors,
        data: result => getSocialStepData(result, { dryRun }),
        run: () => social({
          config,
          configName: options.configName,
          bumpResult,
          dryRun,
          safetyCheck: false, // Already checked in releaseSafetyCheck
          slackFormat: options.slackFormat,
          groups: options.groups,
        }),
      })
    }
    else {
      ui.skip({
        name: 'social',
        title: 'Post release to social media',
        label: 'Social posts',
        reason: config.release.social
          ? 'no platform enabled'
          : getOffReason({
              config,
              options,
              option: 'social',
              flag: '--no-social',
            }),
      })
    }
    if (socialResults?.hasErrors) {
      steps.push({
        name: 'social',
        status: 'failed',
        detail: socialResults.results.filter(result => !result.success).map(result => `${result.platform}: ${result.error}`).join(', '),
      })
    }
    else if (socialResults?.results.length && socialResults.results.every(result => result.skipped)) {
      // Every platform posted nothing: a prerelease with `onlyStable`, or no version to announce
      steps.push({
        name: 'social',
        status: 'skipped',
        detail: socialResults.results.map(result => `${result.platform}: ${result.skipped}`).join(', '),
      })
    }
    else {
      addStep('social', Boolean(socialResults?.results.length), socialResults?.results.map(result => result.skipped
        ? `${result.platform} skipped (${result.skipped})`
        : result.platform).join(', '))
    }

    currentStep = 'PR comment'
    let prCommentPosted = false
    if (config.release.prComment) {
      // The comment is the summary of the release so far
      await collectFacts()
      const reportSoFar = reportOf('released')
      prCommentPosted = await ui.step({
        name: 'pr-comment',
        title: 'Post PR comment',
        running: 'Commenting the pull request',
        done: posted => posted ? 'Pull request commented' : 'No pull request to comment',
        data: takePrCommentStepData,
        run: () => postPrComment({
          status: 'success',
          bumpResult,
          tags: createdTags,
          report: reportSoFar,
        }),
      })
    }
    else {
      ui.skip({
        name: 'pr-comment',
        title: 'Post PR comment',
        label: 'PR comment',
        reason: getOffReason({
          config,
          options,
          option: 'prComment',
          flag: '--no-pr-comment',
        }),
      })
    }
    addStep('prComment', prCommentPosted, dryRun ? 'previewed' : 'posted')

    await collectFacts()
    const report = reportOf('released')
    ui.finish(report)
    writeReleaseReport({ config, report })

    await executeHook('success:release', config, dryRun, hookContext)

    return report
  }
  catch (error) {
    // Refused or cancelled prompt: nothing was written, it is not a failure
    if (isRelizyCancelError(error)) {
      ui.fail(error)
      throw error
    }

    if (!isFancyUi()) {
      logger.error('Error during release workflow!\n\n', error)
    }

    await collectFacts()
    const report = reportOf('failed', error)

    await postPrComment({ status: 'failed', error: report.error, report })
    await executeHook('error:release', config, dryRun, hookContext)

    writeReleaseReport({ config, report })
    ui.fail(error, currentStep, report)

    throw error
  }
}
