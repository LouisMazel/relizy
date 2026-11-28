import type { ReleaseWorkflow, StagedPublishing, TrustedPublisher, TrustedPublisherSource, TrustResult, WebAuthHandler } from '@relizy/core'
import type { ResolvedRelizyConfig } from '../core'
import type { CommandNote } from '../core/release-ui'
import type { TrustOptions, TrustResponse } from '../types'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { assertInteractiveNpmAuth, createTrustedPublisher, getUploadNpmVersion, isOtpError, isPackageOnRegistry, listTrustedPublishers, readReleaseWorkflows, resolveStaged, revokeTrustedPublisher, STAGED_PUBLISHING_NPM_VERSION, withGitCache } from '@relizy/core'
import { loadFile, writeFile } from 'magicast'
import { getDefaultExportOptions } from 'magicast/helpers'
import * as semver from 'semver'
import { loadRelizyConfig } from '../core'
import { askStagedQuestion } from '../core/approve'
import { runWithEvents } from '../core/events'
import { previewRelease } from '../core/release-preview'
import { emitStepItem } from '../core/step-data'
import { createOtpAsker, getWebAuthHandler } from '../core/two-factor'
import { readPublishablePackages } from './publish'
import { runCommand } from './run-command'

/**
 * `relizy trust`: the npm trusted publisher configurations of the packages,
 * created from the release workflow files with the npm login and one 2FA
 */

const NPMJS = 'https://registry.npmjs.org/'
const STAGED_ENVIRONMENT = 'npm-staged'
const DIRECT_ENVIRONMENT = 'npm-direct'

/** A configuration to have on npm, for every package */
interface WantedPublisher {
  source: TrustedPublisherSource
  /** Direct and staged publish, or `undefined` when they follow `publish.staged` per package */
  permissions?: { allowPublish: boolean, allowStagePublish: boolean }
}

/**
 * The permissions a package needs from `publish.staged`: direct publish for a
 * package never staged, both otherwise, since its canaries (and its other tags
 * with `tags`) are published directly. Only the npm-enforced environments give
 * a configuration that may only stage
 */
export function getPackagePermissions(staged: StagedPublishing | undefined, packageName: string): { allowPublish: boolean, allowStagePublish: boolean } {
  if (!staged) {
    return { allowPublish: true, allowStagePublish: false }
  }
  if (staged !== true && staged.packages && !resolveStaged({
    staged: { packages: staged.packages },
    tag: 'latest',
    packageName,
  })) {
    return { allowPublish: true, allowStagePublish: false }
  }
  return { allowPublish: true, allowStagePublish: true }
}

/** The configurations to create, from the release workflows (or the CircleCI flags): one per job environment npm enforces */
export function getWantedPublishers({ workflows, options }: { workflows: ReleaseWorkflow[], options: TrustOptions }): WantedPublisher[] {
  if (options.circleci) {
    return [
      {
        source: { type: 'circleci', ...options.circleci },
      },
    ]
  }

  return workflows.flatMap((workflow): WantedPublisher[] => {
    const repository = workflow.provider === 'github'
      ? options.repo ?? workflow.repository
      : options.project ?? workflow.repository
    if (!repository) {
      throw new Error(`The repository of ${workflow.path} is unknown: pass --${workflow.provider === 'github'
        ? 'repo owner/repo'
        : 'project group/project'}`)
    }

    const source = (environment?: string): TrustedPublisherSource => workflow.provider === 'github'
      ? {
          type: 'github',
          file: workflow.file,
          repository,
          ...(environment
            ? { environment }
            : {}),
        }
      : {
          type: 'gitlab',
          file: workflow.file,
          project: repository,
          ...(environment
            ? { environment }
            : {}),
        }

    const environments = new Set(workflow.jobs.map(job => job.environment).filter(Boolean))
    // npm enforces staging: the stable job may only stage, the prerelease job only publish
    if (!options.env && environments.has(STAGED_ENVIRONMENT) && environments.has(DIRECT_ENVIRONMENT)) {
      return [
        {
          source: source(STAGED_ENVIRONMENT),
          permissions: { allowPublish: false, allowStagePublish: true },
        },
        {
          source: source(DIRECT_ENVIRONMENT),
          permissions: { allowPublish: true, allowStagePublish: false },
        },
      ]
    }

    const environment = options.env ?? (environments.size === 1
      ? [...environments][0]
      : undefined)
    return [
      {
        source: source(environment),
      },
    ]
  })
}

function sameWorkflow(publisher: TrustedPublisher, source: TrustedPublisherSource): boolean {
  if (publisher.type !== source.type) {
    return false
  }
  if (source.type === 'circleci') {
    return true
  }
  const repository = source.type === 'github'
    ? source.repository
    : source.project
  return publisher.file === source.file && (!publisher.repository || publisher.repository === repository)
}

function sameEnvironment(publisher: TrustedPublisher, source: TrustedPublisherSource): boolean {
  return source.type === 'circleci' || (publisher.environment ?? '') === (source.environment ?? '')
}

/** npm adds the staged publish to a configuration allowing the direct publish: only the direct publish tells two configurations apart then */
function samePermissions(publisher: TrustedPublisher, permissions: { allowPublish: boolean, allowStagePublish: boolean }): boolean {
  return Boolean(publisher.allowPublish) === permissions.allowPublish
    && (permissions.allowPublish || Boolean(publisher.allowStagePublish) === permissions.allowStagePublish)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** The `relizy.config.*` file of the project, to write the proposed value in */
function findConfigFile(cwd: string, configName?: string): string | undefined {
  const base = configName
    ? `relizy.${configName}.config`
    : 'relizy.config'
  return [
    '.ts',
    '.mts',
    '.js',
    '.mjs',
    '.cts',
    '.cjs',
  ].map(extension => join(cwd, `${base}${extension}`)).find(path => existsSync(path))
}

/** Writes `publish.staged` in the object given to `defineConfig`, `false` when the config is not a plain object literal */
async function writeStagedConfig(file: string, staged: StagedPublishing): Promise<boolean> {
  try {
    const mod = await loadFile(file)
    const options = getDefaultExportOptions(mod)
    options.publish ||= {}
    options.publish.staged = staged
    await writeFile(mod, file)
    return true
  }
  catch (error) {
    logger.debug(`The config could not be edited: ${getErrorMessage(error)}`)
    return false
  }
}

/** The `publish.staged` the configurations allow: the packages that may only stage */
function proposeStaged(stagedOnly: string[], all: string[]): StagedPublishing | undefined {
  if (stagedOnly.length === 0) {
    return undefined
  }
  return stagedOnly.length === all.length
    ? true
    : { packages: stagedOnly }
}

async function trustPackage({ name, config, wanted, options, otp, onWebAuth }: {
  name: string
  config: ResolvedRelizyConfig
  wanted: WantedPublisher[]
  options: TrustOptions
  otp: { get: () => Promise<string | undefined>, refresh: () => Promise<string | undefined> }
  onWebAuth?: WebAuthHandler
}): Promise<TrustResult> {
  const call = async <T>(run: (code: string | undefined) => Promise<T>): Promise<T> => {
    const code = await otp.get()
    try {
      return await run(code)
    }
    catch (error) {
      if (!isOtpError(error)) {
        throw error
      }
      return run(await otp.refresh())
    }
  }
  const base = {
    cwd: config.cwd,
    packageName: name,
    onWebAuth,
    logger,
  }

  const existing = await call(code => listTrustedPublishers({ ...base, otp: code }))
  const statuses: TrustResult['status'][] = []

  for (const { source, permissions } of wanted) {
    const needed = permissions ?? getPackagePermissions(config.publish.staged, name)
    const sameSource = existing.filter(publisher => sameWorkflow(publisher, source))
    if (sameSource.some(publisher => sameEnvironment(publisher, source) && samePermissions(publisher, needed))) {
      statuses.push('exists')
      continue
    }

    if (sameSource.length > 0) {
      if (!options.replace) {
        statuses.push('differs')
        continue
      }
      const answer = options.yes || await askStagedQuestion({
        request: {
          kind: 'replace-trust',
          items: sameSource.map(publisher => ({
            name,
            detail: `${publisher.type} ${publisher.file ?? ''} ${publisher.environment ?? ''}`.trim(),
          })),
        },
        message: `Replace the trusted publisher of ${name} (${sameSource.map(publisher => publisher.file).join(', ')})?`,
      })
      if (answer !== true) {
        statuses.push('differs')
        continue
      }
      for (const publisher of sameSource.filter(candidate => candidate.id)) {
        await call(code => revokeTrustedPublisher({ ...base, id: publisher.id!, otp: code }))
      }
      await call(code => createTrustedPublisher({
        ...base,
        source,
        ...needed,
        otp: code,
      }))
      statuses.push('replaced')
      continue
    }

    await call(code => createTrustedPublisher({
      ...base,
      source,
      ...needed,
      otp: code,
    }))
    statuses.push('created')
  }

  const status = (['replaced', 'created', 'differs'] as const).find(candidate => statuses.includes(candidate)) ?? 'exists'
  const publishers = status === 'exists' || status === 'differs'
    ? existing.filter(publisher => wanted.some(({ source }) => sameWorkflow(publisher, source)))
    : await call(code => listTrustedPublishers({ ...base, otp: code })).then(all => all.filter(publisher => wanted.some(({ source }) => sameWorkflow(publisher, source)))).catch(() => [])
  return {
    name,
    status,
    publishers,
    ...(status === 'differs'
      ? { reason: 'a configuration of this workflow has other permissions or another environment: pass --replace to recreate it' }
      : {}),
  }
}

function describeSource(source: TrustedPublisherSource): string {
  if (source.type === 'circleci') {
    return `CircleCI ${source.vcsOrigin}`
  }
  const repository = source.type === 'github'
    ? source.repository
    : source.project
  return `${source.type === 'github'
    ? 'GitHub'
    : 'GitLab'} ${repository} ${source.file}${source.environment
    ? ` (environment ${source.environment})`
    : ''}`
}

function describePermissions({ allowPublish, allowStagePublish }: { allowPublish?: boolean, allowStagePublish?: boolean }): string {
  return [allowPublish && 'direct publish', allowStagePublish && 'staged publish'].filter(Boolean).join(' and ') || 'no publish'
}

function describePublisher(publisher: TrustedPublisher): string {
  const where = [publisher.repository, publisher.file].filter(Boolean).join(' ')
  const provider = { github: 'GitHub', gitlab: 'GitLab', circleci: 'CircleCI' }[publisher.type] ?? publisher.type
  return `${provider} ${where}${publisher.environment
    ? ` (environment ${publisher.environment})`
    : ''}, ${describePermissions(publisher)}`
}

const TRUST_STATUS_LABELS: Record<TrustResult['status'], string> = {
  created: 'created',
  replaced: 'replaced',
  exists: 'already set up',
  differs: 'differs, not changed',
  missing: 'not on npm',
  failed: 'failed',
}

/** One box per package: what is set up on npm now, and why it was not changed */
function getTrustNotes(results: TrustResult[]): CommandNote[] {
  return results.map(result => ({
    title: `${result.name}: ${TRUST_STATUS_LABELS[result.status]}`,
    lines: result.publishers?.length
      ? result.publishers.map(describePublisher)
      : ['No configuration of these workflows'],
    footer: result.reason
      ? [result.reason]
      : [],
    failed: result.status === 'failed',
  }))
}

function describeTrustCounts(results: TrustResult[]): string {
  const counts = ([
    'created',
    'replaced',
    'exists',
    'differs',
    'missing',
    'failed',
  ] as const)
    .map(status => [status, results.filter(result => result.status === status).length] as const)
    .filter(([, count]) => count > 0)
  return counts.map(([status, count]) => `${count} ${TRUST_STATUS_LABELS[status]}`).join(', ') || 'Nothing to set up'
}

function getTrustMessage(results: TrustResult[], created: string[]): string {
  const plural = (count: number) => `${count} package${count === 1
    ? ''
    : 's'}`
  return created.length === 0 && results.every(result => result.status === 'exists')
    ? `Trusted publishing already set up for ${plural(results.length)}`
    : `Trusted publishing set up for ${plural(created.length)}`
}

/** The packages created now that no release is pending for: their configuration expires in 2 days unused */
async function getExpiringPackages(config: ResolvedRelizyConfig, created: string[]): Promise<string[]> {
  if (created.length === 0) {
    return []
  }
  try {
    const preview = await previewRelease({ config })
    const pending = new Set(preview.sets.flatMap(set => set.packages.map(pkg => pkg.name)))
    return created.filter(name => !pending.has(name))
  }
  catch {
    return created
  }
}

/** Sets up the packages one by one, with the 2 s pause of the docs of npm between two of them */
async function trustPackages({ names, config, wanted, options, otp, onWebAuth }: {
  names: string[]
  config: ResolvedRelizyConfig
  wanted: WantedPublisher[]
  options: TrustOptions
  otp: { get: () => Promise<string | undefined>, refresh: () => Promise<string | undefined> }
  onWebAuth?: WebAuthHandler
}): Promise<TrustResult[]> {
  const done: TrustResult[] = []
  for (const [index, name] of names.entries()) {
    emitStepItem('trust', { name, status: 'running' })
    const result = await isPackageOnRegistry({ name, registry: NPMJS, logger }) === false
      ? { name, status: 'missing' as const, reason: 'not on npm yet: publish its first version from your npm login (or with a token while tokens can still publish), then run relizy trust again' }
      : await trustPackage({
          name,
          config,
          wanted,
          options,
          otp,
          onWebAuth,
        }).catch((error: unknown): TrustResult => ({ name, status: 'failed', reason: getErrorMessage(error).split('\n')[0] ?? 'failed' }))
    done.push(result)
    emitStepItem('trust', {
      name,
      status: getItemStatus(result.status),
      ...(result.reason
        ? { detail: result.reason }
        : {}),
    })
    if (index < names.length - 1 && result.status !== 'missing') {
      await sleep(2000)
    }
  }
  return done
}

function getItemStatus(status: TrustResult['status']): 'done' | 'skipped' | 'failed' {
  if (status === 'failed') {
    return 'failed'
  }
  return status === 'missing' || status === 'differs'
    ? 'skipped'
    : 'done'
}

/**
 * The `publish.staged` the configurations of npm ask for: the packages whose
 * configurations of the workflow only allow staging (read from npm), or the
 * stable releases when npm enforces staging by environment. Written in the
 * config after a confirmation, printed otherwise.
 */
async function proposeStagedConfig({ config, options, names, wanted, results }: {
  config: ResolvedRelizyConfig
  options: TrustOptions
  names: string[]
  wanted: WantedPublisher[]
  results: TrustResult[]
}): Promise<{ proposed?: StagedPublishing, configWritten: boolean }> {
  const enforced = wanted.some(({ source }) => source.type !== 'circleci' && source.environment === STAGED_ENVIRONMENT)
  const stagedOnly = names.filter((name) => {
    const publishers = results.find(result => result.name === name)?.publishers ?? []
    return publishers.length > 0 && publishers.every(publisher => publisher.allowStagePublish && !publisher.allowPublish)
  })
  const proposed: StagedPublishing | undefined = enforced
    ? {
        tags: ['latest'],
      }
    : proposeStaged(stagedOnly, names)

  if (proposed === undefined || JSON.stringify(proposed) === JSON.stringify(config.publish.staged)) {
    return { configWritten: false }
  }

  const detail = `publish.staged: ${JSON.stringify(config.publish.staged)} -> ${JSON.stringify(proposed)}`
  const file = findConfigFile(config.cwd, options.configName)
  const answer = file && (options.yes || await askStagedQuestion({
    request: {
      kind: 'write-config',
      items: [
        { name: 'publish.staged', detail },
      ],
    },
    message: `Write ${detail} in ${file}?`,
  }))
  const configWritten = answer === true && await writeStagedConfig(file!, proposed)
  if (!configWritten) {
    logger.info(`Set ${detail} in your relizy config: npm only accepts staged versions from these configurations`)
  }
  return { proposed, configWritten }
}

function runTrust(options: TrustOptions): Promise<TrustResponse> {
  return runCommand<TrustResponse>({
    name: 'trust',
    label: 'Trust',
    errorMessage: 'Error during relizy trust!',
    options,
    loadConfig: () => loadRelizyConfig({
      configFile: options.configName,
      profile: options.profile,
      baseConfig: options.config,
      overrides: { logLevel: options.logLevel },
    }),
    run: async ({ config, dryRun, ui }) => {
      const publishable = readPublishablePackages(config).map(pkg => pkg.name)
      const unknown = (options.packages ?? []).filter(name => !publishable.includes(name))
      if (unknown.length > 0) {
        throw new Error(`Not a public package of the project: ${unknown.join(', ')}`)
      }
      const names = options.packages?.length ? options.packages : publishable

      const workflows = options.circleci
        ? []
        : await readReleaseWorkflows({
            cwd: config.cwd,
            files: options.file
              ? [options.file]
              : [],
            logger,
          })
      const selected = options.file
        ? workflows.filter(workflow => workflow.path === options.file || workflow.file === options.file)
        : workflows
      if (!options.circleci && selected.length === 0) {
        throw new Error('No release workflow found (written by relizy init, or running relizy release): pass it with --file, or the CircleCI identifiers')
      }
      const wanted = getWantedPublishers({ workflows: selected, options })

      if (dryRun) {
        ui.complete({
          message: `Would set up the trusted publishing of ${names.length} package${names.length > 1
            ? 's'
            : ''}`,
          notes: names.map(name => ({
            title: `${name}: would set up`,
            lines: wanted.map(({ source, permissions }) => `${describeSource(source)}, ${describePermissions(permissions ?? getPackagePermissions(config.publish.staged, name))}`),
          })),
        })
        return {
          results: names.map(name => ({ name, status: 'exists' as const, reason: 'dry run' })),
          configWritten: false,
          expiring: [],
        }
      }

      // Before the first call: a person, logged in, with an npm that has `npm trust`
      assertInteractiveNpmAuth()
      const npmVersion = getUploadNpmVersion(config.cwd)
      if (npmVersion && semver.lt(npmVersion, STAGED_PUBLISHING_NPM_VERSION)) {
        throw new Error(`relizy trust needs npm ${STAGED_PUBLISHING_NPM_VERSION} or later (npm trust), npm ${npmVersion} is installed: run "npm install -g npm@latest"`)
      }

      // Tried without code first: npm offers its web 2FA, a code is asked only when npm needs one
      const asker = createOtpAsker({ registry: NPMJS, purpose: 'trust' })
      let code = options.otp
      const otp = {
        get: () => Promise.resolve(code),
        refresh: async () => {
          code = await asker({ count: names.length })
          return code
        },
      }
      const onWebAuth = getWebAuthHandler()

      const results = await ui.step({
        name: 'trust',
        running: 'Setting up the trusted publishers',
        done: done => describeTrustCounts(done),
        failed: done => done.some(result => result.status === 'failed'),
        data: done => ({ packages: done }),
        run: () => trustPackages({
          names,
          config,
          wanted,
          options,
          otp,
          onWebAuth,
        }),
      })

      const created = results.filter(result => result.status === 'created' || result.status === 'replaced').map(result => result.name)
      const expiring = await getExpiringPackages(config, created)

      const { proposed, configWritten } = await proposeStagedConfig({
        config,
        options,
        names,
        wanted,
        results,
      })

      ui.complete({
        message: getTrustMessage(results, created),
        failed: results.length > 0 && results.every(result => result.status === 'failed'),
        notes: getTrustNotes(results),
        warnings: expiring.length > 0
          ? [`npm removes a new trusted publisher unused for 2 days, and ${expiring.join(', ')} ha${expiring.length > 1
              ? 've'
              : 's'} no release pending: run "relizy trust" again before the next release`]
          : [],
      })

      return {
        results,
        ...(proposed !== undefined
          ? { proposedStaged: proposed }
          : {}),
        configWritten,
        expiring,
      }
    },
  })
}

/**
 * Set up the npm trusted publishers of the public packages of the project,
 * from its release workflow files, with the npm login and one 2FA of a
 * maintainer: idempotent, `replace` recreates the configurations that differ
 */
export function trust(options: TrustOptions = {}): Promise<TrustResponse> {
  return runWithEvents(options.onProgress, () => withGitCache(() => runTrust(options)), { onOtp: options.onOtp, onPrompt: options.onPrompt, onWebAuth: options.onWebAuth })
}
