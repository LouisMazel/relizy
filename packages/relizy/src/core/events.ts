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

/** A step is done */
export interface StepDoneEvent extends ProgressEventBase {
  type: 'step:done'
  step?: ProgressStep
  label: string
  /** What it did: `Published relizy@2.0.0 to npm` */
  message: string
  durationMs: number
  /** Lines under the result, e.g. the packages of the bump. What the step noted comes before, as `note` events */
  details: string[]
}

/** A step fails: `fatal` when it stops the command, not when the release goes on (a post that failed) */
export interface StepFailedEvent extends ProgressEventBase {
  type: 'step:failed'
  step?: ProgressStep
  label: string
  /** The step did not stop the command (a provider release, a post) */
  fatal: boolean
  durationMs: number
  /** What it did or why it failed */
  message: string
  /** The prompt was refused or cancelled: nothing failed */
  cancelled: boolean
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
  step: 'publish' | 'providerRelease' | 'social' | 'prComment'
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

export type RelizyEventListener = (event: RelizyEvent) => void

interface EventContext {
  listeners: RelizyEventListener[]
  /** A command run by another one: its steps are the progress of the step of the parent */
  nested: boolean
}

const storage = new AsyncLocalStorage<EventContext>()
const globalListeners = new Set<RelizyEventListener>()

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
 */
export function runWithEvents<T>(listener: RelizyEventListener | undefined, run: () => T): T {
  const parent = storage.getStore()
  const listeners = [
    ...parent?.listeners ?? [],
    ...listener
      ? [listener]
      : [],
  ]

  return storage.run({ listeners, nested: parent !== undefined }, run)
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
      listener(full)
    }
    catch {}
  }
}

/** True when someone listens to the events, to skip building them otherwise */
export function hasEventListeners(): boolean {
  return globalListeners.size > 0 || (storage.getStore()?.listeners.length ?? 0) > 0
}
