import type { SpinnerResult } from '@clack/prompts'
import type { BumpResult, PackageBase } from '../types'
import type { Preview, ProgressOptions } from './progress'
import type { ReleaseReport } from './release-report'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import { format, stripVTControlCharacters, styleText } from 'node:util'
import { box, intro, isCancel, log, outro, confirm as promptConfirm, spinner } from '@clack/prompts'
import { logger } from '@maz-ui/node'
import * as semver from 'semver'
import { setBumpConfirmation } from './bump-prompt'
import { markErrorReported, RelizyCancelError } from './errors'
import { reportProgress, setProgressHandlers } from './progress'
import { getReleaseLines } from './release-overview'
import { formatReleaseReportText, getReleaseSummary } from './release-report'

/**
 * The output of the commands of the CLI: one line per step with its duration,
 * the details of a step only with `--log-level verbose`, a full log file
 * (`node_modules/.cache/relizy/release.log`).
 *
 * - `pretty`: an interactive terminal, with @clack/prompts
 * - `ci`: lines only (no cursor move), the logs of each step in a
 *   collapsible group of GitHub Actions or GitLab CI, the result after it
 * - `classic`: the logs of the logger, for the programmatic API
 *
 * A command run by another one (`bump` in `release`) shows its steps as the
 * progress of the running step.
 */

type Renderer = 'pretty' | 'ci' | 'classic'
type CiProvider = 'github' | 'gitlab' | 'other'

interface CapturedLog {
  type: string
  message: string
}

interface Reporter { log: (logObj: { type: string, args: unknown[] }) => void }

const VERBOSE_LEVELS = new Set(['verbose', 'debug', 'trace'])
const INFO_TYPES = new Set(['info', 'start', 'log', 'success', 'ready', 'box'])
const ERROR_TYPES = new Set(['error', 'fail', 'fatal'])

/**
 * Color a text: in CI too (GitHub and GitLab show the colors of the logs,
 * which are not a terminal), unless `NO_COLOR`
 */
function paint(format: Parameters<typeof styleText>[0], text: string): string {
  if (!isCi()) {
    return styleText(format, text)
  }

  return process.env.NO_COLOR ? text : styleText(format, text, { validateStream: false })
}

const dim = (text: string) => paint('dim', text)
const bold = (text: string) => paint('bold', text)
const DRY_RUN_BADGE = paint(['bgYellow', 'black', 'bold'], ' DRY RUN ')
const DRY_RUN_TAG = paint('yellow', 'dry run')
const AI_SYMBOL = '✨'

/** Links of a summary entry, shown below it */
const SUMMARY_MAX_LINKS = 3

function formatLinks(links: { url: string }[] = []): string[] {
  const urls = links.slice(0, SUMMARY_MAX_LINKS).map(({ url }) => url)
  return links.length > SUMMARY_MAX_LINKS ? [...urls, `and ${links.length - SUMMARY_MAX_LINKS} more`] : urls
}

/**
 * The command run, without what only makes sense in dry-run
 */
function getRealCommand(): string {
  const args = process.argv.slice(2).filter(arg => !['--dry-run', '--ai-preview', '--no-preview'].includes(arg))
  return `relizy ${args.join(' ')}`
}

/**
 * A box of the guide, after an empty line of the guide
 */
function spacedBox(content: string, title: string, contentPadding = 1): void {
  process.stdout.write(`${paint('gray', '│')}\n`)
  box(content, title, { width: 'auto', rounded: true, contentPadding, formatBorder: dim })
}
/** Lines of a preview, unless `--log-level verbose` */
const PREVIEW_MAX_LINES = 30

/**
 * The markdown of a preview, lightly styled: titles, bold, links
 */
function styleMarkdown(line: string): string {
  if (/^#{1,6} /.test(line)) {
    return paint(['cyan', 'bold'], line)
  }

  return line
    .replaceAll(/\*\*([^*]+)\*\*/g, (_, text: string) => bold(text))
    // eslint-disable-next-line sonarjs/super-linear-regex
    .replaceAll(/\[[^\]]+\]\([^)]+\)/g, match => dim(match))
}

/**
 * A light passing over the text, while the AI writes
 */
function shimmer(text: string, frame: number): string {
  const chars = [...text]
  const center = (frame % (chars.length + 12)) - 6

  return chars.map((char, index) => {
    const distance = Math.abs(index - center)
    return paint(distance <= 1 ? ['whiteBright', 'bold'] : distance <= 3 ? 'magentaBright' : 'magenta', char)
  }).join('')
}

function isCi(): boolean {
  return ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE', 'CIRCLECI'].some(name => process.env[name] && process.env[name] !== 'false')
}

function getCiProvider(): CiProvider {
  if (process.env.GITHUB_ACTIONS === 'true') {
    return 'github'
  }

  return process.env.GITLAB_CI ? 'gitlab' : 'other'
}

let cliUi = false

/**
 * Show the output of the CLI: called by the CLI, the programmatic API keeps
 * the logs of the logger
 */
export function enableCliUi(): void {
  cliUi = true
}

/**
 * `RELIZY_REPORTER` (`pretty`, `ci`, `classic`) when set, else `classic` out
 * of the CLI, else `ci` in CI (checked first: some runners fake a terminal),
 * else `pretty` in a terminal
 */
function resolveRenderer(): Renderer {
  const forced = process.env.RELIZY_REPORTER

  if (forced === 'pretty' || forced === 'ci' || forced === 'classic') {
    return forced
  }

  if (!cliUi) {
    return 'classic'
  }

  return isCi() || !process.stdout.isTTY ? 'ci' : 'pretty'
}

export function isFancyUi(): boolean {
  return resolveRenderer() !== 'classic'
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export interface ReleaseStep<T> {
  /**
   * Lines of the box of the classic output, none when the step prints its own
   */
  title?: string | string[]
  /**
   * What the step does, while it runs: `Publishing packages`
   */
  running: string
  /**
   * What the step did: `Published relizy@2.0.0 to npm`
   */
  done: (result: T) => string
  /**
   * Lines shown under the step when done (the packages of the bump)
   */
  details?: (result: T) => string[]
  /**
   * The step did not stop the release but failed (a provider release, a post)
   */
  failed?: (result: T) => boolean
  run: () => Promise<T>
}

export interface CommandOutcome {
  /**
   * What the command did: `Bumped relizy 1.14.4-beta.0 → 2.0.0`
   */
  message: string
  /**
   * Nothing was done (no commit to release): not a success
   */
  nothing?: boolean
  /**
   * Nothing was done because it failed (every post failed)
   */
  failed?: boolean
  /**
   * Lines shown before the end
   */
  details?: string[]
  /**
   * What the command created
   */
  links?: { label: string, url: string }[]
}

export interface ReleaseUi {
  start: (title: string) => void
  step: <T>(step: ReleaseStep<T>) => Promise<T>
  skip: (step: { title: string, label: string, reason: string }) => void
  /**
   * End of `release`, with its summary
   */
  finish: (report: ReleaseReport) => void
  /**
   * End of another command
   */
  complete: (outcome: CommandOutcome) => void
  fail: (error: unknown, failedStep?: string, report?: ReleaseReport) => void
}

/**
 * The output of a command run by another one: its steps are the progress of
 * the running step, its end is the one of the parent
 */
const nestedUi: ReleaseUi = {
  start: () => {},
  step: ({ running, run }) => {
    reportProgress(running)
    return run()
  },
  skip: () => {},
  finish: () => {},
  complete: () => {},
  fail: () => {},
}

function createClassicUi(): ReleaseUi {
  return {
    start: () => {},
    complete: () => {},
    step: ({ title, run }) => {
      if (title) {
        logger.box(...[title].flat() as [string, ...string[]])
      }
      return run()
    },
    skip: ({ title, reason }) => {
      logger.box(title)
      logger.info(reason)
    },
    finish: (report) => {
      logger.box(formatReleaseReportText(report))
    },
    fail: () => {},
  }
}

let activeUi: StepUi | undefined

function setActiveUi(ui: StepUi | undefined): void {
  activeUi = ui
  setBumpConfirmation(ui ? packages => confirmBumpInReleaseUi({ packages }) : undefined)
  setProgressHandlers(ui
    ? {
        progress: (message, options) => ui.showProgress(message, options),
        note: (message, options) => ui.note(message, options),
        preview: preview => ui.preview(preview),
      }
    : undefined)
}

interface StepNote extends ProgressOptions {
  message: string
}

/**
 * The output of the steps: the logs of relizy are captured (and written to
 * the log file), each renderer decides what it shows.
 */
abstract class StepUi implements ReleaseUi {
  protected logs: CapturedLog[] = []
  protected notes: StepNote[] = []
  protected previews: Preview[] = []
  protected readonly startedAt = Date.now()
  protected currentStep = ''
  private originalReporters: Reporter[] = []
  private reporters: Reporter[] = []
  private originalSetLevel: typeof logger.setLevel | undefined
  private requestedLevel: Parameters<typeof logger.setLevel>[0] = 'default'
  private readonly logFile: string

  constructor(
    protected readonly options: { dryRun: boolean, verbose: boolean, cwd: string },
  ) {
    this.logFile = join(options.cwd, 'node_modules/.cache/relizy/release.log')
  }

  private readonly reporter: Reporter = {
    log: (logObj) => {
      const message = stripVTControlCharacters(format(...logObj.args)).trim()

      if (!message) {
        return
      }

      this.writeLogFile(`[${logObj.type}] ${message}`)

      if (logObj.type !== 'debug' && logObj.type !== 'trace' && logObj.type !== 'verbose') {
        this.logs.push({ type: logObj.type, message })
        this.onLog({ type: logObj.type, message })
      }
    },
  }

  private writeLogFile(line: string): void {
    try {
      appendFileSync(this.logFile, `${line}\n`)
    }
    catch {}
  }

  /** The command shown: `release`, `bump` */
  command = ''

  get isDryRun(): boolean {
    return this.options.dryRun
  }

  protected get logFilePath(): string {
    return relative(this.options.cwd, this.logFile)
  }

  start(title: string): void {
    this.command = title.split(' ')[1] ?? ''
    setActiveUi(this)

    try {
      mkdirSync(join(this.logFile, '..'), { recursive: true })
      writeFileSync(this.logFile, `relizy ${title}, ${new Date().toISOString()}\n`)
    }
    catch {}

    // Removing a reporter that is not registered returns the consola instance, and its reporters
    this.reporters = ((logger.removeReporter as unknown as (reporter: unknown) => { options: { reporters: Reporter[] } })({})).options.reporters
    this.originalReporters = this.reporters.splice(0)
    this.reporters.push(this.reporter)
    // Every log goes to the log file, the renderer filters what it shows: the
    // level asked meanwhile (the config of each step sets it) applies afterwards
    this.originalSetLevel = logger.setLevel
    this.originalSetLevel('verbose')
    logger.setLevel = (level) => {
      this.requestedLevel = level
    }
    this.onStart(title)
  }

  protected restore(): void {
    this.reporters.splice(0, this.reporters.length, ...this.originalReporters)

    if (this.originalSetLevel) {
      logger.setLevel = this.originalSetLevel
      logger.setLevel(this.requestedLevel)
    }

    setActiveUi(undefined)
  }

  /** The warnings of the step, on one line each */
  protected takeWarnings(): string[] {
    const warnings = this.logs.filter(({ type }) => type === 'warn').map(({ message }) => message.split('\n')[0]!.replace(/:$/, ''))
    return [...new Set(warnings)]
  }

  async step<T>(step: ReleaseStep<T>): Promise<T> {
    this.currentStep = step.running
    this.logs = []
    this.notes = []
    this.previews = []
    const startedAt = Date.now()
    this.onStepStart(step)

    try {
      const result = await step.run()
      this.onStepDone(step, result, formatDuration(Date.now() - startedAt))
      return result
    }
    catch (error) {
      if (error instanceof RelizyCancelError) {
        // A refused prompt is not a failure of the step: only the cancellation is shown
        this.onStepCancelled()
      }
      else {
        this.onStepFailed(step, formatDuration(Date.now() - startedAt))
      }
      throw error
    }
  }

  /** What the step is doing now */
  abstract progress(message: string, options: ProgressOptions): void

  /** The progress, unless it is the step itself (the first step of a command run by the step) */
  showProgress(message: string, options: ProgressOptions): void {
    if (message !== this.currentStep) {
      this.progress(message, options)
    }
  }

  /** What the step did, shown under its result */
  note(message: string, options: ProgressOptions): void {
    this.notes.push({ message, ...options })
  }

  /** What a dry run generated, shown under the result of the step (in full in the log file) */
  preview(preview: Preview): void {
    this.previews.push(preview)
    this.writeLogFile([`[preview] ${preview.title}`, ...preview.meta ?? [], preview.content].join('\n'))
  }

  /** The lines of a preview: its facts, then its content, cut unless verbose */
  protected getPreviewLines(preview: Preview): { lines: string[], hidden: number } {
    const content = preview.content.trim().split('\n')
    const shown = this.options.verbose ? content : content.slice(0, PREVIEW_MAX_LINES)
    const meta = preview.meta?.length ? [...preview.meta, ''] : []

    return { lines: [...meta, ...shown], hidden: content.length - shown.length }
  }

  /** The error, once: what went wrong, how to go on, where the full log is */
  protected describeError(error: unknown): string[] {
    const message = error instanceof Error ? error.message : String(error)

    return [
      ...message.split('\n').filter(line => line.trim()).slice(0, 6).map(line => line.trim()),
      dim(`Full log: ${this.logFilePath}`),
    ]
  }

  fail(error: unknown, failedStep?: string, report?: ReleaseReport): void {
    markErrorReported(error)
    this.onFail(error, failedStep, report)
    this.restore()
  }

  abstract skip(step: { label: string, reason: string }): void
  abstract finish(report: ReleaseReport): void
  abstract complete(outcome: CommandOutcome): void
  abstract prompt<T>(run: () => Promise<T>): Promise<T>
  protected abstract onStart(title: string): void
  protected abstract onLog(log: CapturedLog): void
  protected abstract onStepStart(step: { running: string }): void
  protected abstract onStepDone<T>(step: ReleaseStep<T>, result: T, duration: string): void
  protected abstract onStepFailed(step: { running: string }, duration: string): void
  protected abstract onStepCancelled(): void
  protected abstract onFail(error: unknown, failedStep?: string, report?: ReleaseReport): void
}

function describeRelease(report: ReleaseReport): string {
  return getReleaseLines(report.release ?? { projectName: '', groups: [] }).map(line => `${line.name} ${line.version}`).join(', ')
}

class PrettyUi extends StepUi {
  private spin: SpinnerResult | undefined
  private stepStartedAt = 0
  private current: StepNote | undefined
  private frame = 0
  private ticker: ReturnType<typeof setInterval> | undefined

  private startSpinner(): void {
    this.spin = spinner()
    this.spin.start(this.currentStep)
    this.ticker = setInterval(() => this.render(), 80)
  }

  private stopTicker(): void {
    clearInterval(this.ticker)
    this.ticker = undefined
  }

  /** The spinner text: what the step does now, and since when once it takes time */
  private render(): void {
    this.frame++
    const elapsed = Date.now() - this.stepStartedAt
    const text = this.current?.ai
      ? `${AI_SYMBOL} ${shimmer(this.current.message, this.frame)}`
      : this.current?.message ?? this.currentStep
    const seconds = dim(`${Math.floor(elapsed / 1000)}s`)
    this.spin?.message(elapsed < 2000 ? text : `${text}  ${seconds}`)
  }

  progress(message: string, options: ProgressOptions): void {
    this.current = { message, ...options }
    this.render()
  }

  private printNotes(): void {
    for (const { message, ai } of this.notes) {
      log.message(ai ? paint('magenta', message) : dim(message), { symbol: ai ? AI_SYMBOL : dim('·') })
    }
  }

  private printPreviews(): void {
    for (const preview of this.previews) {
      const { lines, hidden } = this.getPreviewLines(preview)
      const metaCount = preview.meta?.length ? preview.meta.length + 1 : 0
      const styled = lines.map((line, index) => index < metaCount ? dim(line) : styleMarkdown(line))

      if (hidden > 0) {
        styled.push('', dim(`… ${hidden} more lines (--log-level verbose, or ${this.logFilePath})`))
      }

      spacedBox(styled.join('\n'), ` ${paint('yellow', 'Preview')} ${bold(preview.title)} `)
    }
  }

  /** The summary of the release, always at the end */
  private printSummary(report: ReleaseReport): void {
    const entries = getReleaseSummary(report)

    if (entries.length === 0) {
      return
    }

    if (report.dryRun) {
      entries.push({ label: 'For real', value: getRealCommand() })
    }

    const width = Math.max(...entries.map(({ label }) => label.length))
    const columns = process.stdout.columns || 80
    const icons = { done: paint('green', '✔'), skipped: dim('○'), failed: paint('yellow', '▲') }
    const lines = entries.flatMap(({ label, value, status, links }) => {
      const icon = status ? icons[status] : ' '
      const text = status === 'skipped' ? dim(value) : status === 'failed' ? paint('yellow', value) : value
      // Under the value when it fits, else under the label
      const urls = formatLinks(links).map(url => `${' '.repeat(width + url.length + 14 <= columns ? width + 4 : 2)}${paint('cyan', url)}`)
      return [`${icon} ${dim(label.padEnd(width))}  ${text}`, ...urls]
    })
    const title = report.dryRun ? `Summary  ${DRY_RUN_BADGE}` : 'Summary'

    spacedBox(lines.join('\n'), ` ${bold(title)} `)
  }

  protected onStart(title: string): void {
    intro(this.options.dryRun ? `${bold(title)}  ${DRY_RUN_BADGE} ${dim('nothing will be written')}` : bold(title))
  }

  protected onLog(): void {
    // The step shows what it does, not the logs of relizy (see --log-level verbose)
  }

  protected onStepStart(): void {
    this.stepStartedAt = Date.now()
    this.current = undefined
    this.startSpinner()
  }

  private printStepLogs(): void {
    if (this.options.verbose) {
      const lines = this.logs.filter(({ type }) => INFO_TYPES.has(type)).flatMap(({ message }) => message.split('\n'))
      if (lines.length > 0) {
        log.message(dim(lines.join('\n')))
      }
    }

    for (const warning of this.takeWarnings()) {
      log.warn(warning)
    }
  }

  protected onStepDone<T>(step: ReleaseStep<T>, result: T, duration: string): void {
    const dryRunTag = this.options.dryRun ? `  ${DRY_RUN_TAG}` : ''
    const text = `${step.done(result)}  ${dim(duration)}${dryRunTag}`
    this.stopTicker()

    if (step.failed?.(result)) {
      this.spin?.clear()
      log.warn(text)
    }
    else {
      this.spin?.stop(text)
    }
    this.spin = undefined

    const details = step.details?.(result) ?? []
    if (details.length > 0) {
      log.message(details.join('\n'))
    }

    this.printNotes()
    this.printPreviews()

    this.printStepLogs()
  }

  protected onStepFailed(step: { running: string }, duration: string): void {
    this.stopTicker()
    this.spin?.error(`${step.running}  ${dim(duration)}`)
    this.spin = undefined
    this.printNotes()
    this.printPreviews()
    this.printStepLogs()
  }

  protected onStepCancelled(): void {
    this.stopTicker()
    this.spin?.clear()
    this.spin = undefined
    this.logs = []
  }

  skip({ label, reason }: { label: string, reason: string }): void {
    log.message(dim(`${label} skipped (${reason})`), { symbol: dim('○') })
  }

  async prompt<T>(run: () => Promise<T>): Promise<T> {
    const spinning = this.spin !== undefined
    this.stopTicker()
    this.spin?.clear()

    // What the user must know before answering, not after
    for (const warning of this.takeWarnings()) {
      log.warn(warning)
    }
    this.logs = this.logs.filter(({ type }) => type !== 'warn')

    try {
      return await run()
    }
    finally {
      if (spinning) {
        this.startSpinner()
      }
    }
  }

  complete({ message, nothing, failed, details = [], links = [] }: CommandOutcome): void {
    if (details.length > 0) {
      log.message(details.join('\n'))
    }

    if (links.length > 0) {
      log.message(formatLinks(links).map(url => paint('cyan', url)).join('\n'))
    }

    const duration = dim(formatDuration(Date.now() - this.startedAt))

    if (failed) {
      outro(`${paint('yellow', '▲')} ${paint('yellow', message)}  ${duration}`)
    }
    else if (nothing) {
      outro(`${message}  ${duration}`)
    }
    else {
      outro(this.options.dryRun
        ? `${DRY_RUN_BADGE} ${message}, nothing was written  ${duration}`
        : `${paint('green', '✔')} ${message}  ${duration}`)
    }

    this.restore()
  }

  finish(report: ReleaseReport): void {
    const duration = dim(formatDuration(Date.now() - this.startedAt))

    if (report.status === 'nothing') {
      outro(`Nothing to release  ${duration}`)
    }
    else {
      this.printSummary(report)
      outro(report.dryRun
        ? `${DRY_RUN_BADGE} Simulated release of ${bold(describeRelease(report))}, nothing was written  ${duration}`
        : `${paint('green', '✔')} Released ${bold(describeRelease(report))}  ${duration}`)
    }

    this.restore()
  }

  protected onFail(error: unknown, _failedStep?: string, report?: ReleaseReport): void {
    if (!(error instanceof RelizyCancelError)) {
      log.error(this.describeError(error).join('\n'))
    }

    if (report) {
      this.printSummary(report)
    }
    outro(paint('red', error instanceof RelizyCancelError ? error.message : 'Release failed'))
  }
}

class CiUi extends StepUi {
  private readonly provider = getCiProvider()
  private sectionId = ''
  private lastProgress = ''

  progress(message: string, { ai }: ProgressOptions): void {
    // In the group of the step, with the logs
    if (message !== this.lastProgress) {
      this.lastProgress = message
      this.write(`  ${ai ? AI_SYMBOL : dim('›')} ${ai ? paint('magenta', message) : message}`)
    }
  }

  private writeNotes(): void {
    for (const { message, ai } of this.notes) {
      this.write(`  ${ai ? AI_SYMBOL : dim('·')} ${ai ? paint('magenta', message) : dim(message)}`)
    }
  }

  /** Each preview in its own collapsible group, in full */
  private writePreviews(): void {
    for (const preview of this.previews) {
      const lines = [...preview.meta?.length ? [...preview.meta, ''] : [], ...preview.content.trim().split('\n')]
      this.startGroup(`Preview: ${preview.title}`)
      for (const line of lines) {
        this.write(line ? `  ${styleMarkdown(line)}` : '')
      }
      this.endGroup()
    }
  }

  private writeSummary(report: ReleaseReport): void {
    const entries = getReleaseSummary(report)
    const width = Math.max(0, ...entries.map(({ label }) => label.length))
    const icons = { done: paint('green', '✔'), skipped: dim('○'), failed: paint('yellow', '▲') }

    for (const { label, value, status, links } of entries) {
      const text = status === 'skipped' ? dim(value) : status === 'failed' ? paint('yellow', value) : value
      this.write(`  ${status ? icons[status] : ' '} ${dim(label.padEnd(width))}  ${text}`)

      for (const url of formatLinks(links)) {
        this.write(`    ${' '.repeat(width)}  ${paint('cyan', url)}`)
      }
    }
  }

  /** The mark of the end: the dry run badge, else a check */
  private endSymbol(): string {
    return this.options.dryRun ? DRY_RUN_BADGE : paint('green', '✔')
  }

  private write(line: string): void {
    process.stdout.write(`${line}\n`)
  }

  protected onStart(title: string): void {
    const provider = dim(`· ${this.provider === 'other' ? 'ci' : this.provider}`)
    const dryRun = this.options.dryRun ? `  ${DRY_RUN_BADGE} ${dim('nothing will be written')}` : ''
    this.write(`${bold(title)} ${provider}${dryRun}`)
  }

  protected onLog({ type, message }: CapturedLog): void {
    // The logs of the step go in its collapsible group
    if (INFO_TYPES.has(type) || type === 'warn' || ERROR_TYPES.has(type)) {
      for (const line of message.split('\n')) {
        this.write(line ? `  ${line}` : '')
      }
    }
  }

  protected onStepStart(step: { running: string }): void {
    this.lastProgress = ''
    this.startGroup(step.running)
  }

  private startGroup(title: string): void {
    this.sectionId = `relizy_${title.toLowerCase().replaceAll(/\W+/g, '_')}`

    if (this.provider === 'github') {
      this.write(`::group::${title}`)
    }
    else if (this.provider === 'gitlab') {
      this.write(`\u001B[0Ksection_start:${Math.floor(Date.now() / 1000)}:${this.sectionId}[collapsed=true]\r\u001B[0K${title}`)
    }
    else {
      this.write(`▸ ${title}`)
    }
  }

  private endGroup(): void {
    if (this.provider === 'github') {
      this.write('::endgroup::')
    }
    else if (this.provider === 'gitlab') {
      this.write(`\u001B[0Ksection_end:${Math.floor(Date.now() / 1000)}:${this.sectionId}\r\u001B[0K`)
    }
  }

  private writeWarnings(): void {
    for (const warning of this.takeWarnings()) {
      this.write(this.provider === 'github' ? `::warning title=relizy::${warning}` : paint('yellow', `▲ ${warning}`))
    }
  }

  protected onStepDone<T>(step: ReleaseStep<T>, result: T, duration: string): void {
    this.endGroup()
    // After the group, so that it stays visible when the group is collapsed
    const dryRunTag = this.options.dryRun ? `  ${DRY_RUN_TAG}` : ''
    const failed = step.failed?.(result)
    const icon = failed ? paint('yellow', '▲') : paint('green', '✔')
    const text = failed ? paint('yellow', step.done(result)) : step.done(result)
    this.write(`${icon} ${text}  ${dim(duration)}${dryRunTag}`)

    for (const detail of step.details?.(result) ?? []) {
      this.write(`  ${detail}`)
    }

    this.writeNotes()
    this.writePreviews()
    this.writeWarnings()
  }

  protected onStepCancelled(): void {
    this.endGroup()
  }

  protected onStepFailed(step: { running: string }, duration: string): void {
    this.endGroup()
    this.write(`${paint('red', '✖')} ${paint('red', step.running.concat(' failed'))}  ${dim(duration)}`)
    this.writeWarnings()
  }

  skip({ label, reason }: { label: string, reason: string }): void {
    this.write(dim(`○ ${label} skipped (${reason})`))
  }

  prompt<T>(run: () => Promise<T>): Promise<T> {
    return run()
  }

  complete({ message, nothing, failed, details = [], links = [] }: CommandOutcome): void {
    for (const line of details) {
      this.write(`  ${line}`)
    }

    for (const url of formatLinks(links)) {
      this.write(`  ${paint('cyan', url)}`)
    }

    const duration = dim(formatDuration(Date.now() - this.startedAt))
    if (failed) {
      this.write(`${paint('yellow', '▲')} ${paint('yellow', message)}  ${duration}`)
      this.restore()
      return
    }

    const text = `${message}${this.options.dryRun && !nothing ? ', nothing was written' : ''}`
    this.write(nothing ? `${dim('○')} ${text}  ${duration}` : `${this.endSymbol()} ${bold(text)}  ${duration}`)

    if (this.provider === 'github' && !nothing) {
      this.write(`::notice title=relizy::${text}`)
    }

    this.restore()
  }

  finish(report: ReleaseReport): void {
    const duration = dim(formatDuration(Date.now() - this.startedAt))
    const message = report.status === 'nothing'
      ? 'Nothing to release'
      : `${report.dryRun ? 'Simulated release of' : 'Released'} ${describeRelease(report)}${report.dryRun ? ', nothing was written' : ''}`

    this.writeSummary(report)
    this.write(report.status === 'nothing' ? `${dim('○')} ${message}  ${duration}` : `${this.endSymbol()} ${bold(message)}  ${duration}`)

    if (this.provider === 'github' && report.status !== 'nothing') {
      this.write(`::notice title=relizy::${message}`)
    }

    this.restore()
  }

  protected onFail(error: unknown, failedStep?: string, report?: ReleaseReport): void {
    if (report) {
      this.writeSummary(report)
    }

    const lines = this.describeError(error).map(line => stripVTControlCharacters(line))
    const title = `${failedStep ?? 'Release'} failed`

    if (this.provider === 'github') {
      this.write(`::error title=relizy: ${title}::${lines.join('%0A')}`)
    }
    else {
      this.write(paint(['red', 'bold'], `✖ ${title}`))
      for (const line of lines) {
        this.write(`  ${line}`)
      }
    }
  }
}

/**
 * The output of a command, started: `relizy bump`. The output of the parent
 * when the command is run by another one.
 */
export function createCommandUi({ title, dryRun, logLevel, cwd }: { title: string, dryRun: boolean, logLevel?: string, cwd: string }): ReleaseUi {
  if (activeUi) {
    return nestedUi
  }

  const ui = createReleaseUi({ dryRun, logLevel, cwd })
  ui.start(title)
  return ui
}

export function createReleaseUi({ dryRun, logLevel, cwd }: { dryRun: boolean, logLevel?: string, cwd: string }): ReleaseUi {
  const renderer = resolveRenderer()
  const options = { dryRun, verbose: VERBOSE_LEVELS.has(logLevel ?? ''), cwd }

  if (renderer === 'pretty') {
    return new PrettyUi(options)
  }

  return renderer === 'ci' ? new CiUi(options) : createClassicUi()
}

/** The commits of a type, in plain words: singular and plural */
const COMMIT_TYPE_WORDS: Record<string, [string, string]> = {
  breaking: ['breaking change', 'breaking changes'],
  feat: ['feature', 'features'],
  fix: ['fix', 'fixes'],
  perf: ['performance improvement', 'performance improvements'],
  refactor: ['refactor', 'refactors'],
  docs: ['doc change', 'doc changes'],
  build: ['build change', 'build changes'],
  types: ['type change', 'type changes'],
}

/**
 * Why a package is released, in plain words
 */
function describeReason(pkg: PackageBase & { oldVersion?: string }): string {
  const oldVersion = pkg.oldVersion ?? pkg.version
  const preid = semver.prerelease(oldVersion)?.[0]

  if (pkg.reason === 'graduation' || (preid !== undefined && pkg.newVersion && !semver.prerelease(pkg.newVersion))) {
    return `stable release of the ${typeof preid === 'string' ? preid : 'prerelease'}`
  }

  if (pkg.breakingPeerDependency) {
    return `${pkg.breakingPeerDependency} has a breaking change`
  }

  if (pkg.reason === 'dependency') {
    return pkg.outOfRangePeer ? `follows ${pkg.outOfRangePeer} (peer range)` : `follows ${pkg.dependencyChain?.[0] ?? 'a dependency'}`
  }

  const counts = new Map<string, number>()
  for (const commit of pkg.commits ?? []) {
    const type = commit.isBreaking ? 'breaking' : commit.type
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }

  return [...counts].map(([type, count]) => {
    const [one, many] = COMMIT_TYPE_WORDS[type] ?? [`${type} commit`, `${type} commits`]
    return `${count} ${count === 1 ? one : many}`
  }).join(', ') || 'forced'
}

/**
 * The packages of a bump, one per line: name, versions and why
 */
export function describeBumpedPackages(packages: (PackageBase & { oldVersion?: string })[]): string[] {
  const nameWidth = Math.min(32, Math.max(...packages.map(pkg => pkg.name.length)))
  const oldWidth = Math.max(...packages.map(pkg => (pkg.oldVersion ?? pkg.version).length))
  const newWidth = Math.max(...packages.map(pkg => (pkg.newVersion ?? pkg.version).length))

  return packages.map(pkg => [
    bold(pkg.name.padEnd(nameWidth)),
    dim((pkg.oldVersion ?? pkg.version).padStart(oldWidth)),
    dim('→'),
    paint(['green', 'bold'], (pkg.newVersion ?? pkg.version).padEnd(newWidth)),
    dim(describeReason(pkg)),
  ].join('  '))
}

/**
 * What a bump did: its package, or the number of packages
 */
export function describeBumpResult(result: BumpResult): string {
  if (!result.bumped) {
    return 'No commit to release'
  }

  const count = result.bumpedPackages.length
  return count === 1 ? describeBumpedPackages(result.bumpedPackages)[0]! : `${count} packages to release`
}

/**
 * The packages of a bump of several packages, when not listed by the confirmation
 */
export function getBumpResultDetails(result: BumpResult, yes: boolean | undefined): string[] {
  return result.bumped && result.bumpedPackages.length > 1 && yes ? describeBumpedPackages(result.bumpedPackages) : []
}

/**
 * Ask to confirm the bump within the step output: the packages, then the
 * prompt. Undefined when the new output is not running.
 */
export function confirmBumpInReleaseUi({ packages }: { packages: (PackageBase & { oldVersion?: string })[] }): Promise<boolean | undefined> {
  const ui = activeUi

  if (!(ui instanceof PrettyUi)) {
    return Promise.resolve(undefined)
  }

  return ui.prompt(async () => {
    // `relizy release` releases, `relizy bump` bumps
    const action = ui.command === 'bump' ? 'Bump' : 'Release'
    const count = packages.length === 1 ? '' : ` · ${packages.length} packages`
    const title = `${action} plan${count}${ui.isDryRun ? ' · DRY RUN' : ''}`
    spacedBox(describeBumpedPackages(packages).join('\n'), ` ${title} `, 2)

    const versions = packages.length === 1 ? 'this version' : `these ${packages.length} versions`
    const dryRunNote = ui.isDryRun ? `  ${DRY_RUN_BADGE} ${dim('nothing will be written')}` : ''
    const answer = await promptConfirm({ message: `${action} ${versions}?${dryRunNote}`, active: action, inactive: 'Cancel' })

    // Refused or cancelled: nothing is written
    if (isCancel(answer) || !answer) {
      throw new RelizyCancelError(`${action} cancelled`)
    }

    return true
  })
}
