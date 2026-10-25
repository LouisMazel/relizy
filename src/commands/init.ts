import type { LogLevel } from '@maz-ui/node'
import type { InitAITarget, InitAnswers, InitGoal, InitPackage, InstalledHook, ProjectDetection } from '../core'
import type { RelizyConfig, VersionMode } from '../types'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import { cancel, confirm, intro, isCancel, log, multiselect, note, outro, select, text } from '@clack/prompts'
import { logger } from '@maz-ui/node'
import {
  buildInitConfig,
  createStyles,
  detectProject,
  getCandidateWorkspaces,
  getDefaultAnswers,
  getDefaultConfig,
  getDetectedPublishConfig,
  getInstallCommand,
  getMissingRootFields,
  getReleasedPackages,
  getRunCommand,
  getScriptsToAdd,
  installCommitMsgHook,
  isInCI,
  isMonorepoProject,
  isReleasablePackage,
  renderConfigFile,
  shouldUseColors,
  suggestGoal,
  suggestPatterns,
  suggestVersionMode,
  supportsProviderRelease,
  updateRootPackageJson,
} from '../core'

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
}

export interface InitResult {
  /** Absolute path of the config file */
  configFile: string
  config: RelizyConfig
  /** Content of the config file */
  content: string
  /** `false` when cancelled or with `dryRun` */
  written: boolean
  /** Set when the commit-msg hook was installed */
  hook?: InstalledHook
  /** Scripts added to the root package.json */
  scripts: string[]
}

const c = createStyles(shouldUseColors())

const PROVIDER_NAMES = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' } as const

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
  return interactive ? answer(prompt()) as Promise<T> : Promise.resolve(detected)
}

function getProviderName(detection: ProjectDetection): string {
  return detection.provider ? PROVIDER_NAMES[detection.provider] : 'provider'
}

function formatPackageList(packages: InitPackage[]): string {
  const names = packages.map(pkg => pkg.name)
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ')
}

/** Why relizy releases a package or not, for the detection summary */
function getPackageStatus(pkg: { version?: string, private: boolean }): string {
  if (pkg.version === undefined) {
    return c.dim('no version, not released')
  }
  return pkg.private ? c.yellow(`${pkg.version}, private`) : c.green(pkg.version)
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
      rows.push(`  ${pkg.version === undefined ? c.dim('-') : c.green('✔')} ${pkg.name.padEnd(width)}  ${getPackageStatus(pkg)}`)
    }
  }
  note(rows.join('\n'), 'Project detected')
}

async function askBasics(detection: ProjectDetection, interactive: boolean): Promise<Pick<InitAnswers, 'goal' | 'patterns' | 'versionMode'>> {
  const provider = supportsProviderRelease(detection.provider) ? `${getProviderName(detection)} release` : 'no provider release'
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
      message: 'When a package is released, also bump the workspace packages depending on it through:',
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
      message: 'Keep breaking changes on 0.x versions as minor bumps (0.4.0 → 0.5.0 instead of 1.0.0)?',
      initialValue: answers.capZeroMajor,
    }))
  }
  if (isMonorepo) {
    result.rootChangelog = await answer(confirm({
      message: 'Also write a root CHANGELOG.md with the changes of every package?',
      initialValue: answers.rootChangelog,
    }))
  }
  const types = Object.entries(getDefaultConfig().types).flatMap(([type, value]) => value ? [{ type, title: value.title }] : [])
  const shown = await answer(multiselect({
    message: 'Commit types listed in the changelogs:',
    required: false,
    initialValues: types.map(({ type }) => type),
    options: types.map(({ type, title }) => ({ value: type, label: type, hint: title })),
  }))
  result.hiddenTypes = types.map(({ type }) => type).filter(type => !shown.includes(type))
  result.formatCmd = await askText({
    message: 'Command formatting the changelogs once written (leave empty to skip):',
    placeholder: 'e.g. prettier --write CHANGELOG.md',
    initialValue: detection.root.scripts.format ? getRunCommand(detection.packageManager, 'format') : undefined,
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
      initialValue: detected.registry ?? 'https://registry.npmjs.org',
    }),
    buildCmd: await askText({
      message: 'Command building the packages before publishing (leave empty to skip):',
      placeholder: `e.g. ${getRunCommand(detection.packageManager, 'build')}`,
      initialValue: answers.buildCmd,
    }),
  }
}

async function askAnnouncements(detection: ProjectDetection, answers: InitAnswers): Promise<Partial<InitAnswers>> {
  const result: Partial<InitAnswers> = {}

  log.step(c.bold('Announcements'))
  const socials = await answer(multiselect({
    message: 'Announce the releases on (leave empty to skip):',
    required: false,
    options: [
      { value: 'twitter', label: 'Twitter / X', hint: 'needs Twitter API keys in your CI' },
      { value: 'slack', label: 'Slack', hint: 'needs a Slack bot token in your CI' },
    ],
  }))
  result.twitter = socials.includes('twitter')
  result.slack = socials.includes('slack')
  if (result.slack) {
    result.slackChannel = await askText({ message: 'Slack channel (name or ID):', placeholder: '#releases', initialValue: '#releases' })
  }
  if (socials.length > 0) {
    result.changelogUrl = await askText({ message: 'URL of the full changelog, linked in the posts (leave empty to skip):', placeholder: 'https://acme.dev/changelog' })
  }
  if (supportsProviderRelease(detection.provider)) {
    result.prCommentMode = await answer(select({
      message: `Comment on the ${detection.provider === 'gitlab' ? 'merge' : 'pull'} requests included in a release:`,
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
    ...(supportsProviderRelease(detection.provider) ? [{ value: 'providerRelease' as const, label: `${getProviderName(detection)} release notes` }] : []),
    ...(answers.twitter ? [{ value: 'twitter' as const, label: 'Twitter / X posts' }] : []),
    ...(answers.slack ? [{ value: 'slack' as const, label: 'Slack posts' }] : []),
  ]
  if (targets.length === 0) {
    return {}
  }

  log.step(c.bold('AI'))
  const ai = await answer(multiselect({
    message: 'Rewrite with Claude, from the changelog (leave empty to skip):',
    required: false,
    options: targets,
  }))
  if (ai.length === 0) {
    return { ai }
  }
  return {
    ai,
    aiLanguage: await askText({ message: 'Language of the AI texts:', initialValue: answers.aiLanguage }) ?? 'en',
  }
}

async function askAdvanced(detection: ProjectDetection, answers: InitAnswers): Promise<InitAnswers> {
  let result = { ...answers, ...await askChangelog(detection, answers) }
  if (answers.goal === 'publish') {
    result = { ...result, ...await askPublish(detection, result) }
  }
  result = { ...result, ...await askAnnouncements(detection, result) }
  return { ...result, ...await askAI(detection, result) }
}

/** Why the root package.json needs these fields */
function describeRootFields(fields: { name?: string, version?: string }, answers: InitAnswers): string[] {
  const version = answers.versionMode === 'independent'
    ? `add "version": "${fields.version}" ${c.dim('(required, never bumped in independent mode)')}`
    : `add "version": "${fields.version}" ${c.dim('(the shared version, bumped at each release)')}`
  return [
    ...(fields.name ? [`add "name": "${fields.name}" ${c.dim('(required)')}`] : []),
    ...(fields.version ? [version] : []),
  ]
}

interface InitPlan {
  configFile: string
  replacedFile?: string
  rootFields: { name?: string, version?: string }
  scripts: Record<string, string>
  hook: boolean
}

function showPlan(plan: InitPlan, answers: InitAnswers, cwd: string) {
  const rows = [
    `${c.green('create')}   ${relative(cwd, plan.configFile)}`,
    ...(plan.replacedFile ? [`${c.red('remove')}   ${plan.replacedFile} ${c.dim('replaced by the new config')}`] : []),
  ]
  const packageChanges = [
    ...describeRootFields(plan.rootFields, answers),
    ...Object.entries(plan.scripts).map(([name, command]) => `add the script "${name}": "${command}"`),
  ]
  if (packageChanges.length > 0) {
    rows.push(`${c.yellow('update')}   package.json`, ...packageChanges.map(change => `         ${change}`))
  }
  if (plan.hook) {
    rows.push(`${c.cyan('install')}  commit-msg hook ${c.dim('runs relizy commitlint at each commit')}`)
  }
  note(rows.join('\n'), 'Changes')
}

async function installHook(cwd: string, interactive: boolean): Promise<InstalledHook | undefined> {
  try {
    return installCommitMsgHook({ cwd })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('already exists')) {
      log.warn(`commit-msg hook not installed - ${message}`)
      return undefined
    }
    if (!interactive || !await answer(confirm({ message: 'A commit-msg hook already exists, replace it?', initialValue: false }))) {
      log.warn(message)
      return undefined
    }
    return installCommitMsgHook({ cwd, force: true })
  }
}

function getRequiredTokens(detection: ProjectDetection, answers: InitAnswers): string[] {
  return [
    ...(answers.goal === 'publish' ? ['NPM_TOKEN'] : []),
    ...(detection.provider === 'github' ? ['GITHUB_TOKEN'] : []),
    ...(detection.provider === 'gitlab' ? ['GITLAB_TOKEN'] : []),
    ...(answers.twitter ? ['TWITTER_API_KEY', 'TWITTER_API_KEY_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET'] : []),
    ...(answers.slack ? ['SLACK_TOKEN'] : []),
    ...(answers.ai.length > 0 ? ['ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN'] : []),
  ]
}

function showNextSteps(detection: ProjectDetection, answers: InitAnswers) {
  const tokens = getRequiredTokens(detection, answers)
  const steps = [
    ...(detection.root.hasRelizy ? [] : [`Install relizy        ${c.cyan(getInstallCommand(detection))}`]),
    `Preview the release   ${c.cyan('npx relizy release --dry-run')}`,
    ...(tokens.length > 0 ? [`Set in your CI        ${tokens.map(token => c.cyan(token)).join(', ')}`] : []),
    `All the options       ${c.cyan('https://relizy.dev/config/overview')}`,
  ]
  note(steps.join('\n'), 'Next steps')
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
  if (existing && !options.force) {
    if (!interactive) {
      throw new Error(`A relizy config already exists (${existing}), run with --force to replace it`)
    }
    const replace = await answer(confirm({ message: `A relizy config already exists (${existing}), replace it?`, initialValue: false }))
    if (!replace) {
      throw new InitCancelledError('Init cancelled, the existing config is kept')
    }
  }

  const basics = await askBasics(detection, interactive)
  let answers: InitAnswers = { ...getDefaultAnswers(detection, basics), ...basics }

  const advanced = await ask(interactive, false, () => confirm({
    message: 'Customize the changelog, publishing, announcements and AI? (you can edit the config later)',
    initialValue: false,
  }))
  if (advanced) {
    answers = await askAdvanced(detection, answers)
  }

  const withHook = await ask(interactive, true, () => confirm({
    message: 'Check the commit messages at each commit with relizy commitlint? (types, scopes, changelog preview)',
    initialValue: true,
  }))

  const scriptsToAdd = getScriptsToAdd(detection)
  const withScripts = Object.keys(scriptsToAdd).length > 0 && await ask(interactive, true, () => confirm({
    message: `Add a "release" script to the package.json? (${detection.packageManager} run release)`,
    initialValue: true,
  }))

  const config = buildInitConfig(detection, answers)
  const content = renderConfigFile(config)
  note(content.trimEnd(), relative(cwd, configFile))

  if (options.dryRun) {
    outro('Dry run, nothing written')
    return { configFile, config, content, written: false, scripts: [] }
  }

  const existingPath = existing && existing !== 'package.json' ? join(cwd, existing) : undefined
  const plan: InitPlan = {
    configFile,
    // A config in another format would take precedence over the new file
    replacedFile: existingPath && existingPath !== configFile && existsSync(existingPath) ? existing : undefined,
    rootFields: getMissingRootFields(detection, answers),
    scripts: withScripts ? scriptsToAdd : {},
    hook: withHook,
  }
  showPlan(plan, answers, cwd)

  if (!await ask(interactive, true, () => confirm({ message: 'Apply these changes?', initialValue: true }))) {
    throw new InitCancelledError('Init cancelled, nothing written')
  }

  if (plan.replacedFile) {
    rmSync(join(cwd, plan.replacedFile))
  }
  writeFileSync(configFile, content)
  log.success(`Created ${relative(cwd, configFile)}`)

  if (existing === 'package.json') {
    log.warn('Remove the "relizy" key of the package.json: it is merged with the new config file')
  }

  const scripts = Object.keys(plan.scripts)
  if (Object.keys(plan.rootFields).length > 0 || scripts.length > 0) {
    updateRootPackageJson({ cwd, fields: plan.rootFields, scripts: plan.scripts })
    log.success('Updated package.json')
  }

  const hook = withHook ? await installHook(cwd, interactive) : undefined
  if (hook) {
    log.success(hook.status === 'unchanged' ? `The commit-msg hook already runs relizy commitlint (${relative(cwd, hook.path)})` : `Installed the commit-msg hook (${relative(cwd, hook.path)})`)
  }

  showNextSteps(detection, answers)
  outro(c.green('relizy is ready'))

  return { configFile, config, content, written: true, hook, scripts }
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

  intro(c.bold(' relizy init '))
  const detection = detectProject({ cwd, configName })
  showDetection(detection)

  try {
    return await runInit({ options, detection, configFile, interactive })
  }
  catch (error) {
    if (error instanceof InitCancelledError) {
      cancel(error.message)
      return { configFile, config: {}, content: '', written: false, scripts: [] }
    }
    throw error
  }
}
