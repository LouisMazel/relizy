import type { ConfirmPlan, GitProvider, OtpRequest } from '../types'
import type { ReleaseReport } from './release-report'
import type { CommandStepId } from './steps'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * The progress of a command as typed events, for a program that follows a run
 * without parsing the text of the CLI: the `onProgress` option of the commands
 * of the API, and `RELIZY_REPORTER=json` for the CLI (one JSON event per line on
 * stdout). Every event has `time`, its date in milliseconds since the epoch.
 */

/** What a step of a command does, as the hooks name them: `bump`, `changelog`, `publish`, `commit-and-tag`, `push`, `provider-release`, `social`, `pr-comment` */
export type ProgressStep = CommandStepId

export interface ProgressEventBase {
  /** Date of the event, milliseconds since the epoch */
  time: number
}

/** A command starts: `release`, `bump`... */
export interface CommandStartEvent extends ProgressEventBase {
  type: 'command:start'
  command: string
  /** The title shown by the CLI: `relizy release --profile beta` */
  title: string
  dryRun: boolean
}

/** A step starts */
export interface StepStartEvent extends ProgressEventBase {
  type: 'step:start'
  /** Name of the step, none for a step that has no equivalent hook */
  step?: ProgressStep
  /** What it does: `Publishing the packages` */
  label: string
}

/** A safety check of the release: a token, the registry, the branch... */
export interface StepCheck {
  /** `provider-release` (its token), `publish` (the registry), `social` (the credentials), `branch` (up to date with its remote), `push` (the access to the remote) */
  name: string
  status: 'passed' | 'failed' | 'skipped'
  /** Why it failed or is skipped */
  message?: string
}

/** What the safety checks checked */
export interface ChecksStepData {
  checks: StepCheck[]
}

/** What the bump bumps, every version group together */
export interface BumpStepData {
  packages: Array<{
    name: string
    oldVersion: string
    newVersion: string
    /** Its version group, with `monorepo.groups` */
    group?: string
  }>
}

/** The changelog entries written (previewed in dry-run) */
export interface ChangelogStepData {
  files: Array<{
    /** The file, relative to the project: `packages/core/CHANGELOG.md` */
    file: string
    packageName: string
    /** The entry added at the top of the file, in markdown */
    content: string
  }>
}

/** A package of the publish */
export interface PublishStepPackage {
  name: string
  version: string
  /** `skipped`: the version is already on the registry (`publish.skipExistingVersions`) */
  status: 'published' | 'skipped' | 'failed'
  /** Its page on npmjs.com, once published */
  url?: string
  /** Why it is skipped or failed */
  reason?: string
}

/** What the publish published, in publish order */
export interface PublishStepData {
  /** The registry of the packages without their own (`publish.registry`, else the one of the npmrc) */
  registry: string
  /** The dist-tag: `latest`, `next`, `canary`... */
  tag: string
  packages: PublishStepPackage[]
}

/** The release commit and its tags */
export interface CommitAndTagStepData {
  /** The release commit: its hash, none in dry-run */
  commit?: { hash?: string, message: string }
  tags: string[]
}

/** Where the release commit was pushed */
export interface PushStepData {
  /** The remote of the branch, `origin` without upstream */
  remote: string
  branch: string
  /** The tags of the release were pushed with it */
  tags: boolean
}

/** The releases created on GitHub or GitLab */
export interface ProviderReleaseStepData {
  provider: GitProvider
  releases: Array<{
    tag: string
    name?: string
    /** Its page, when the repository is known */
    url?: string
  }>
}

/** A post of the release on a platform */
export interface SocialStepPost {
  /** `twitter`, `slack`, `teams` */
  platform: string
  status: 'posted' | 'skipped' | 'failed'
  /** The post, when the platform gives it (Twitter) */
  url?: string
  /** Why it is skipped (`prerelease`) or failed */
  reason?: string
}

/** The posts of the release */
export interface SocialStepData {
  posts: SocialStepPost[]
}

/** The comment of the pull request */
export interface PrCommentStepData {
  posted: boolean
  /** The pull request commented, when detected */
  number?: number
  url?: string
}

/** The data of each step, by name of the step */
export interface StepDataMap {
  'checks': ChecksStepData
  'bump': BumpStepData
  'changelog': ChangelogStepData
  'publish': PublishStepData
  'commit-and-tag': CommitAndTagStepData
  'push': PushStepData
  'provider-release': ProviderReleaseStepData
  'social': SocialStepData
  'pr-comment': PrCommentStepData
}

/** The data of a step, whatever the step */
export type StepData = StepDataMap[keyof StepDataMap]

/**
 * An event of a step with the data of the step: `data` is typed by `step`
 * (`if (event.step === 'publish') event.data?.packages`)
 */
export type WithStepData<Event> = {
  [Step in keyof StepDataMap]: Event & {
    step: Step
    /** What the step did, as data: see `StepDataMap` */
    data?: StepDataMap[Step]
  }
}[keyof StepDataMap] | (Event & {
  /** A step without data: `merge-preview`, or a step that has no equivalent hook */
  step?: Exclude<ProgressStep, keyof StepDataMap>
  data?: undefined
})

interface StepDoneEventBase extends ProgressEventBase {
  type: 'step:done'
  label: string
  /** What it did: `Published relizy@2.0.0 to npm` */
  message: string
  durationMs: number
  /** Lines under the result, e.g. the packages of the bump. What the step noted comes before, as `note` events */
  details: string[]
}

/** A step is done, with what it did as data (`data`, typed by `step`) */
export type StepDoneEvent = WithStepData<StepDoneEventBase>

interface StepFailedEventBase extends ProgressEventBase {
  type: 'step:failed'
  label: string
  /** The step did not stop the command (a provider release, a post) */
  fatal: boolean
  durationMs: number
  /** What it did or why it failed */
  message: string
  /** The prompt was refused or cancelled: nothing failed */
  cancelled: boolean
}

/**
 * A step fails: `fatal` when it stops the command, not when the release goes on (a post that failed).
 * `data` tells what it did before failing, when it knows (the packages published before the one that failed)
 */
export type StepFailedEvent = WithStepData<StepFailedEventBase>

/** One thing of a running step, live: a package of the publish, a platform of the posts */
export interface StepItem {
  /** `relizy@2.0.0`, `slack` */
  name: string
  status: 'running' | 'done' | 'failed' | 'skipped'
  /** Why it failed or is skipped */
  detail?: string
  /** What it created */
  url?: string
}

/** A step starts or ends one of its things: `running`, then `done`, `failed` or `skipped` */
export interface StepItemEvent extends ProgressEventBase {
  type: 'step:item'
  step: ProgressStep
  item: StepItem
}

/** A step is left out: `--no-publish`, `release.social: false` */
export interface StepSkippedEvent extends ProgressEventBase {
  type: 'step:skipped'
  step?: ProgressStep
  label: string
  /** Why: `--no-publish` */
  reason: string
}

/** What the running step does now, replaced by the next one */
export interface ProgressMessageEvent extends ProgressEventBase {
  type: 'progress'
  message: string
  /** Done by AI */
  ai: boolean
}

/** What a step did, shown under its result */
export interface NoteEvent extends ProgressEventBase {
  type: 'note'
  message: string
  ai: boolean
}

/** What a step created: a GitHub release, an npm page, a tweet, the PR comment */
export interface LinkEvent extends ProgressEventBase {
  type: 'link'
  /** The step that created it, named as `ProgressStep` */
  step: 'publish' | 'provider-release' | 'social' | 'pr-comment'
  label: string
  url: string
}

/** What a dry run generated (a changelog, the release notes, a post) */
export interface PreviewEvent extends ProgressEventBase {
  type: 'preview'
  title: string
  meta: string[]
  content: string
}

/** A log of relizy, the debug ones left out. With the CLI renderers only: the API leaves the logs to the logger */
export interface LogEvent extends ProgressEventBase {
  type: 'log'
  level: string
  message: string
}

/** `relizy release` is over: its report */
export interface ReleaseFinishEvent extends ProgressEventBase {
  type: 'release:finish'
  report: ReleaseReport
}

/** A command other than `release` is over */
export interface CommandCompleteEvent extends ProgressEventBase {
  type: 'command:complete'
  message: string
  /** Nothing was done (no commit to release) */
  nothing: boolean
  /** Nothing was done because it failed */
  failed: boolean
  warnings: string[]
  links: { label: string, url: string }[]
  durationMs: number
}

/** The command fails or is cancelled */
export interface CommandErrorEvent extends ProgressEventBase {
  type: 'command:error'
  message: string
  /** The step that was running */
  failedStep?: string
  /** The prompt was refused or cancelled: nothing was written */
  cancelled: boolean
  /** The report of a release that failed */
  report?: ReleaseReport
}

export type RelizyEvent
  = | CommandStartEvent
    | StepStartEvent
    | StepDoneEvent
    | StepFailedEvent
    | StepSkippedEvent
    | StepItemEvent
    | ProgressMessageEvent
    | NoteEvent
    | LinkEvent
    | PreviewEvent
    | LogEvent
    | ReleaseFinishEvent
    | CommandCompleteEvent
    | CommandErrorEvent

/** The type of an event without its `time`, which `emitEvent` sets */
export type RelizyEventInput = RelizyEvent extends infer Event
  ? Event extends RelizyEvent
    ? Omit<Event, 'time'>
    : never
  : never

/**
 * A listener of the events, sync or async (`void | Promise<void>`): an async one is not
 * awaited, and its rejection is ignored as a throw (never an unhandled rejection)
 */
export type RelizyEventListener = ((event: RelizyEvent) => void) | ((event: RelizyEvent) => Promise<void>)

/**
 * What an application answers instead of the prompts of the terminal (the
 * `onConfirm` and `onOtp` options of the commands), and the command run first
 */
export interface AppHandlers {
  onConfirm?: (plan: ConfirmPlan) => boolean | Promise<boolean>
  onOtp?: (request: OtpRequest) => string | Promise<string>
  /** The command the application ran: `release` for the bump run by a release */
  command?: 'release' | 'bump'
}

interface EventContext {
  listeners: RelizyEventListener[]
  /** A command run by another one: its steps are the progress of the step of the parent */
  nested: boolean
  handlers: AppHandlers
  /** What the run records while it runs (see `getRunState`), shared with the commands it runs */
  state: Map<symbol, unknown>
}

const storage = new AsyncLocalStorage<EventContext>()
const globalListeners = new Set<RelizyEventListener>()
/** The state of what runs out of a command (a step function called directly) */
const processState = new Map<symbol, unknown>()

/**
 * The listeners of the running command. A command run inside another one
 * (`bump` in `release`) shares the listeners of its parent and is `nested`.
 */
export function getEventContext(): EventContext | undefined {
  return storage.getStore()
}

/**
 * Run a command with its `onProgress` listener: the events of the command and
 * of the commands it runs go to it. A listener that throws never stops the command.
 * The `handlers` of the application go to the commands it runs too, over the ones
 * of a parent command; the command of the first run stays.
 */
export function runWithEvents<T>(listener: RelizyEventListener | undefined, run: () => T, handlers: AppHandlers = {}): T {
  const parent = storage.getStore()
  const listeners = [
    ...parent?.listeners ?? [],
    ...listener
      ? [listener]
      : [],
  ]
  const inherited = parent?.handlers ?? {}

  return storage.run({
    listeners,
    nested: parent !== undefined,
    state: parent?.state ?? new Map(),
    handlers: {
      onConfirm: handlers.onConfirm ?? inherited.onConfirm,
      onOtp: handlers.onOtp ?? inherited.onOtp,
      command: inherited.command ?? handlers.command,
    },
  }, run)
}

/**
 * What the running command records while it runs (the changelogs written, the
 * packages published...), by key: each run has its own, so two runs of an
 * application at the same time never mix, and a command run by another one
 * shares the one of its parent. Out of a command, one state for the process.
 */
export function getRunState<T>(key: symbol, create: () => T): T {
  const state = storage.getStore()?.state ?? processState

  if (!state.has(key)) {
    state.set(key, create())
  }

  return state.get(key) as T
}

/** The handlers of the application for the running command: none out of a command */
export function getAppHandlers(): AppHandlers {
  return storage.getStore()?.handlers ?? {}
}

/** Listen to every event of the process, whatever the command: what `RELIZY_REPORTER=json` uses */
export function addGlobalEventListener(listener: RelizyEventListener): () => void {
  globalListeners.add(listener)

  return () => {
    globalListeners.delete(listener)
  }
}

export function emitEvent(event: RelizyEventInput): void {
  const listeners = new Set([
    ...storage.getStore()?.listeners ?? [],
    ...globalListeners,
  ])

  if (listeners.size === 0) {
    return
  }

  const full = {
    ...event,
    time: Date.now(),
  } as RelizyEvent

  for (const listener of listeners) {
    try {
      // An async listener is not awaited: its rejection must not become an unhandled one
      Promise.resolve(listener(full)).catch(() => {})
    }
    catch {}
  }
}

/** True when someone listens to the events, to skip building them otherwise */
export function hasEventListeners(): boolean {
  return globalListeners.size > 0 || (storage.getStore()?.listeners.length ?? 0) > 0
}
