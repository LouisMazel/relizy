import type { ReleaseReport, ReleaseStepReport, ResolvedRelizyConfig } from '../core'
import type { AIRewrite, ReleaseLink } from '../core/progress'
import type { GitProvider, HookContext, PostedRelease, PublishResponse, ReleaseContext, ReleaseOptions, SocialResult } from '../types'
import { logger } from '@maz-ui/node'
import {
  assertBranchUpToDateWithRemote,
  assertReleaseTagsAvailable,
  createCommandUi,
  createCommitAndTags,
  describeBumpResult,
  executeHook,
  getBumpResultDetails,
  getHookContext,
  getReleaseTagNames,
  isFancyUi,
  isRelizyCancelError,
  loadRelizyConfig,
  pushCommitAndTags,
  rollbackModifiedFiles,
  writeReleaseReport,
} from '../core'
import { applyAIOverride } from '../core/ai'
import { takeReleaseFacts } from '../core/progress'
import { attachStepLinks, getNpmLinks, getProviderReleaseLinks, getReleaseAI, getReleaseContent, getReleaseGit, getReleasePublish } from '../core/release-facts'
import { bump } from './bump'
import { changelog } from './changelog'
import { tryPostPrComment } from './pr-comment'
import { describeProviderReleaseResult, providerRelease, providerReleaseSafetyCheck } from './provider-release'
import { publish, publishSafetyCheck } from './publish'

import { describeSocialResult, social, socialSafetyCheck } from './social'

function getReleaseConfig(options: Partial<ReleaseOptions> = {}) {
  return loadRelizyConfig({
    configFile: options.configName,
    overrides: {
      logLevel: options.logLevel,
      from: options.from,
      to: options.to,
      tokens: {
        github: options.token,
        gitlab: options.token,
      },
      bump: {
        type: options.type,
        preid: options.preid,
        clean: options.clean,
        yes: options.yes,
      },
      changelog: {
        formatCmd: options.formatCmd,
        rootChangelog: options.rootChangelog,
      },
      publish: {
        access: options.access,
        otp: options.otp,
        registry: options.registry,
        registries: options.registries,
        tag: options.tag,
        buildCmd: options.buildCmd,
        token: options.publishToken,
        skipExistingVersions: options.skipExistingVersions,
      },
      release: {
        commit: options.commit,
        changelog: options.changelog,
        push: options.push,
        publish: options.publish,
        noVerify: options.noVerify,
        providerRelease: options.providerRelease,
        clean: options.clean,
        gitTag: options.gitTag,
        social: options.social,
        prComment: options.prComment,
        report: options.report,
      },
      monorepo: options.includePrivates !== undefined
        ? { includePrivates: options.includePrivates }
        : undefined,
      safetyCheck: options.safetyCheck,
    },
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

async function releaseSafetyCheck({
  config,
  provider,
  ai,
}: {
  config: ResolvedRelizyConfig
  provider?: GitProvider
  ai?: boolean
}) {
  if (!config.safetyCheck) {
    return
  }

  logger.box('Safety checks')
  logger.start('Start safety checks')

  try {
    await Promise.all([
      providerReleaseSafetyCheck({ config, provider, ai }),
      publishSafetyCheck({ config }),
      // The release only posts with release.social (disabled by --no-social and --canary)
      ...(config.release.social ? [socialSafetyCheck({ config })] : []),
      ...(shouldPushReleaseCommit(config) ? [assertBranchUpToDateWithRemote({ cwd: config.cwd })] : []),
    ])

    logger.success('Safety checks passed')
  }
  catch (error) {
    logger.error('Safety checks failed')
    throw error
  }
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** The published versions: `relizy@2.0.0`, or their count */
function describePublished(packages: PublishResponse['publishedPackages']): string {
  return packages.length === 1 ? `${packages[0]!.name}@${packages[0]!.newVersion ?? packages[0]!.version}` : plural(packages.length, 'package')
}

// eslint-disable-next-line sonarjs/cognitive-complexity, complexity
export async function release(options: Partial<ReleaseOptions> = {}): Promise<ReleaseReport> {
  const isCanary = options.canary ?? false

  if (isCanary) {
    logger.info('Canary mode enabled')
    options.commit = false
    options.push = false
    options.changelog = false
    options.providerRelease = false
    options.social = false
    options.gitTag = false

    options.type = 'prerelease'
    options.preid = options.preid || 'canary'
    options.tag = options.tag || 'canary'
  }

  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  const force = options.force ?? false
  logger.debug(`Force bump: ${force}`)

  const config = await getReleaseConfig(options)

  applyAIOverride(config, options.ai)

  logger.debug(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)
  logger.debug(`Push: ${config.release.push}, Publish: ${config.release.publish}, Provider Release: ${config.release.providerRelease}`)

  const ui = createCommandUi({ title: `relizy release${isCanary ? ' --canary' : ''}`, dryRun, logLevel: config.logLevel, cwd: config.cwd })
  // The facts recorded by the steps (links, AI rewrites) start with this release
  takeReleaseFacts()
  // The step running when the release fails
  let currentStep = 'Checks'

  try {
    if (config.safetyCheck) {
      await ui.step({
        running: 'Checking the release',
        done: () => 'Ready to release (tokens, registry, branch)',
        run: () => releaseSafetyCheck({ config, provider: options.provider, ai: options.ai }),
      })
    }
    else {
      ui.skip({ title: 'Safety checks', label: 'Checks', reason: '--no-safety-check' })
    }
  }
  catch (error) {
    ui.fail(error, currentStep)
    throw error
  }

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
    steps.push({ name, status: done ? 'done' : 'skipped', ...(done && detail ? { detail } : {}) })
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
    ...(error === undefined ? {} : { error: error instanceof Error ? error.message : String(error) }),
  })
  const postPrComment = (releaseContext: ReleaseContext) => tryPostPrComment({
    config,
    releaseContext,
    prNumber: options.prNumber,
    dryRun,
    logLevel: config.logLevel,
    configName: options.configName,
  })

  try {
    await executeHook('before:release', config, dryRun)

    currentStep = 'Bump'
    const bumpResult = await ui.step({
      title: ['Bump versions', `- type: ${config.bump.type}`, ...(config.bump.preid ? [`- preid: ${config.bump.preid}`] : [])],
      running: 'Computing the versions',
      done: describeBumpResult,
      // Already listed before the confirmation
      details: result => getBumpResultDetails(result, config.bump.yes),
      run: () => bump({
        type: config.bump.type,
        preid: config.bump.preid,
        dryRun,
        config,
        force,
        clean: config.release.clean,
        configName: options.configName,
        suffix: options.suffix,
        canary: isCanary,
        includePrivates: options.includePrivates,
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
        await ui.step({ title: 'Post PR comment', running: 'Commenting the pull request', done: posted => posted ? 'Pull request commented' : 'No pull request to comment', run: () => postPrComment({ status: 'no-release', report: reportOf('nothing') }) })
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
          tags: getReleaseTagNames({ config, bumpedPackages: bumpResult.bumpedPackages, newVersion: bumpResult.newVersion, groups: bumpResult.groups }),
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
        title: 'Generate changelogs',
        running: 'Writing the changelogs',
        done: () => `${count} ${count === 1 ? 'changelog' : 'changelogs'} written`,
        run: () => changelog({
          from: config.from,
          to: config.to,
          dryRun,
          formatCmd: config.changelog.formatCmd,
          rootChangelog: config.changelog.rootChangelog,
          bumpResult,
          config,
          logLevel: config.logLevel,
          configName: options.configName,
          force,
          suffix: options.suffix,
          includePrivates: options.includePrivates,
          groups: options.groups,
        }),
      })
    }
    else {
      ui.skip({ title: 'Generate changelogs', label: 'Changelogs', reason: '--no-changelog' })
    }
    addStep('changelog', Boolean(config.release.changelog))

    currentStep = 'Publish'
    let publishResponse: PublishResponse | undefined

    if (config.release.publish) {
      publishResponse = await ui.step({
        title: 'Publish packages to registry',
        running: 'Publishing the packages',
        done: (response) => {
          const packages = response?.publishedPackages.map(pkg => `${pkg.name}@${pkg.newVersion ?? pkg.version}`).join(', ')
          const tag = config.publish.tag ? ` (${config.publish.tag})` : ''
          return packages ? `Published ${packages}${tag}` : 'Nothing to publish'
        },
        run: async () => {
          // Packages are published before the push: make sure the release commit
          // will be pushable, as new commits may have landed while the release ran.
          if (shouldPushReleaseCommit(config)) {
            await guardBeforePublish({ config, dryRun, guard: () => assertBranchUpToDateWithRemote({ cwd: config.cwd }) })
          }

          try {
            const response = await publish({
              registry: config.publish.registry,
              tag: config.publish.tag,
              access: config.publish.access,
              otp: config.publish.otp,
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
        await guardBeforePublish({ config, dryRun, guard: () => assertBranchUpToDateWithRemote({ cwd: config.cwd }) })
      }
      ui.skip({ title: 'Publish packages to registry', label: 'Publish', reason: '--no-publish' })
    }
    addStep('publish', Boolean(config.release.publish), publishResponse && describePublished(publishResponse.publishedPackages))
    if (publishResponse) {
      facts.publish = getReleasePublish({ config, packages: publishResponse.publishedPackages })
      links.push(...getNpmLinks({ config, packages: publishResponse.publishedPackages }))
    }

    currentStep = 'Commit'
    if (config.release.commit) {
      createdTags = await ui.step({
        title: 'Commit changes and create tag',
        running: 'Committing and tagging',
        done: tags => `Committed and tagged ${tags.join(', ')}`,
        run: () => createCommitAndTags({
          config,
          noVerify: config.release.noVerify,
          bumpedPackages: bumpResult.bumpedPackages,
          newVersion: bumpResult.newVersion,
          groups: bumpResult.groups,
          dryRun,
          logLevel: config.logLevel,
        }),
      })
    }
    else {
      ui.skip({ title: 'Commit changes and create tag', label: 'Commit and tags', reason: '--no-commit' })
    }
    committed = Boolean(config.release.commit)
    addStep('commit', committed, committed ? createdTags.join(', ') : undefined)

    currentStep = 'Push'
    if (config.release.push && config.release.commit) {
      await ui.step({
        title: 'Push changes and tags',
        running: 'Pushing',
        done: () => 'Pushed the commit and the tags',
        run: async () => {
          await executeHook('before:push', config, dryRun, hookContext)

          try {
            await pushCommitAndTags({ config, dryRun, logLevel: config.logLevel, cwd: config.cwd, tags: createdTags })
            await executeHook('success:push', config, dryRun, hookContext)
          }
          catch (error) {
            await executeHook('error:push', config, dryRun, hookContext)
            throw error
          }
        },
      })
    }
    else {
      ui.skip({ title: 'Push changes and tags', label: 'Push', reason: config.release.commit ? '--no-push' : '--no-commit' })
    }
    addStep('push', Boolean(config.release.push && config.release.commit))

    currentStep = 'Provider release'
    let provider = config.repo?.provider
    let postedReleases: PostedRelease[] = []
    let providerError: string | undefined

    if (config.release.providerRelease) {
      logger.debug(`Provider from config: ${provider}`)

      const response = await ui.step({
        title: 'Publish Git release',
        running: 'Creating the releases',
        done: describeProviderReleaseResult,
        failed: result => Boolean(result.error),
        run: () => providerRelease({
          from: config.from,
          to: config.to,
          token: options.token,
          provider,
          dryRun,
          config,
          logLevel: config.logLevel,
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
      ui.skip({ title: 'Publish Git release', label: 'GitHub/GitLab release', reason: '--no-provider-release' })
    }
    if (providerError) {
      steps.push({ name: 'providerRelease', status: 'failed', detail: providerError })
    }
    else {
      addStep('providerRelease', Boolean(config.release.providerRelease), `${plural(postedReleases.length, 'release')} on ${provider}`)
    }

    currentStep = 'Social media'
    let socialResults: SocialResult | undefined

    if (config.release.social && (config.social?.twitter?.enabled || config.social?.slack?.enabled)) {
      socialResults = await ui.step({
        title: 'Post release to social media',
        running: 'Posting the release',
        done: describeSocialResult,
        failed: result => result.hasErrors,
        run: () => social({
          from: config.from,
          to: config.to,
          config,
          configName: options.configName,
          bumpResult,
          dryRun,
          logLevel: config.logLevel,
          safetyCheck: false, // Already checked in releaseSafetyCheck
          slackFormat: options.slackFormat,
          groups: options.groups,
        }),
      })
    }
    else {
      ui.skip({ title: 'Post release to social media', label: 'Social posts', reason: config.release.social ? 'no platform enabled' : '--no-social' })
    }
    if (socialResults?.hasErrors) {
      steps.push({ name: 'social', status: 'failed', detail: socialResults.results.filter(result => !result.success).map(result => `${result.platform}: ${result.error}`).join(', ') })
    }
    else {
      addStep('social', Boolean(socialResults?.results.length), socialResults?.results.map(result => result.platform).join(', '))
    }

    currentStep = 'PR comment'
    let prCommentPosted = false
    if (config.release.prComment) {
      // The comment is the summary of the release so far
      await collectFacts()
      const reportSoFar = reportOf('released')
      prCommentPosted = await ui.step({
        title: 'Post PR comment',
        running: 'Commenting the pull request',
        done: posted => posted ? 'Pull request commented' : 'No pull request to comment',
        run: () => postPrComment({ status: 'success', bumpResult, tags: createdTags, report: reportSoFar }),
      })
    }
    else {
      ui.skip({ title: 'Post PR comment', label: 'PR comment', reason: '--no-pr-comment' })
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
