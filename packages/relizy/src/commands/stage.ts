import type { StagedEntry } from '@relizy/core'
import type { ResolvedRelizyConfig } from '../core'
import type { ApproveStepPackage } from '../core/events'
import type { ReleaseUi } from '../core/release-ui'
import type { StageOptions, StageResponse } from '../types'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { approveStagedVersions, assertInteractiveNpmAuth, getStagedApprovalUrl, isNpmjsRegistry, isOtpError, listStagedVersions, PUBLISH_DEPENDENCY_FIELDS, readDependencyFields, rejectStagedVersion, withGitCache } from '@relizy/core'
import { getNpmRegistry, loadRelizyConfig, resolveRegistryTargetsForPackages } from '../core'
import { askStagedQuestion, createInteractiveNpmRunner, createOtpAsker, isInteractiveTerminal } from '../core/approve'
import { runWithEvents } from '../core/events'
import { askMultiselect } from '../core/prompts'
import { emitStepItem } from '../core/step-data'
import { readPublishablePackages } from './publish'
import { runCommand } from './run-command'

/**
 * `relizy stage list | approve | reject`: the staged versions of the public
 * packages of the project, listed, approved with one 2FA, or rejected (final),
 * with the npm login of the person
 */

/** The npmjs registry of the packages: only npmjs stages */
function getStagingRegistry(config: ResolvedRelizyConfig, packages: { name: string }[]): string {
  const registries = resolveRegistryTargetsForPackages(packages, config).map(target => target.registry || getNpmRegistry(config.cwd))
  return registries.find(isNpmjsRegistry) ?? 'https://registry.npmjs.org/'
}

/** The packages named by the run, every public one with `all` (or for `list`) */
function getNamedPackages(config: ResolvedRelizyConfig, options: StageOptions): { names: string[], selected: boolean } {
  const publishable = readPublishablePackages(config).map(pkg => pkg.name)

  if (options.packages?.length) {
    const unknown = options.packages.filter(name => !publishable.includes(name))
    if (unknown.length > 0) {
      throw new Error(`Not a public package of the project: ${unknown.join(', ')}`)
    }
    return { names: options.packages, selected: true }
  }

  return { names: publishable, selected: Boolean(options.all) || options.action === 'list' }
}

/** The workspace packages each package depends on, by name: dependencies are approved first */
function getDependencies(config: ResolvedRelizyConfig): Map<string, string[]> {
  const packages = readPublishablePackages(config) as { name: string, path?: string }[]
  const names = new Set(packages.map(pkg => pkg.name))

  return new Map(packages.map((pkg) => {
    const fields = pkg.path
      ? readDependencyFields(pkg.path)
      : {}
    return [
      pkg.name,
      PUBLISH_DEPENDENCY_FIELDS.flatMap(field => Object.keys(fields[field] ?? {})).filter(name => names.has(name) && name !== pkg.name),
    ]
  }))
}

/** Without names nor `--all`, the versions to approve or reject, chosen in the terminal */
async function selectVersions(entries: StagedEntry[], action: 'approve' | 'reject'): Promise<StagedEntry[]> {
  if (!isInteractiveTerminal()) {
    throw new Error(`relizy stage ${action} needs the packages to ${action}: pass their names or --all`)
  }

  const ids = await askMultiselect({
    message: `Staged versions to ${action}`,
    options: entries.map(entry => ({ value: entry.stageId, label: `${entry.name}@${entry.version}`, hint: `${entry.tag}, ${entry.status}` })),
    initialValues: action === 'approve'
      ? entries.map(entry => entry.stageId)
      : [],
  })
  return entries.filter(entry => ids.includes(entry.stageId))
}

function describeEntries(entries: StagedEntry[]): string[] {
  return entries.map(entry => `${entry.name}@${entry.version} (${entry.tag}, ${entry.status}${entry.createdAt
    ? `, ${entry.createdAt}`
    : ''}${entry.actor
    ? `, by ${entry.actor}`
    : ''}) ${entry.stageId}`)
}

async function rejectVersions({ config, registry, versions, otp, runner }: {
  config: ResolvedRelizyConfig
  registry: string
  versions: StagedEntry[]
  otp?: string
  runner?: ReturnType<typeof createInteractiveNpmRunner>
}): Promise<ApproveStepPackage[]> {
  const getOtp = createOtpAsker({ registry, purpose: 'reject', otp })
  let code = await getOtp({ count: versions.length })
  const results: ApproveStepPackage[] = []

  for (const version of versions) {
    const base = { name: version.name, version: version.version, stageId: version.stageId }
    emitStepItem('reject', { name: `${version.name}@${version.version}`, status: 'running' })
    try {
      try {
        await rejectStagedVersion({
          cwd: config.cwd,
          registry,
          stageId: version.stageId,
          otp: code,
          runner,
          logger,
        })
      }
      catch (error) {
        if (!isOtpError(error)) {
          throw error
        }
        code = await getOtp({ count: versions.length - results.length })
        await rejectStagedVersion({
          cwd: config.cwd,
          registry,
          stageId: version.stageId,
          otp: code,
          runner,
          logger,
        })
      }
      results.push({ ...base, status: 'rejected' })
      emitStepItem('reject', { name: `${version.name}@${version.version}`, status: 'done' })
    }
    catch (error) {
      const reason = getErrorMessage(error).split('\n')[0] ?? 'failed'
      results.push({ ...base, status: 'failed', reason })
      emitStepItem('reject', { name: `${version.name}@${version.version}`, status: 'failed', detail: reason })
    }
  }

  return results
}

function countOf(results: ApproveStepPackage[], status: ApproveStepPackage['status']): number {
  return results.filter(result => result.status === status).length
}

async function runList({ config, ui, names, registry }: { config: ResolvedRelizyConfig, ui: ReleaseUi, names: string[], registry: string }): Promise<StageResponse> {
  const staged = await ui.step({
    name: 'list',
    running: 'Reading the staged versions',
    done: entries => entries.length === 0
      ? 'No staged version'
      : `${entries.length} staged version${entries.length > 1
        ? 's'
        : ''}`,
    details: describeEntries,
    data: entries => ({ versions: entries }),
    run: () => listStagedVersions({
      cwd: config.cwd,
      registry,
      packageNames: names,
      logger,
    }),
  })

  ui.complete({
    message: staged.length === 0
      ? 'No version awaits approval'
      : `${staged.length} version${staged.length > 1
        ? 's'
        : ''} awaiting approval`,
    nothing: staged.length === 0,
    details: describeEntries(staged),
  })
  return { action: 'list', staged, results: [] }
}

function runStage(options: StageOptions): Promise<StageResponse> {
  return runCommand<StageResponse>({
    name: `stage ${options.action}`,
    label: 'Stage',
    errorMessage: `Error during relizy stage ${options.action}!`,
    options,
    loadConfig: () => loadRelizyConfig({
      configFile: options.configName,
      profile: options.profile,
      baseConfig: options.config,
      overrides: { logLevel: options.logLevel },
    }),
    run: async ({ config, dryRun, ui }) => {
      const { names, selected } = getNamedPackages(config, options)
      const registry = getStagingRegistry(config, names.map(name => ({ name })))

      if (options.action === 'list') {
        return runList({ config, ui, names, registry })
      }

      const action = options.action
      if (dryRun) {
        ui.complete({
          message: `Would ${action} the staged versions of ${selected
            ? names.join(', ')
            : 'the packages chosen in the terminal'}`,
        })
        return { action, staged: [], results: [] }
      }

      // Before any call to npm: refused in a CI and under trusted publishing
      assertInteractiveNpmAuth()

      const entries = await listStagedVersions({
        cwd: config.cwd,
        registry,
        packageNames: names,
        logger,
      })
      const versions = selected
        ? entries
        : await selectVersions(entries, action)

      if (versions.length === 0) {
        ui.complete({ message: `No staged version to ${action}`, nothing: true })
        return { action, staged: versions, results: [] }
      }

      const runner = isInteractiveTerminal()
        ? createInteractiveNpmRunner()
        : undefined

      if (action === 'reject') {
        const answer = await askStagedQuestion({
          request: {
            kind: 'reject-staged',
            items: versions.map(version => ({ name: version.name, version: version.version, stageId: version.stageId })),
          },
          message: `Reject ${versions.length} staged version${versions.length > 1
            ? 's'
            : ''}? This is final: the version numbers stay taken`,
        })
        if (answer !== true) {
          ui.complete({
            message: 'Nothing rejected',
            nothing: true,
            details: answer === 'not interactive'
              ? ['Confirm in a terminal, or answer onPrompt']
              : [],
          })
          return { action, staged: versions, results: [] }
        }
      }

      const results = await ui.step({
        name: action,
        running: action === 'approve'
          ? 'Approving the staged versions'
          : 'Rejecting the staged versions',
        done: done => `${action === 'approve'
          ? 'Approved'
          : 'Rejected'} ${countOf(done, action === 'approve'
          ? 'approved'
          : 'rejected')} of ${done.length}`,
        failed: done => done.some(result => result.status === 'failed'),
        data: done => ({ packages: done }),
        run: async () => action === 'approve'
          ? (await approveStagedVersions({
              cwd: config.cwd,
              registry,
              versions: versions.map(version => ({
                name: version.name,
                version: version.version,
                stageId: version.stageId,
                dependencies: getDependencies(config).get(version.name) ?? [],
              })),
              getOtp: createOtpAsker({ registry, purpose: 'approve', otp: options.otp }),
              onItem: result => emitStepItem('approve', {
                name: `${result.name}@${result.version}`,
                status: result.status === 'approved'
                  ? 'done'
                  : result.status,
                ...(result.reason
                  ? { detail: result.reason }
                  : {}),
                ...(result.url
                  ? { url: result.url }
                  : {}),
              }),
              runner,
              logger,
            })).map(result => ({ ...result }))
          : rejectVersions({
              config,
              registry,
              versions,
              otp: options.otp,
              runner,
            }),
      })

      const webAuth = results.some(result => result.reason === 'web-auth')
      const url = getStagedApprovalUrl({ registry })
      ui.complete({
        message: `${action === 'approve'
          ? 'Approved'
          : 'Rejected'} ${countOf(results, action === 'approve'
          ? 'approved'
          : 'rejected')} of ${results.length} staged versions`,
        failed: results.every(result => result.status === 'failed'),
        details: results.filter(result => result.status !== 'approved' && result.status !== 'rejected').map(result => `${result.name}@${result.version}: ${result.status}${result.reason
          ? ` (${result.reason})`
          : ''}`),
        ...(webAuth && url
          ? {
              warnings: [`A security key needs the web 2FA: run it in a terminal, or approve on ${url}`],
            }
          : {}),
      })

      return { action, staged: versions, results }
    },
  })
}

/**
 * List, approve or reject the staged versions of the public packages of the
 * project: approval and rejection need the npm login and 2FA of the person,
 * never a CI or trusted publishing
 */
export function stage(options: StageOptions): Promise<StageResponse> {
  return runWithEvents(options.onProgress, () => withGitCache(() => runStage(options)), { onOtp: options.onOtp, onPrompt: options.onPrompt })
}
