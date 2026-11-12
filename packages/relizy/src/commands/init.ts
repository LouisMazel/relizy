import type { AgentTarget, LogLevel, SetupAgentsResult } from '@maz-ui/node'
import type { InitAITarget, InitAnswers, InitGoal, InitPackage, InstalledHook, ProjectDetection, WorkflowFile, WorkflowTrigger } from '../core'
import type { RelizyConfig, VersionMode } from '../types'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import process from 'node:process'
import { cancel, confirm, intro, isCancel, log, multiselect, note, outro, select, spinner, text } from '@clack/prompts'
import { detectAgentTargets, execPromise, logger } from '@maz-ui/node'
import { isInCI, tryGitSync } from '@relizy/core'
import { buildInitConfig, COMMIT_MSG_HOOK_COMMAND, createStyles, detectProject, findCiSetup, findOtherCommitMsgHook, getAnswersFromConfig, getCandidateWorkspaces, getCustomCommitMessage, getDefaultAnswers, getDefaultConfig, getDetectedPublishConfig, getInstallCommand, getMergePreviewWorkflowFile, getMissingRootFields, getNpmRegistry, getPrepareScript, getReleasedPackages, getRunCommand, getScriptsToAdd, getWorkflowFile, getWorkflowOptions, getWorkflowSecrets, hasLocalRelizyCommitMsgHook, hasRelizyCommitMsgHook, installCommitMsgHook, isGeneratedWorkflow, isLocalCommitMsgHook, isMonorepoProject, isReleasablePackage, loadRelizyConfig, renderConfigFile, shouldUseColors, suggestGoal, suggestPatterns, suggestVersionMode, supportsProviderRelease, updateRootPackageJson } from '../core'
import { askAgentTargets, setupRelizyAgents } from '../core/agents'
import { readOwnVersion } from '../core/own-version'

/**
 * A step of `relizy init`: the config, the commit-msg hook, the `release`
 * script, the AI agents, the release workflow of the CI, the merge preview
 * workflow
 */
export type InitStep = 'config' | 'commitlint' | 'scripts' | 'agents' | 'workflow' | 'merge-preview'

export const INIT_STEPS: InitStep[] = [
  'config',
  'commitlint',
  'scripts',
  'agents',
  'workflow',
  'merge-preview',
]

export interface InitOptions {
  /** Accept the detected values without asking (also when there is no TTY or in CI) */
  yes?: boolean
  /** Replace an existing config file */
  force?: boolean
  /** Print the config without writing anything */
  dryRun?: boolean
  /**
   * Config file name, without `.config.ts`
   * @default 'relizy'
   */
  configName?: string
  logLevel?: LogLevel
  /** @default process.cwd() */
  cwd?: string
  /**
   * Offer the workflows of the CI (GitHub Actions, GitLab CI): the release
   * and the merge preview
   * @default true
   */
  workflow?: boolean
  /**
   * Only run these steps, e.g. `['merge-preview']` to add the merge preview
   * workflow to a project already set up. Without `config`, the existing
   * config is kept (one is needed)
   */
  only?: InitStep[]
}

export interface InitResult {
  /** Absolute path of the config file */
  configFile: string
  config: RelizyConfig
  /** Content of the config file */
  content: string
  /** `false` when cancelled, with `dryRun`, or when the existing config is kept */
  written: boolean
  /** The existing config was kept and the other steps ran: `config` and `content` are empty */
  kept?: boolean
  /** Set when the commit-msg hook was installed */
  hook?: InstalledHook
  /** Scripts added to the root package.json */
  scripts: string[]
  /** Set when the AI agents were set up (rules and MCP server, see `relizy mcp init`) */
  agents?: SetupAgentsResult
  /** Set when the release workflow of the CI was written */
  workflow?: {
    /** Relative to the root of the project */
    file: string
    /** The `include:` to add to an existing `.gitlab-ci.yml` */
    include?: string
  }
  /** Set when the merge preview workflow was written */
  mergePreview?: {
    /** Relative to the root of the project: its own file on GitHub, the release workflow on GitLab */
    file: string
  }
}

const c = createStyles(shouldUseColors())

const PROVIDER_NAMES = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' } as const

const CI_NAMES = { github: 'GitHub Actions', gitlab: 'GitLab CI' } as const

/** Thrown when a prompt is cancelled (Ctrl+C) */
class InitCancelledError extends Error {}

/** The answer of a prompt, or stop the init when it is cancelled */
async function answer<T>(prompt: Promise<T>): Promise<Exclude<T, symbol>> {
  const value = await prompt
  if (isCancel(value)) {
    throw new InitCancelledError('Init cancelled')
  }
  return value as Exclude<T, symbol>
}

/** Ask the question, or take the detected value when not interactive */
function ask<T>(interactive: boolean, detected: T, prompt: () => Promise<NoInfer<T> | symbol>): Promise<T> {
  return interactive
    ? answer(prompt()) as Promise<T>
    : Promise.resolve(detected)
}

function getProviderName(detection: ProjectDetection): string {
  return detection.provider ? PROVIDER_NAMES[detection.provider] : 'provider'
}

function formatPackageList(packages: InitPackage[]): string {
  const names = packages.map(pkg => pkg.name)
  return names.length > 3
    ? `${names.slice(0, 3).join(', ')} +${names.length - 3}`
    : names.join(', ')
}

/** Why relizy releases a package or not, for the detection summary */
function getPackageStatus(pkg: { version?: string, private: boolean }): string {
  if (pkg.version === undefined) {
    return c.dim('no version, not released')
  }
  return pkg.private
    ? c.yellow(`${pkg.version}, private`)
    : c.green(pkg.version)
}

function showDetection(detection: ProjectDetection) {
  const rows = [
    `${c.dim('Package manager')}  ${detection.packageManager}`,
    `${c.dim('Git provider   ')}  ${detection.provider ? PROVIDER_NAMES[detection.provider] : 'not detected, provider releases disabled'}`,
  ]

  if (!isMonorepoProject(detection)) {
    rows.push(`${c.dim('Project        ')}  single package ${c.bold(detection.root.name ?? 'unnamed')} ${getPackageStatus(detection.root)}`)
    note(rows.join('\n'), 'Project detected')
    return
  }

  rows.push(`${c.dim('Workspace      ')}  ${detection.workspaceFiles.join(', ')}`, '')
  const width = Math.max(...detection.workspaces.flatMap(workspace => workspace.packages.map(pkg => pkg.name.length)))
  for (const workspace of detection.workspaces) {
    rows.push(c.bold(workspace.pattern))
    for (const pkg of workspace.packages) {
      rows.push(`  ${pkg.version === undefined
        ? c.dim('-')
        : c.green('✔')} ${pkg.name.padEnd(width)}  ${getPackageStatus(pkg)}`)
    }
  }
  note(rows.join('\n'), 'Project detected')
}

async function askBasics(detection: ProjectDetection, interactive: boolean): Promise<Pick<InitAnswers, 'goal' | 'patterns' | 'versionMode'>> {
  const provider = supportsProviderRelease(detection.provider)
    ? `${getProviderName(detection)} release`
    : 'no provider release'
  const goal = await ask<InitGoal>(interactive, suggestGoal(detection), () => select({
    message: 'What should a release do?',
    initialValue: suggestGoal(detection),
    options: [
      { value: 'publish', label: 'Publish to npm', hint: `bump, CHANGELOG.md, git tag, ${provider}, npm publish` },
      { value: 'version', label: 'Version only', hint: 'the same without npm publish, for apps and private projects' },
    ],
  }))

  if (!isMonorepoProject(detection)) {
    return { goal, patterns: [] }
  }

  const candidates = getCandidateWorkspaces(detection)
  const suggested = suggestPatterns(detection, goal)
  const patterns = candidates.length === 1
    ? [candidates[0].pattern]
    : await ask(interactive, suggested, () => multiselect({
        message: 'Which folders contain the packages to release?',
        required: true,
        initialValues: suggested,
        options: candidates.map(workspace => ({
          value: workspace.pattern,
          label: workspace.pattern,
          hint: formatPackageList(workspace.packages.filter(pkg => isReleasablePackage(pkg, goal))) || 'only private packages',
        })),
      }))

  const released = getReleasedPackages(detection, goal, patterns)
  const suggestedMode = suggestVersionMode(released)
  const versionMode = await ask<VersionMode>(interactive, suggestedMode, () => select({
    message: `How should the ${released.length} packages be versioned?`,
    initialValue: suggestedMode,
    options: [
      { value: 'selective', label: 'Selective', hint: 'one shared version, only the changed packages are bumped (recommended)' },
      { value: 'unified', label: 'Unified', hint: 'one shared version, every package is bumped at each release' },
      { value: 'independent', label: 'Independent', hint: 'one version per package, bumped from its own commits' },
    ],
  }))

  return { goal, patterns, versionMode }
}

/** The text typed, `undefined` when empty */
async function askText(options: { message: string, placeholder?: string, initialValue?: string }): Promise<string | undefined> {
  const value = await answer(text(options))
  return value?.trim() || undefined
}

async function askChangelog(detection: ProjectDetection, answers: InitAnswers): Promise<Partial<InitAnswers>> {
  const result: Partial<InitAnswers> = {}
  const isMonorepo = answers.patterns.length > 0
  const versions = isMonorepo
    ? getReleasedPackages(detection, answers.goal, answers.patterns).map(pkg => pkg.version)
    : [detection.root.version]

  log.step(c.bold('Versions & changelog'))
  if (isMonorepo) {
    result.dependencyTypes = await answer(multiselect({
      message: 'Also bump the packages depending on a released package, through:',
      required: false,
      initialValues: answers.dependencyTypes,
      options: [
        { value: 'dependencies' as const, hint: 'recommended' },
        { value: 'devDependencies' as const },
        { value: 'peerDependencies' as const },
      ],
    }))
  }
  if (versions.some(version => version?.startsWith('0.'))) {
    result.capZeroMajor = await answer(confirm({
      message: 'Release breaking changes on 0.x as minor? (0.4.0 → 0.5.0, not 1.0.0)',
      initialValue: answers.capZeroMajor,
    }))
  }
  if (isMonorepo) {
    result.rootChangelog = await answer(confirm({
      message: 'Also write a root CHANGELOG.md with the changes of every package?',
      initialValue: answers.rootChangelog,
    }))
  }
  const types = Object.entries(getDefaultConfig().types).flatMap(([type, value]) => value
    ? [
        { type, title: value.title },
      ]
    : [])
  const shown = await answer(multiselect({
    message: 'Commit types listed in the changelogs:',
    required: false,
    initialValues: types.map(({ type }) => type),
    options: types.map(({ type, title }) => ({ value: type, label: type, hint: title })),
  }))
  result.hiddenTypes = types.map(({ type }) => type).filter(type => !shown.includes(type))
  // Without formatCmd, the detected formatter formats the changelogs written
  const { formatter } = detection.root
  result.formatCmd = await askText({
    message: formatter
      ? `Command formatting the changelogs once written (leave empty to use ${formatter}, detected):`
      : 'Command formatting the changelogs once written (optional):',
    placeholder: 'e.g. eslint --fix {{files}}',
    initialValue: !formatter && detection.root.scripts.format
      ? getRunCommand(detection.packageManager, 'format')
      : undefined,
  })

  return result
}

async function askPublish(detection: ProjectDetection, answers: InitAnswers): Promise<Partial<InitAnswers>> {
  const detected = getDetectedPublishConfig(detection, answers)

  log.step(c.bold('Publish'))
  return {
    access: await answer(select({
      message: 'Access of the published packages:',
      initialValue: detected.access ?? 'public',
      options: [
        { value: 'public' as const, label: 'Public', hint: 'anyone can install them' },
        { value: 'restricted' as const, label: 'Restricted', hint: 'only the members of your npm organization (paid plan)' },
      ],
    })),
    registry: await askText({
      message: 'Registry:',
      // The registry of the .npmrc, else the public one
      initialValue: detected.registry ?? getNpmRegistry(detection.cwd),
    }),
    buildCmd: await askText({
      message: 'Build command run before publishing (optional):',
      placeholder: `e.g. ${getRunCommand(detection.packageManager, 'build')}`,
      initialValue: answers.buildCmd,
    }),
  }
}

async function askAnnouncements(detection: ProjectDetection, answers: InitAnswers): Promise<Partial<InitAnswers>> {
  const result: Partial<InitAnswers> = {}

  log.step(c.bold('Announcements'))
  const socials = await answer(multiselect({
    message: 'Announce the releases on (optional):',
    required: false,
    options: [
      { value: 'twitter', label: 'Twitter / X', hint: 'needs Twitter API keys in your CI' },
      { value: 'slack', label: 'Slack', hint: 'needs a Slack bot token in your CI' },
      { value: 'teams', label: 'Microsoft Teams', hint: 'needs the URL of a Teams workflow in your CI' },
    ],
  }))
  result.twitter = socials.includes('twitter')
  result.slack = socials.includes('slack')
  result.teams = socials.includes('teams')
  if (result.slack) {
    result.slackChannel = await askText({ message: 'Slack channel (name or ID):', placeholder: '#releases', initialValue: '#releases' })
  }
  if (socials.length > 0) {
    result.changelogUrl = await askText({ message: 'URL of the changelog linked in the posts (optional):', placeholder: 'https://acme.dev/changelog' })
  }
  if (supportsProviderRelease(detection.provider)) {
    result.prCommentMode = await answer(select({
      message: `Comment on the ${detection.provider === 'gitlab'
        ? 'merge'
        : 'pull'} requests included in a release:`,
      initialValue: answers.prCommentMode,
      options: [
        { value: 'append' as const, label: 'New comment at each release' },
        { value: 'update' as const, label: 'Update a single comment' },
      ],
    }))
  }

  return result
}

async function askAI(detection: ProjectDetection, answers: InitAnswers): Promise<Partial<InitAnswers>> {
  const targets: { value: InitAITarget, label: string }[] = [
    ...(supportsProviderRelease(detection.provider)
      ? [
          { value: 'providerRelease' as const, label: `${getProviderName(detection)} release notes` },
        ]
      : []),
    ...(answers.twitter
      ? [
          { value: 'twitter' as const, label: 'Twitter / X posts' },
        ]
      : []),
    ...(answers.slack
      ? [
          { value: 'slack' as const, label: 'Slack posts' },
        ]
      : []),
    ...(answers.teams
      ? [
          { value: 'teams' as const, label: 'Teams cards (adds the changelog to the cards)' },
        ]
      : []),
  ]
  if (targets.length === 0) {
    return {}
  }

  log.step(c.bold('AI'))
  const ai = await answer(multiselect({
    message: 'Rewrite with Claude, from the changelog (optional):',
    required: false,
    options: targets,
  }))
  if (ai.length === 0) {
    return { ai }
  }
  return {
    ai,
    aiLanguage: await askText({ message: 'Language of the AI texts:', initialValue: answers.aiLanguage }) ?? answers.aiLanguage,
  }
}

async function askAdvanced(detection: ProjectDetection, answers: InitAnswers): Promise<InitAnswers> {
  let result = {
    ...answers,
    ...await askChangelog(detection, answers),
  }
  if (answers.goal === 'publish') {
    result = {
      ...result,
      ...await askPublish(detection, result),
    }
  }
  result = {
    ...result,
    ...await askAnnouncements(detection, result),
  }
  return {
    ...result,
    ...await askAI(detection, result),
  }
}

/** Why the root package.json needs these fields */
function describeRootFields(fields: { name?: string, version?: string }, answers: InitAnswers): string[] {
  const version = answers.versionMode === 'independent'
    ? `add "version": "${fields.version}" ${c.dim('(required, never bumped in independent mode)')}`
    : `add "version": "${fields.version}" ${c.dim('(the shared version, bumped at each release)')}`
  return [
    ...(fields.name
      ? [`add "name": "${fields.name}" ${c.dim('(required)')}`]
      : []),
    ...(fields.version
      ? [version]
      : []),
  ]
}

interface InitPlan {
  configFile: string
  /** The existing config is kept, not written */
  keepConfig: boolean
  replacedFile?: string
  rootFields: { name?: string, version?: string }
  scripts: Record<string, string>
  hook: boolean
  /** The command adding relizy to the devDependencies, when it is not a dependency yet */
  install?: string
  /** The hook is written in `.git/hooks`, and at each install by the prepare script */
  localHook: boolean
  agents: AgentTarget[]
  workflow?: PlannedWorkflow
  kept: KeptStep[]
}

interface PlannedWorkflow {
  /** The release workflow, `replace` when it replaces an existing file */
  file?: WorkflowFile & { replace: boolean }
  /** The workflow of the merge preview, in its own file (GitHub, or GitLab without the release job) */
  mergePreviewFile?: WorkflowFile & { replace: boolean }
  /** The merge preview is in the release workflow (GitLab) */
  mergePreviewIncluded?: boolean
  /** The CI name: `GitHub Actions` */
  ci: string
  /** The default branch, which the merge requests of the merge preview target */
  branch: string
  /** Secrets (GitHub) or CI/CD variables (GitLab) to create */
  secrets: string[]
}

/** What is already set up and left as is, shown in the changes */
interface KeptStep {
  /** `commit-msg hook`, a file */
  target: string
  detail: string
}

function getFileAction(replace: boolean): string {
  return replace
    ? c.yellow('replace'.padEnd(9))
    : c.green('create'.padEnd(9))
}

function showPlan(plan: InitPlan, answers: InitAnswers, cwd: string) {
  const rows = [
    plan.keepConfig
      ? `${c.dim('keep')}     ${relative(cwd, plan.configFile)}`
      : `${c.green('create')}   ${relative(cwd, plan.configFile)}`,
    ...(plan.replacedFile
      ? [`${c.red('remove')}   ${plan.replacedFile} ${c.dim('replaced by the new config')}`]
      : []),
  ]
  const packageChanges = [
    ...describeRootFields(plan.rootFields, answers),
    ...Object.entries(plan.scripts).map(([name, command]) => `add the script "${name}": "${command}"`),
  ]
  if (packageChanges.length > 0) {
    rows.push(`${c.yellow('update')}   package.json`, ...packageChanges.map(change => `         ${change}`))
  }
  if (plan.install) {
    const detail = `in the devDependencies (${plan.install})`
    rows.push(`${c.cyan('install')}  relizy ${c.dim(detail)}`)
  }
  if (plan.hook) {
    const detail = plan.localHook
      ? 'runs relizy commitlint at each commit, in .git/hooks and at each install for the other clones'
      : 'runs relizy commitlint at each commit'
    rows.push(`${c.cyan('install')}  commit-msg hook ${c.dim(detail)}`)
  }
  if (plan.workflow?.file) {
    const description = plan.workflow.mergePreviewIncluded
      ? `${plan.workflow.ci}, with the merge preview`
      : plan.workflow.ci
    rows.push(`${getFileAction(plan.workflow.file.replace)}${plan.workflow.file.path} ${c.dim(description)}`)
  }
  const preview = plan.workflow?.mergePreviewFile
  if (preview) {
    const requests = plan.workflow!.ci === CI_NAMES.gitlab
      ? 'merge requests'
      : 'pull requests'
    const detail = `merge preview of the ${requests} into ${plan.workflow!.branch}`
    rows.push(`${getFileAction(preview.replace)}${preview.path} ${c.dim(detail)}`)
  }
  if (plan.agents.length > 0) {
    rows.push(`${c.cyan('setup')}    AI agents (${plan.agents.join(', ')}) ${c.dim('relizy rules and MCP server, as relizy mcp init')}`)
  }
  for (const step of plan.kept) {
    rows.push(`${c.dim('keep')}     ${step.target} ${c.dim(step.detail)}`)
  }
  note(rows.join('\n'), 'Changes')
}

/** Never throws: a failed install tells the command to run */
async function installRelizy(cwd: string, command: string): Promise<void> {
  // Without terminal (CI), a spinner writes each of its frames
  const progress = process.stdout.isTTY
    ? spinner()
    : { start: log.step, stop: log.success, error: log.warn }
  progress.start(`Installing relizy (${command})`)

  try {
    await execPromise(command, {
      cwd,
      noStdout: true,
      noStderr: true,
      noSuccess: true,
    })
    progress.stop('Installed relizy')
  }
  catch (error) {
    const message = error instanceof Error
      ? error.message
      : String(error)
    progress.error(`relizy not installed - ${message} (run ${command})`)
  }
}

function installHook(cwd: string, force: boolean): InstalledHook | undefined {
  try {
    return installCommitMsgHook({ cwd, force })
  }
  catch (error) {
    log.warn(`commit-msg hook not installed - ${error instanceof Error
      ? error.message
      : String(error)}`)
    return undefined
  }
}

/**
 * Install the commit-msg hook: not asked when one already runs relizy
 * commitlint, and another hook is only replaced once confirmed
 */
async function askHook(cwd: string, interactive: boolean, kept: KeptStep[]): Promise<{ install: boolean, force: boolean }> {
  if (hasRelizyCommitMsgHook(cwd)) {
    kept.push({ target: 'commit-msg hook', detail: 'already runs relizy commitlint' })
    return { install: false, force: false }
  }

  const other = findOtherCommitMsgHook(cwd)
  if (!other) {
    const install = await ask(interactive, true, () => confirm({
      message: 'Lint each commit message with relizy commitlint? (commit-msg hook)',
      initialValue: true,
    }))
    return { install, force: false }
  }

  const replace = await ask(interactive, false, () => confirm({
    message: `Replace the commit-msg hook (${other}) with relizy commitlint?`,
    initialValue: false,
  }))
  if (!replace) {
    log.warn(`A commit-msg hook already exists (${other}): kept, add "${COMMIT_MSG_HOOK_COMMAND}" to it to check the commit messages`)
  }
  return { install: replace, force: replace }
}

/**
 * The files of the AI agents relizy would write: none when they are already
 * set up, `undefined` when it cannot tell (set up anyway, it warns)
 */
function getAgentsChanges(cwd: string, targets: AgentTarget[]): string[] | undefined {
  try {
    return setupRelizyAgents({ cwd, targets, dryRun: true }).changes.filter(change => change.action === 'create' || change.action === 'update').map(change => change.file)
  }
  catch {
    return undefined
  }
}

/**
 * Set up the AI agents: always asked in a terminal, then which agents (the detected ones checked). Not asked
 * when the detected agents are already set up for relizy, an update of their setup is asked as such. Without
 * questions, only the detected agents are set up.
 * `targets`: the agents to set up, `setUp`: the agents use relizy once done
 */
async function askAgents(cwd: string, interactive: boolean, kept: KeptStep[]): Promise<{ targets: AgentTarget[], setUp: boolean }> {
  const detected = detectAgentTargets(cwd)
  if (!interactive && detected.length === 0) {
    return { targets: [], setUp: false }
  }

  const changes = detected.length > 0
    ? getAgentsChanges(cwd, detected)
    : undefined
  if (changes?.length === 0) {
    kept.push({ target: `AI agents (${detected.join(', ')})`, detail: 'relizy rules and MCP server already set up' })
    return { targets: [], setUp: true }
  }

  const update = detected.length > 0 && changes?.every(file => existsSync(join(cwd, file)))
  const wanted = await ask(interactive, true, () => confirm({
    message: update
      ? 'Update the relizy MCP and rules for your AI agents?'
      : 'Set up relizy MCP and rules for your AI agents?',
    initialValue: true,
  }))
  if (!wanted) {
    return { targets: [], setUp: false }
  }

  return {
    targets: interactive && !update
      ? await answer(askAgentTargets(cwd))
      : detected,
    setUp: true,
  }
}

function setUpAgents(cwd: string, targets: AgentTarget[]): SetupAgentsResult | undefined {
  try {
    const result = setupRelizyAgents({ cwd, targets })
    const written = result.changes.filter(change => change.action === 'create' || change.action === 'update').map(change => change.file)

    log.success(written.length > 0
      ? `Set up the AI agents (${written.join(', ')})`
      : 'The AI agents are already set up for relizy')
    return result
  }
  catch (error) {
    log.warn(`AI agents not set up - ${error instanceof Error
      ? error.message
      : String(error)} (run relizy mcp init later)`)
    return undefined
  }
}

/**
 * A workflow file to write: an existing one is only replaced once confirmed,
 * none when it is kept
 */
async function planWorkflowFile({ cwd, file, label, interactive }: {
  cwd: string
  file?: WorkflowFile
  /** `the release workflow` */
  label: string
  interactive: boolean
}): Promise<(WorkflowFile & { replace: boolean }) | undefined> {
  if (!file) {
    return undefined
  }

  const exists = existsSync(join(cwd, file.path))
  if (!exists) {
    return { ...file, replace: false }
  }
  if (await ask(interactive, false, () => confirm({ message: `${file.path} already exists and does not run relizy, replace it?`, initialValue: false }))) {
    return { ...file, replace: true }
  }

  log.warn(`${file.path} already exists: ${label} is not generated`)
  return undefined
}

/**
 * Run relizy with its integration (the relizy action, the component of the
 * CI/CD catalog) or with its CLI in the steps of the workflow. A GitLab
 * instance other than gitlab.com cannot include the component: its job is
 * always written out
 */
async function askIntegration({ provider, gitlabCom, interactive }: { provider: 'github' | 'gitlab', gitlabCom?: boolean, interactive: boolean }): Promise<boolean> {
  if (provider === 'gitlab' && !gitlabCom) {
    return false
  }

  const choice = await ask<'integration' | 'cli'>(interactive, 'integration', () => select<'integration' | 'cli'>({
    message: 'How does the CI run relizy?',
    options: provider === 'github'
      ? [
          { value: 'integration', label: 'With the relizy action', hint: 'relizy/action@v2: sets up Node.js and the package manager, installs and runs relizy in one step' },
          { value: 'cli', label: 'With the relizy CLI', hint: 'the steps written out in the workflow: setup, install, relizy release' },
        ]
      : [
          { value: 'integration', label: 'With the relizy component', hint: 'gitlab.com/relizy/relizy: the job of the CI/CD catalog, configured by its inputs' },
          { value: 'cli', label: 'With the relizy CLI', hint: 'the job written out in .gitlab-ci.yml: setup, install, relizy release' },
        ],
    initialValue: 'integration',
  }))
  return choice === 'integration'
}

/**
 * A workflow already running relizy in the CI: a file of the user, kept as
 * is, or a file written by relizy init, up to date or not
 */
interface ExistingWorkflow {
  path: string
  state: 'custom' | 'up-to-date' | 'outdated'
}

function getExistingWorkflow(cwd: string, path: string | undefined, generate: () => (WorkflowFile | undefined)[]): ExistingWorkflow | undefined {
  if (!path) {
    return undefined
  }

  const content = readFileSync(join(cwd, path), 'utf8')
  if (!isGeneratedWorkflow(content)) {
    return { path, state: 'custom' }
  }
  return {
    path,
    state: generate().some(file => file?.content === content)
      ? 'up-to-date'
      : 'outdated',
  }
}

/**
 * What to do with a workflow already in the CI: keep a file of the user or an
 * up to date one, replace an outdated one once confirmed. `ask` when there is
 * none
 */
async function askExistingWorkflow({ existing, label, interactive, kept }: {
  existing?: ExistingWorkflow
  /** `the release workflow` */
  label: string
  interactive: boolean
  kept: KeptStep[]
}): Promise<'ask' | 'keep' | 'replace'> {
  if (!existing) {
    return 'ask'
  }
  if (existing.state === 'outdated' && await ask(interactive, false, () => confirm({
    message: `${existing.path} was edited or generated by an older relizy, replace it?`,
    initialValue: false,
  }))) {
    return 'replace'
  }

  kept.push({
    target: existing.path,
    detail: existing.state === 'up-to-date'
      ? `${label}, up to date`
      : `${label}, already set up`,
  })
  return 'keep'
}

/**
 * The workflows of the CI, offered when the provider is GitHub or GitLab: the
 * release workflow and the merge preview, each one asked on its own (a
 * project with its release workflow can add the merge preview). The ones
 * already running relizy are not asked again: a file written by relizy init
 * that differs from the one it generates now is replaced once confirmed
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
async function askWorkflow({ detection, answers, commitMessage, interactive, release, preview, kept }: {
  detection: ProjectDetection
  answers: InitAnswers
  /** `templates.commitMessage` of the config, when set */
  commitMessage?: string
  interactive: boolean
  /** Offer the release workflow */
  release: boolean
  /** Offer the merge preview */
  preview: boolean
  /** Receives the workflows already set up */
  kept: KeptStep[]
}): Promise<PlannedWorkflow | undefined> {
  const provider = detection.provider === 'github' || detection.provider === 'gitlab'
    ? detection.provider
    : undefined
  if (!provider || (!release && !preview)) {
    return undefined
  }

  const { cwd } = detection
  const ci = CI_NAMES[provider]
  const setup = findCiSetup(cwd, provider)
  const base = getWorkflowOptions({
    detection,
    answers,
    trigger: 'manual',
    commitMessage,
  })
  // Every variant init can write, to tell an up to date file from an outdated one
  const variants = (['manual', 'push'] as const).flatMap(trigger => [true, false].flatMap(integration => [true, false].map(mergePreview => ({
    ...base,
    trigger,
    integration,
    mergePreview,
  }))))

  const releaseAction = release
    ? await askExistingWorkflow({
        existing: getExistingWorkflow(cwd, setup.release, () => variants.map(options => getWorkflowFile(options, cwd, setup.release))),
        label: 'the release workflow',
        interactive,
        kept,
      })
    : 'keep'
  const wantRelease = releaseAction === 'replace' || (releaseAction === 'ask' && await ask(interactive, true, () => confirm({
    message: `Generate the ${ci} ${provider === 'gitlab'
      ? 'job'
      : 'workflow'} that releases from ${base.branch}?`,
    initialValue: true,
  })))
  const trigger = wantRelease
    ? await ask<WorkflowTrigger>(interactive, 'manual', () => select<WorkflowTrigger>({
        message: 'When should the CI release?',
        options: [
          { value: 'manual', label: 'On demand', hint: 'run it from the CI, choosing the release type (auto, patch, minor, major)' },
          { value: 'push', label: `At each push to ${base.branch}`, hint: 'releases as soon as a commit bumps a version' },
        ],
        initialValue: 'manual',
      }))
    : 'manual'

  // The merge preview of a release workflow kept is kept with it, the one of a release workflow replaced is asked again
  const previewFile = releaseAction === 'replace' && setup.mergePreview === setup.release
    ? undefined
    : setup.mergePreview
  const inKeptRelease = Boolean(previewFile) && previewFile === setup.release && releaseAction === 'keep'
  if (preview && inKeptRelease && !release) {
    kept.push({ target: previewFile!, detail: 'the merge preview workflow, already set up' })
  }
  const previewAction = !preview || inKeptRelease
    ? 'keep'
    : await askExistingWorkflow({
        existing: getExistingWorkflow(cwd, previewFile, () => variants.map(options => getMergePreviewWorkflowFile(options, cwd, previewFile))),
        label: 'the merge preview workflow',
        interactive,
        kept,
      })
  const mergePreview = previewAction === 'replace' || (previewAction === 'ask' && await ask(interactive, true, () => confirm({
    message: `Preview the release in the ${provider === 'gitlab'
      ? 'merge'
      : 'pull'} requests into ${base.branch}? (a comment, and a check that fails when the release would fail)`,
    initialValue: true,
  })))
  if (!wantRelease && !mergePreview) {
    return undefined
  }

  const options = {
    ...base,
    trigger,
    mergePreview,
    integration: await askIntegration({ provider, gitlabCom: base.gitlabCom, interactive }),
  }

  // GitLab: the merge preview goes in the file of the release when it is generated
  const file = wantRelease
    ? releaseAction === 'replace'
      ? {
          ...getWorkflowFile(options, cwd, setup.release),
          replace: true,
        }
      : await planWorkflowFile({
          cwd,
          file: getWorkflowFile({ ...options, mergePreview: mergePreview && provider === 'gitlab' }, cwd),
          label: 'the release workflow',
          interactive,
        })
    : undefined
  const mergePreviewIncluded = mergePreview && provider === 'gitlab' && Boolean(file)
  const mergePreviewFile = mergePreview && !mergePreviewIncluded
    ? previewAction === 'replace'
      ? {
          ...getMergePreviewWorkflowFile(options, cwd, previewFile)!,
          replace: true,
        }
      : await planWorkflowFile({
          cwd,
          file: getMergePreviewWorkflowFile(options, cwd),
          label: 'the merge preview workflow',
          interactive,
        })
    : undefined
  if (!file && !mergePreviewFile) {
    return undefined
  }

  return {
    ...(file && { file }),
    ...(mergePreviewFile && { mergePreviewFile }),
    ...(mergePreviewIncluded && { mergePreviewIncluded }),
    ci,
    branch: base.branch,
    // The secrets of the release, the merge preview alone uses the token of the job
    secrets: file
      ? getWorkflowSecrets(options)
      : provider === 'gitlab'
        ? ['GITLAB_TOKEN']
        : [],
  }
}

function getRequiredTokens(detection: ProjectDetection, answers: InitAnswers): string[] {
  return [
    ...(answers.goal === 'publish'
      ? ['NPM_TOKEN']
      : []),
    ...(detection.provider === 'github'
      ? ['GITHUB_TOKEN']
      : []),
    ...(detection.provider === 'gitlab'
      ? ['GITLAB_TOKEN']
      : []),
    ...(answers.twitter
      ? [
          'TWITTER_API_KEY',
          'TWITTER_API_KEY_SECRET',
          'TWITTER_ACCESS_TOKEN',
          'TWITTER_ACCESS_TOKEN_SECRET',
        ]
      : []),
    ...(answers.slack
      ? ['SLACK_TOKEN']
      : []),
    ...(answers.teams
      ? [
          detection.provider === 'gitlab'
            ? 'TEAMS_WEBHOOK_URL_B64'
            : 'TEAMS_WEBHOOK_URL',
        ]
      : []),
    ...(answers.ai.length > 0
      ? ['ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN']
      : []),
  ]
}

/** The steps to run: all of them, or the ones of `only`; `workflow: false` drops the workflows of the CI */
function getInitSteps(options: InitOptions): Set<InitStep> {
  const steps = new Set(options.only ?? INIT_STEPS)
  if (options.workflow === false) {
    steps.delete('workflow')
    steps.delete('merge-preview')
  }
  return steps
}

/** The file of the merge preview written: its own one (GitHub), or the release workflow including it (GitLab) */
function getWrittenMergePreview(workflow: PlannedWorkflow): Pick<InitResult, 'mergePreview'> {
  const file = workflow.mergePreviewFile?.path ?? (workflow.mergePreviewIncluded
    ? workflow.file?.path
    : undefined)
  return file
    ? {
        mergePreview: { file },
      }
    : {}
}

/** A token to set for a local release, with the login that replaces it when there is one */
const LOCAL_TOKEN_ALTERNATIVES: Record<string, string> = {
  NPM_TOKEN: '(or npm login)',
  GITHUB_TOKEN: '(or gh auth login)',
}

function showNextSteps(detection: ProjectDetection, answers: InitAnswers, workflow?: PlannedWorkflow) {
  // The CI gives GITHUB_TOKEN to the jobs, a local release needs every token
  const localTokens = getRequiredTokens(detection, answers)
  const ciTokens = workflow?.secrets ?? localTokens
  const secretsLabel = detection.provider === 'gitlab'
    ? 'Add the CI/CD variables'
    : 'Add the secrets      '
  // `git check-ignore` prints the ignored path, nothing when it is not ignored
  const envIgnored = tryGitSync(['check-ignore', '.env'], { cwd: detection.cwd }) !== undefined
  const envTokens = localTokens.map(token => LOCAL_TOKEN_ALTERNATIVES[token]
    ? `${c.cyan(token)} ${c.dim(LOCAL_TOKEN_ALTERNATIVES[token])}`
    : c.cyan(token)).join(', ')
  const steps = [
    ...(localTokens.length > 0
      ? [
          `Set in .env           ${envTokens}`,
          ...(envIgnored
            ? []
            : [`                      ${c.dim('add .env to .gitignore')}`]),
        ]
      : []),
    `Preview the release   ${c.cyan('npx relizy release --dry-run')}`,
    ...(workflow?.file?.include
      ? [`Include the workflow  ${c.cyan(workflow.file.include.replace('\n', ' '))} ${c.dim('in .gitlab-ci.yml')}`]
      : []),
    ...(workflow?.mergePreviewFile?.include
      ? [`Include the preview   ${c.cyan(workflow.mergePreviewFile.include.replace('\n', ' '))} ${c.dim('in .gitlab-ci.yml')}`]
      : []),
    ...(ciTokens.length > 0
      ? [`${workflow ? secretsLabel : 'Set in your CI       '} ${ciTokens.map(token => c.cyan(token)).join(', ')}`]
      : []),
    ...(answers.goal === 'publish'
      ? [`Publish without token ${c.cyan('https://relizy.dev/guide/trusted-publishing')} ${c.dim('(trusted publishing, after a first publish)')}`]
      : []),
    `All the options       ${c.cyan('https://relizy.dev/config/overview')}`,
  ]
  note(steps.join('\n'), 'Next steps')
}

/**
 * Keep an existing config (the default, also without questions) or replace
 * it: `--force` replaces it
 */
async function askExistingConfig(existing: string, options: InitOptions, interactive: boolean): Promise<'keep' | 'replace'> {
  if (options.force) {
    return 'replace'
  }
  if (!interactive) {
    log.info(`A relizy config already exists (${existing}): kept, run with --force to replace it`)
    return 'keep'
  }

  const choice = await answer(select<'keep' | 'replace' | 'cancel'>({
    message: `A relizy config already exists (${existing})`,
    options: [
      { value: 'keep', label: 'Keep it and set up the rest', hint: 'commit-msg hook, release script, AI agents, CI workflows' },
      { value: 'replace', label: 'Replace it', hint: 'answer the questions of the config again' },
      { value: 'cancel', label: 'Cancel' },
    ],
    initialValue: 'keep',
  }))
  if (choice === 'cancel') {
    throw new InitCancelledError('Init cancelled, nothing written')
  }
  return choice
}

/**
 * The answers of the config: asked, or read from the existing config kept
 */
async function askConfig({ detection, options, interactive, keep }: {
  detection: ProjectDetection
  options: InitOptions
  interactive: boolean
  keep: boolean
}): Promise<{ answers: InitAnswers, config?: RelizyConfig, commitMessage?: string }> {
  if (keep) {
    const resolved = await loadRelizyConfig({
      configFile: options.configName,
      overrides: { cwd: detection.cwd },
    })
    return {
      answers: getAnswersFromConfig(detection, resolved),
      commitMessage: getCustomCommitMessage(resolved),
    }
  }

  const basics = await askBasics(detection, interactive)
  let answers: InitAnswers = {
    ...getDefaultAnswers(detection, basics),
    ...basics,
  }

  const advanced = await ask(interactive, false, () => confirm({
    message: 'Customize the changelog, publishing, announcements and AI?',
    initialValue: false,
  }))
  if (advanced) {
    answers = await askAdvanced(detection, answers)
  }

  const config = buildInitConfig(detection, answers)
  return { answers, config, commitMessage: config.templates?.commitMessage }
}

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
async function runInit({ options, detection, configFile, interactive }: {
  options: InitOptions
  detection: ProjectDetection
  configFile: string
  interactive: boolean
}): Promise<InitResult> {
  const { cwd } = detection
  const existing = detection.existingConfigFile
  const steps = getInitSteps(options)
  if (!steps.has('config') && !existing) {
    throw new Error(`No relizy config in ${cwd}: run relizy init first, or add config to --only`)
  }
  // Without the config step, the existing config is kept without asking
  const keep = existing
    ? !steps.has('config') || await askExistingConfig(existing, options, interactive) === 'keep'
    : false
  const { answers, config, commitMessage } = await askConfig({
    detection,
    options,
    interactive,
    keep,
  })

  const kept: KeptStep[] = []
  const hook = steps.has('commitlint')
    ? await askHook(cwd, interactive, kept)
    : { install: false, force: false }

  const agents = steps.has('agents')
    ? await askAgents(cwd, interactive, kept)
    : { targets: [], setUp: false }

  // Also offered when the agents were already set up without it
  const withAgentRules = agents.setUp && Object.keys(getPrepareScript(detection)).length > 0 && await ask(interactive, true, () => confirm({
    message: 'Update the agent rules at each install? (adds "relizy mcp update" to the prepare script)',
    initialValue: true,
  }))
  // A hook of .git/hooks is not versioned: the prepare script writes it on each clone, also when it is already installed
  const localHook = steps.has('commitlint') && isLocalCommitMsgHook(cwd) && (hook.install || hasLocalRelizyCommitMsgHook(cwd))
  const prepareScript = getPrepareScript(detection, { agents: withAgentRules, hook: localHook })

  const scriptsToAdd = getScriptsToAdd(detection)
  const withScripts = steps.has('scripts') && Object.keys(scriptsToAdd).length > 0 && await ask(interactive, true, () => confirm({
    message: `Add a "release" script to the package.json? (${detection.packageManager} run release)`,
    initialValue: true,
  }))

  const workflow = await askWorkflow({
    detection,
    answers,
    commitMessage,
    interactive,
    release: steps.has('workflow'),
    preview: steps.has('merge-preview'),
    kept,
  })

  const content = config
    ? renderConfigFile(config)
    : ''
  if (config) {
    note(content.trimEnd(), relative(cwd, configFile))
  }

  if (options.dryRun) {
    if (workflow) {
      if (workflow.file) {
        note(workflow.file.content.trimEnd(), workflow.file.path)
      }
      if (workflow.mergePreviewFile) {
        note(workflow.mergePreviewFile.content.trimEnd(), workflow.mergePreviewFile.path)
      }
    }
    outro('Dry run, nothing written')
    return {
      configFile,
      config: config ?? {},
      content,
      written: false,
      scripts: [],
      ...(keep && { kept: true }),
    }
  }

  const existingPath = existing && existing !== 'package.json'
    ? join(cwd, existing)
    : undefined
  const plan: InitPlan = {
    // The kept config stays where it is
    configFile: keep && existing
      ? join(cwd, existing)
      : configFile,
    keepConfig: keep,
    // A config in another format would take precedence over the new file
    replacedFile: !keep && existingPath && existingPath !== configFile && existsSync(existingPath)
      ? existing
      : undefined,
    // The fields the questions of the config need
    rootFields: keep
      ? {}
      : getMissingRootFields(detection, answers),
    scripts: {
      ...(withScripts && scriptsToAdd),
      // writes the hook and keeps the rules of the agents up to date at each install
      ...prepareScript,
    },
    hook: hook.install,
    // The config imports relizy, the prepare script and the CI run it
    ...(!detection.root.hasRelizy && {
      install: getInstallCommand(detection, readOwnVersion()),
    }),
    localHook,
    agents: agents.targets,
    workflow,
    kept,
  }
  showPlan(plan, answers, cwd)

  const scripts = Object.keys(plan.scripts)
  if (!config && Object.keys(plan.rootFields).length === 0 && scripts.length === 0 && !plan.hook && !plan.install && plan.agents.length === 0 && !workflow) {
    outro(c.green('relizy is already set up, nothing to change'))
    return {
      configFile: plan.configFile,
      config: {},
      content,
      written: false,
      kept: true,
      scripts,
    }
  }

  if (!await ask(interactive, true, () => confirm({ message: 'Apply these changes?', initialValue: true }))) {
    throw new InitCancelledError('Init cancelled, nothing written')
  }

  if (plan.replacedFile) {
    rmSync(join(cwd, plan.replacedFile))
  }
  if (config) {
    writeFileSync(configFile, content)
    log.success(`Created ${relative(cwd, configFile)}`)

    if (existing === 'package.json') {
      log.warn('Remove the "relizy" key of the package.json: it is merged with the new config file')
    }
  }

  if (Object.keys(plan.rootFields).length > 0 || scripts.length > 0) {
    updateRootPackageJson({ cwd, fields: plan.rootFields, scripts: plan.scripts })
    log.success('Updated package.json')
  }

  const installedHook = plan.hook
    ? installHook(cwd, hook.force)
    : undefined
  if (installedHook) {
    log.success(installedHook.status === 'unchanged'
      ? `The commit-msg hook already runs relizy commitlint (${relative(cwd, installedHook.path)})`
      : `${installedHook.status === 'replaced'
        ? 'Replaced'
        : 'Installed'} the commit-msg hook (${relative(cwd, installedHook.path)})`)
    if (installedHook.removed) {
      log.success(`Removed the old commit-msg hook, no longer run (${relative(cwd, installedHook.removed)})`)
    }
  }

  // Before the agents: their MCP server starts the installed relizy
  if (plan.install) {
    await installRelizy(cwd, plan.install)
  }

  const agentsResult = plan.agents.length > 0
    ? setUpAgents(cwd, plan.agents)
    : undefined

  if (workflow) {
    for (const file of [
      ...(workflow.file
        ? [workflow.file]
        : []),
      ...(workflow.mergePreviewFile
        ? [workflow.mergePreviewFile]
        : []),
    ]) {
      const path = join(cwd, file.path)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, file.content)
      log.success(`${file.replace ? 'Replaced' : 'Created'} ${file.path}`)
    }
  }

  showNextSteps(detection, answers, workflow)
  outro(c.green('relizy is ready'))

  return {
    configFile: plan.configFile,
    config: config ?? {},
    content,
    written: Boolean(config),
    ...(keep && { kept: true }),
    hook: installedHook,
    scripts,
    ...(agentsResult && { agents: agentsResult }),
    ...(workflow?.file && {
      workflow: {
        file: workflow.file.path,
        ...(workflow.file.include && { include: workflow.file.include }),
      },
    }),
    ...(workflow && getWrittenMergePreview(workflow)),
  }
}

/**
 * Create the relizy config of the project: detect as much as possible (packages,
 * versions, package manager, git provider...), ask the rest, then optionally
 * install the commit-msg hook of `relizy commitlint` and a `release` script.
 */
export async function init(options: InitOptions = {}): Promise<InitResult> {
  if (options.logLevel) {
    logger.setLevel(options.logLevel)
  }

  const cwd = options.cwd ?? process.cwd()
  const configName = options.configName ?? 'relizy'
  const configFile = join(cwd, `${configName}.config.ts`)
  const interactive = !options.yes && Boolean(process.stdin.isTTY) && !isInCI()

  // Apart from the command typed, or the line of the package manager running the script
  process.stdout.write('\n')
  intro(c.bold(' relizy init '))
  const detection = detectProject({ cwd, configName })
  showDetection(detection)

  try {
    return await runInit({
      options,
      detection,
      configFile,
      interactive,
    })
  }
  catch (error) {
    if (error instanceof InitCancelledError) {
      cancel(error.message)
      return {
        configFile,
        config: {},
        content: '',
        written: false,
        scripts: [],
      }
    }
    throw error
  }
}
