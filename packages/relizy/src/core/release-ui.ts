import type { SpinnerResult } from '@clack/prompts'
import type { BumpResult, PackageBase } from '../types'
import type { RelizyEventInput, StepData } from './events'
import type { Preview, ProgressOptions } from './progress'
import type { ReleaseReport, ReleaseSummaryEntry } from './release-report'
import type { CommandStepId } from './steps'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import { format, stripVTControlCharacters, styleText } from 'node:util'
import { intro, isCancel, log, note, outro, confirm as promptConfirm, spinner } from '@clack/prompts'
import { logger } from '@maz-ui/node'
import { formatDuration, isInCI } from '@relizy/core'
import * as semver from 'semver'
import { setBumpConfirmation } from './bump-prompt'
import { isRelizyCancelError, markErrorReported, RelizyCancelError } from './errors'
import { addGlobalEventListener, emitEvent, getEventContext } from './events'
import { reportProgress, setProgressHandlers } from './progress'
import { assertInteractivePrompt, BUMP_NOT_INTERACTIVE } from './prompts'
import { formatReleaseReportText, getReleaseName, getReleaseSummary } from './release-report'

/**
 * The output of the commands of the CLI: one line per step with its duration,
 * the details of a step only with `--log-level verbose`, a full log file
 * (`node_modules/.cache/relizy/release.log`).
 *
 * - `pretty`: an interactive terminal, with @clack/prompts
 * - `ci`: lines only (no cursor move), the logs of each step in a
 *   collapsible group of GitHub Actions or GitLab CI, the result after it
 * - `classic`: the logs of the logger, for the programmatic API
 * - `json`: one JSON event per line on stdout (`RELIZY_REPORTER=json`), see `events.ts`
 *
 * A command run by another one (`bump` in `release`) shows its steps as the
 * progress of the running step.
 */

type Renderer = 'pretty' | 'ci' | 'classic' | 'json'
type CiProvider = 'github' | 'gitlab' | 'other'

interface CapturedLog {
  type: string
  message: string
}

interface Reporter { log: (logObj: { type: string, args: unknown[] }) => void }

const VERBOSE_LEVELS = new Set(['verbose', 'debug', 'trace'])
const INFO_TYPES = new Set([
  'info',
  'start',
  'log',
  'success',
  'ready',
  'box',
])
const ERROR_TYPES = new Set(['error', 'fail', 'fatal'])

/**
 * Color a text: in CI too (GitHub and GitLab show the colors of the logs,
 * which are not a terminal), unless `NO_COLOR`
 */
function paint(format: Parameters<typeof styleText>[0], text: string): string {
  if (!isInCI()) {
    return styleText(format, text)
  }

  return process.env.NO_COLOR
    ? text
    : styleText(format, text, { validateStream: false })
}

const dim = (text: string) => paint('dim', text)

/**
 * The icon and the styled text of an entry of the summary of a release
 */
function formatSummaryEntry({ value, status }: ReleaseSummaryEntry): { icon: string, text: string } {
  const icons = {
    done: paint('green', '✔'),
    skipped: dim('○'),
    failed: paint('yellow', '▲'),
  }

  return {
    icon: status ? icons[status] : ' ',
    text: status === 'skipped'
      ? dim(value)
      : status === 'failed'
        ? paint('yellow', value)
        : value,
  }
}
const bold = (text: string) => paint('bold', text)
/**
 * The badge of a dry run. In CI, the 16 base colors follow the theme of the
 * logs (the yellow background of GitHub turns dark brown in its light theme):
 * the colors of the 256 palette are shown as they are, gold background and
 * black text in both themes
 */
function dryRunBadge(): string {
  if (!isInCI()) {
    return paint(['bgYellow', 'black', 'bold'], ' DRY RUN ')
  }

  return process.env.NO_COLOR ? ' DRY RUN ' : '\u001B[48;5;220m\u001B[38;5;16m\u001B[1m DRY RUN \u001B[22m\u001B[39m\u001B[49m'
}
const DRY_RUN_TAG = paint('yellow', 'dry run')
const AI_SYMBOL = '✨'

/** Links of a summary entry, shown below it */
const SUMMARY_MAX_LINKS = 3

function formatLinks(links: { url: string }[] = []): string[] {
  const urls = links.slice(0, SUMMARY_MAX_LINKS).map(({ url }) => url)
  return links.length > SUMMARY_MAX_LINKS
    ? [...urls, `and ${links.length - SUMMARY_MAX_LINKS} more`]
    : urls
}

/**
 * The command run, without what only makes sense in dry-run
 */
function getRealCommand(): string {
  const args = process.argv.slice(2).filter(arg => !['--dry-run', '--ai-preview', '--no-preview'].includes(arg))
  return `relizy ${args.join(' ')}`
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
    return paint(distance <= 1
      ? ['whiteBright', 'bold']
      : distance <= 3
        ? 'magentaBright'
        : 'magenta', char)
  }).join('')
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

  if (process.env.RELIZY_REPORTER === 'json') {
    redirectLogsToStderr()
  }
}

/** Stdout only carries the JSON events: the logs before the output starts go to stderr */
function redirectLogsToStderr(): void {
  const instance = (logger.removeReporter as unknown as (reporter: unknown) => { options: { reporters: Reporter[] } })({})
  instance.options.reporters.splice(0, instance.options.reporters.length, {
    log: ({ args }) => {
      process.stderr.write(`${stripVTControlCharacters(format(...args))}\n`)
    },
  })
  Object.assign(console, { log: console.error, info: console.error, debug: console.error })
}

/**
 * `RELIZY_REPORTER` (`pretty`, `ci`, `classic`, `json`) when set, else `classic` out
 * of the CLI, else `ci` in CI (checked first: some runners fake a terminal),
 * else `pretty` in a terminal
 */
function resolveRenderer(): Renderer {
  const forced = process.env.RELIZY_REPORTER

  if (forced === 'pretty' || forced === 'ci' || forced === 'classic' || forced === 'json') {
    return forced
  }

  if (!cliUi) {
    return 'classic'
  }

  return isInCI() || !process.stdout.isTTY
    ? 'ci'
    : 'pretty'
}

export function isFancyUi(): boolean {
  return resolveRenderer() !== 'classic'
}

export interface ReleaseStep<T> {
  /**
   * The step as the events and the hooks name it: `bump`, `publish`, `commit-and-tag`...
   */
  name?: CommandStepId
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
  /**
   * What the step did as data, the `data` of its `step:done` (or `step:failed`) event
   */
  data?: (result: T) => StepData
  /**
   * What the step did before failing, the `data` of its `step:failed` event
   */
  failedData?: (error: unknown) => StepData | undefined
  run: () => Promise<T>
}

/**
 * A box of the end of a command: a title and its lines (`note()` of clack)
 */
export interface CommandNote {
  title: string
  lines: string[]
  /** Lines shown dimmed, after the others */
  footer?: string[]
  /** The title in red: what fails */
  failed?: boolean
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
   * Boxes shown before the end, before the details
   */
  notes?: CommandNote[]
  /**
   * Shown before the end, after the notes
   */
  warnings?: string[]
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
  skip: (step: { name?: CommandStepId, title: string, label: string, reason: string }) => void
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
  setBumpConfirmation(ui
    ? packages => confirmBumpInReleaseUi({ packages })
    : undefined)
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
        emitEvent({ type: 'log', level: logObj.type, message })
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
    return [
      ...new Set(warnings),
    ]
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
    this.writeLogFile([
      `[preview] ${preview.title}`,
      ...preview.meta ?? [],
      preview.content,
    ].join('\n'))
  }

  /** The lines of a preview: its facts, then its content, cut unless verbose */
  protected getPreviewLines(preview: Preview): { lines: string[], hidden: number } {
    const content = preview.content.trim().split('\n')
    const shown = this.options.verbose
      ? content
      : content.slice(0, PREVIEW_MAX_LINES)
    const meta = preview.meta?.length
      ? [...preview.meta, '']
      : []

    return {
      lines: [
        ...meta,
        ...shown,
      ],
      hidden: content.length - shown.length,
    }
  }

  /** The error, once: what went wrong, how to go on, where the full log is */
  protected describeError(error: unknown): string[] {
    const message = error instanceof Error
      ? error.message
      : String(error)

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
    this.spin?.message(elapsed < 2000
      ? text
      : `${text}  ${seconds}`)
  }

  progress(message: string, options: ProgressOptions): void {
    this.current = { message, ...options }
    this.render()
  }

  private printNotes(): void {
    for (const { message, ai } of this.notes) {
      log.message(ai
        ? paint('magenta', message)
        : dim(message), {
        symbol: ai
          ? AI_SYMBOL
          : dim('·'),
      })
    }
  }

  private printPreviews(): void {
    for (const preview of this.previews) {
      const { lines, hidden } = this.getPreviewLines(preview)
      const metaCount = preview.meta?.length
        ? preview.meta.length + 1
        : 0
      const styled = lines.map((line, index) => index < metaCount
        ? dim(line)
        : styleMarkdown(line))

      if (hidden > 0) {
        styled.push('', dim(`… ${hidden} more lines (--log-level verbose, or ${this.logFilePath})`))
      }

      note(styled.join('\n'), `${paint('yellow', 'Preview')} ${bold(preview.title)}`)
    }
  }

  /** The summary of the release, always at the end */
  private printSummary(report: ReleaseReport): void {
    const entries = getReleaseSummary(report)

    if (entries.length === 0) {
      return
    }

    if (report.dryRun) {
      entries.push({
        label: 'For real',
        value: getRealCommand(),
      })
    }

    const width = Math.max(...entries.map(({ label }) => label.length))
    const columns = process.stdout.columns || 80
    const lines = entries.flatMap((entry) => {
      const { label, links } = entry
      const { icon, text } = formatSummaryEntry(entry)
      // Under the value when it fits, else under the label
      const urls = formatLinks(links).map(url => `${' '.repeat(width + url.length + 14 <= columns
        ? width + 4
        : 2)}${paint('cyan', url)}`)
      return [`${icon} ${dim(label.padEnd(width))}  ${text}`, ...urls]
    })
    const title = report.dryRun
      ? `Summary  ${dryRunBadge()}`
      : 'Summary'

    note(lines.join('\n'), bold(title))
  }

  protected onStart(title: string): void {
    // Apart from the command typed, or the line of the package manager running the script
    process.stdout.write('\n')
    intro(this.options.dryRun
      ? `${bold(title)}  ${dryRunBadge()} ${dim('nothing will be written')}`
      : bold(title))
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
    const dryRunTag = this.options.dryRun
      ? `  ${DRY_RUN_TAG}`
      : ''
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
    log.message(dim(`${label} skipped (${reason})`), {
      symbol: dim('○'),
    })
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

  complete({ message, nothing, failed, notes = [], warnings = [], details = [], links = [] }: CommandOutcome): void {
    for (const { title, lines, footer = [], failed: noteFailed } of notes) {
      const footerLines = footer.length > 0
        ? [
            '',
            ...footer.map(line => dim(line)),
          ]
        : []
      note([
        ...lines,
        ...footerLines,
      ].join('\n'), noteFailed
        ? paint(['red', 'bold'], title)
        : bold(title))
    }

    for (const warning of warnings) {
      log.warn(warning)
    }

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
        ? `${dryRunBadge()} ${message}, nothing was written  ${duration}`
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
        ? `${dryRunBadge()} Simulated release of ${bold(getReleaseName(report))}, nothing was written  ${duration}`
        : `${paint('green', '✔')} Released ${bold(getReleaseName(report))}  ${duration}`)
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
    outro(paint('red', error instanceof RelizyCancelError
      ? error.message
      : 'Release failed'))
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
      this.write(`  ${ai
        ? AI_SYMBOL
        : dim('›')} ${ai
        ? paint('magenta', message)
        : message}`)
    }
  }

  private writeNotes(): void {
    for (const { message, ai } of this.notes) {
      this.write(`  ${ai
        ? AI_SYMBOL
        : dim('·')} ${ai
        ? paint('magenta', message)
        : dim(message)}`)
    }
  }

  /** Each preview in its own collapsible group, in full */
  private writePreviews(): void {
    for (const preview of this.previews) {
      const lines = [
        ...preview.meta?.length
          ? [...preview.meta, '']
          : [],
        ...preview.content.trim().split('\n'),
      ]
      this.startGroup(`Preview: ${preview.title}`)
      for (const line of lines) {
        this.write(line
          ? `  ${styleMarkdown(line)}`
          : '')
      }
      this.endGroup()
    }
  }

  private writeSummary(report: ReleaseReport): void {
    const entries = getReleaseSummary(report)
    const width = Math.max(0, ...entries.map(({ label }) => label.length))
    for (const entry of entries) {
      const { label, links } = entry
      const { icon, text } = formatSummaryEntry(entry)
      this.write(`  ${icon} ${dim(label.padEnd(width))}  ${text}`)

      for (const url of formatLinks(links)) {
        this.write(`    ${' '.repeat(width)}  ${paint('cyan', url)}`)
      }
    }
  }

  /** The mark of the end: the dry run badge, else a check */
  private endSymbol(): string {
    return this.options.dryRun
      ? dryRunBadge()
      : paint('green', '✔')
  }

  private write(line: string): void {
    process.stdout.write(`${line}\n`)
  }

  protected onStart(title: string): void {
    const provider = dim(`· ${this.provider === 'other'
      ? 'ci'
      : this.provider}`)
    const dryRun = this.options.dryRun
      ? `  ${dryRunBadge()} ${dim('nothing will be written')}`
      : ''
    this.write(`${bold(title)} ${provider}${dryRun}`)
  }

  protected onLog({ type, message }: CapturedLog): void {
    // The logs of the step go in its collapsible group
    if (INFO_TYPES.has(type) || type === 'warn' || ERROR_TYPES.has(type)) {
      for (const line of message.split('\n')) {
        this.write(line
          ? `  ${line}`
          : '')
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
      this.write(this.provider === 'github'
        ? `::warning title=relizy::${warning}`
        : paint('yellow', `▲ ${warning}`))
    }
  }

  protected onStepDone<T>(step: ReleaseStep<T>, result: T, duration: string): void {
    this.endGroup()
    // After the group, so that it stays visible when the group is collapsed
    const dryRunTag = this.options.dryRun
      ? `  ${DRY_RUN_TAG}`
      : ''
    const failed = step.failed?.(result)
    const icon = failed
      ? paint('yellow', '▲')
      : paint('green', '✔')
    const text = failed
      ? paint('yellow', step.done(result))
      : step.done(result)
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

  complete({ message, nothing, failed, notes = [], warnings = [], details = [], links = [] }: CommandOutcome): void {
    for (const { title, lines, footer = [], failed: noteFailed } of notes) {
      this.write(noteFailed
        ? paint(['red', 'bold'], title)
        : bold(title))
      for (const line of lines) {
        this.write(`  ${line}`)
      }
      for (const line of footer) {
        this.write(`  ${dim(line)}`)
      }
    }

    for (const warning of warnings) {
      this.write(this.provider === 'github'
        ? `::warning title=relizy::${warning}`
        : paint('yellow', `▲ ${warning}`))
    }

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

    const text = `${message}${this.options.dryRun && !nothing
      ? ', nothing was written'
      : ''}`
    this.write(nothing
      ? `${dim('○')} ${text}  ${duration}`
      : `${this.endSymbol()} ${bold(text)}  ${duration}`)

    if (this.provider === 'github' && !nothing) {
      this.write(`::notice title=relizy::${text}`)
    }

    this.restore()
  }

  finish(report: ReleaseReport): void {
    const duration = dim(formatDuration(Date.now() - this.startedAt))
    const message = report.status === 'nothing'
      ? 'Nothing to release'
      : `${report.dryRun ? 'Simulated release of' : 'Released'} ${getReleaseName(report)}${report.dryRun ? ', nothing was written' : ''}`

    this.writeSummary(report)
    this.write(report.status === 'nothing'
      ? `${dim('○')} ${message}  ${duration}`
      : `${this.endSymbol()} ${bold(message)}  ${duration}`)

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
 * The output of `RELIZY_REPORTER=json`: nothing is shown, stdout carries the
 * events of the command (`events.ts`), one JSON object per line. The logs are
 * the `log` events, a prompt cannot be answered (run with `--yes`).
 */
class JsonUi extends StepUi {
  private stopWriting: (() => void) | undefined

  protected override restore(): void {
    this.stopWriting?.()
    this.stopWriting = undefined
    super.restore()
  }

  progress(): void {}
  skip(): void {}

  finish(): void {
    this.restore()
  }

  complete(): void {
    this.restore()
  }

  prompt<T>(run: () => Promise<T>): Promise<T> {
    return run()
  }

  protected onStart(): void {
    this.stopWriting = addGlobalEventListener((event) => {
      try {
        process.stdout.write(`${JSON.stringify(event)}\n`)
      }
      catch {}
    })
  }

  protected onLog(): void {}
  protected onStepStart(): void {}
  protected onStepDone(): void {}
  protected onStepFailed(): void {}
  protected onStepCancelled(): void {}
  protected onFail(): void {}
}

/**
 * The output of a command, started: `relizy bump`. The output of the parent
 * when the command is run by another one.
 */
export function createCommandUi({ title, dryRun, logLevel, cwd }: { title: string, dryRun: boolean, logLevel?: string, cwd: string }): ReleaseUi {
  if (activeUi || getEventContext()?.nested) {
    return nestedUi
  }

  const ui = withEvents(createReleaseUi({ dryRun, logLevel, cwd }), dryRun)
  ui.start(title)
  return ui
}

/** The `data` of a step event, when the step gives some */
function withData(data: StepData | undefined): { data?: StepData } {
  return data
    ? { data }
    : {}
}

/**
 * The events of a command (`events.ts`) from what its output shows: its start, each step, its end.
 * The end is emitted before the output closes, the JSON output stops writing then.
 */
function withEvents(ui: ReleaseUi, dryRun: boolean): ReleaseUi {
  let commandStartedAt = Date.now()
  const prompt = (ui as { prompt?: (run: () => Promise<unknown>) => Promise<unknown> }).prompt?.bind(ui)

  return {
    ...prompt
      ? { prompt }
      : {},
    start: (title) => {
      commandStartedAt = Date.now()
      ui.start(title)
      emitEvent({
        type: 'command:start',
        command: title.split(' ')[1] ?? '',
        title,
        dryRun,
      })
    },
    step: async (step) => {
      const startedAt = Date.now()
      emitEvent({ type: 'step:start', step: step.name, label: step.running })

      try {
        const result = await ui.step(step)
        const durationMs = Date.now() - startedAt
        const data = withData(step.data?.(result))

        emitEvent((step.failed?.(result)
          ? {
              type: 'step:failed',
              step: step.name,
              label: step.running,
              fatal: false,
              durationMs,
              message: step.done(result),
              cancelled: false,
              ...data,
            }
          : {
              type: 'step:done',
              step: step.name,
              label: step.running,
              message: step.done(result),
              durationMs,
              details: step.details?.(result) ?? [],
              ...data,
            }) as RelizyEventInput)

        return result
      }
      catch (error) {
        emitEvent({
          type: 'step:failed',
          step: step.name,
          label: step.running,
          fatal: true,
          durationMs: Date.now() - startedAt,
          message: error instanceof Error
            ? error.message
            : String(error),
          cancelled: error instanceof RelizyCancelError,
          ...withData(step.failedData?.(error)),
        } as RelizyEventInput)
        throw error
      }
    },
    skip: (step) => {
      emitEvent({
        type: 'step:skipped',
        step: step.name,
        label: step.label,
        reason: step.reason,
      })
      ui.skip(step)
    },
    finish: (report) => {
      emitEvent({ type: 'release:finish', report })
      ui.finish(report)
    },
    complete: (outcome) => {
      emitEvent({
        type: 'command:complete',
        message: outcome.message,
        nothing: outcome.nothing ?? false,
        failed: outcome.failed ?? false,
        warnings: outcome.warnings ?? [],
        links: outcome.links ?? [],
        durationMs: Date.now() - commandStartedAt,
      })
      ui.complete(outcome)
    },
    fail: (error, failedStep, report) => {
      emitEvent({
        type: 'command:error',
        message: error instanceof Error
          ? error.message
          : String(error),
        failedStep,
        cancelled: isRelizyCancelError(error),
        ...report
          ? { report }
          : {},
      })
      ui.fail(error, failedStep, report)
    },
  }
}

function createReleaseUi({ dryRun, logLevel, cwd }: { dryRun: boolean, logLevel?: string, cwd: string }): ReleaseUi {
  const renderer = resolveRenderer()
  const options = {
    dryRun,
    verbose: VERBOSE_LEVELS.has(logLevel ?? ''),
    cwd,
  }

  if (renderer === 'pretty') {
    return new PrettyUi(options)
  }

  if (renderer === 'json') {
    return new JsonUi(options)
  }

  return renderer === 'ci'
    ? new CiUi(options)
    : createClassicUi()
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
    return `stable release of the ${typeof preid === 'string'
      ? preid
      : 'prerelease'}`
  }

  if (pkg.breakingPeerDependency) {
    return `${pkg.breakingPeerDependency} has a breaking change`
  }

  if (pkg.reason === 'dependency') {
    const outOfRange = pkg.outOfRangeDependency

    return outOfRange
      ? `follows ${outOfRange.name} (${outOfRange.field === 'peerDependencies'
        ? 'peer range'
        : 'range'})`
      : `follows ${pkg.dependencyChain?.[0] ?? 'a dependency'}`
  }

  return describeCommitCounts(pkg.commits ?? []) || 'forced'
}

/**
 * The commits of a package in plain words, by type: `1 feature, 2 fixes`
 */
export function describeCommitCounts(commits: { type: string, isBreaking: boolean }[]): string {
  const counts = new Map<string, number>()
  for (const commit of commits) {
    const type = commit.isBreaking ? 'breaking' : commit.type
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }

  return [...counts].map(([type, count]) => {
    const [one, many] = COMMIT_TYPE_WORDS[type] ?? [`${type} commit`, `${type} commits`]
    return `${count} ${count === 1
      ? one
      : many}`
  }).join(', ')
}

/** A package of a release, as shown in the terminal */
export interface PackageRow {
  name: string
  oldVersion: string
  newVersion: string
  /** Why it is released, in plain words */
  reason: string
}

/**
 * Packages of a release, one per line with aligned columns: name, versions and why
 */
export function formatPackageRows(rows: PackageRow[]): string[] {
  const nameWidth = Math.min(32, Math.max(...rows.map(row => row.name.length)))
  const oldWidth = Math.max(...rows.map(row => row.oldVersion.length))
  const newWidth = Math.max(...rows.map(row => row.newVersion.length))

  return rows.map(row => [
    bold(row.name.padEnd(nameWidth)),
    dim(row.oldVersion.padStart(oldWidth)),
    dim('→'),
    paint(['green', 'bold'], row.newVersion.padEnd(newWidth)),
    dim(row.reason),
  ].join('  '))
}

/**
 * The packages of a bump, one per line: name, versions and why
 */
export function describeBumpedPackages(packages: (PackageBase & { oldVersion?: string })[]): string[] {
  return formatPackageRows(packages.map(pkg => ({
    name: pkg.name,
    oldVersion: pkg.oldVersion ?? pkg.version,
    newVersion: pkg.newVersion ?? pkg.version,
    reason: describeReason(pkg),
  })))
}

/**
 * What a bump did: its package, or the number of packages
 */
export function describeBumpResult(result: BumpResult): string {
  if (!result.bumped) {
    return 'No commit to release'
  }

  const count = result.bumpedPackages.length
  return count === 1
    ? describeBumpedPackages(result.bumpedPackages)[0]!
    : `${count} packages to release`
}

/**
 * The packages of a bump of several packages, when not listed by the confirmation
 */
export function getBumpResultDetails(result: BumpResult, yes: boolean | undefined): string[] {
  return result.bumped && result.bumpedPackages.length > 1 && yes
    ? describeBumpedPackages(result.bumpedPackages)
    : []
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
    const action = ui.command === 'bump'
      ? 'Bump'
      : 'Release'
    const count = packages.length === 1
      ? ''
      : ` · ${packages.length} packages`
    const title = `${action} plan${count}${ui.isDryRun ? ' · DRY RUN' : ''}`
    note(describeBumpedPackages(packages).join('\n'), title)

    const versions = packages.length === 1
      ? 'this version'
      : `these ${packages.length} versions`
    assertInteractivePrompt({ message: `${action} ${versions}?`, whenNotInteractive: BUMP_NOT_INTERACTIVE })
    const dryRunNote = ui.isDryRun
      ? `  ${dryRunBadge()} ${dim('nothing will be written')}`
      : ''
    const answer = await promptConfirm({ message: `${action} ${versions}?${dryRunNote}`, active: action, inactive: 'Cancel' })

    // Refused or cancelled: nothing is written
    if (isCancel(answer) || !answer) {
      throw new RelizyCancelError(`${action} cancelled`)
    }

    return true
  })
}
