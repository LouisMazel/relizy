import { logger } from '@maz-ui/node'

/**
 * What a long step is doing, for the output of `relizy release`
 * (`release-ui.ts`, which registers its handlers): without them, these
 * calls do nothing. Kept apart from `release-ui.ts`, which imports
 * the modules calling them.
 */

export interface ProgressOptions {
  /**
   * Done by AI: shown as such
   */
  ai?: boolean
}

interface ProgressHandlers {
  /**
   * What the step is doing now, replaced by the next one: `Rewriting the notes of v2.0.0 with AI`
   */
  progress: (message: string, options: ProgressOptions) => void
  /**
   * What the step did, shown under its result: `v2.0.0: notes rewritten by AI in 27.4s`
   */
  note: (message: string, options: ProgressOptions) => void
  /**
   * What a dry run generated (changelog, release notes, posts), shown under the result of the step
   */
  preview: (preview: Preview) => void
}

export interface Preview {
  /**
   * What it is: `GitHub release v2.0.0`
   */
  title: string
  /**
   * Facts about it, shown before the content: `PR: #12`
   */
  meta?: string[]
  content: string
}

let handlers: ProgressHandlers | undefined

/**
 * What a dry run shows and does, from `--no-preview` and `--ai-preview`
 */
const dryRunOptions = {
  /**
   * Show what the dry run generated (changelog, release notes, posts, PR comment)
   */
  preview: true,
  /**
   * Call the AI in dry-run (it costs) instead of simulating the rewrite
   */
  ai: false,
}

export function setDryRunOptions(options: Partial<typeof dryRunOptions>): void {
  Object.assign(dryRunOptions, options)
}

export function isAIPreviewEnabled(): boolean {
  return dryRunOptions.ai
}

export function setProgressHandlers(value: ProgressHandlers | undefined): void {
  handlers = value
}

export function reportProgress(message: string, options: ProgressOptions = {}): void {
  handlers?.progress(message, options)
}

export function reportStepNote(message: string, options: ProgressOptions = {}): void {
  handlers?.note(message, options)
}

/**
 * Show what a dry run generated: under the step of the release output, or
 * in a box of the logger
 */
export function showPreview(preview: Preview): void {
  const meta = preview.meta?.length ? `${preview.meta.join('\n')}\n\n` : ''

  // --no-preview: only in the logs of --log-level verbose (and the log file of the release)
  if (!dryRunOptions.preview) {
    logger.verbose(`[dry-run] ${preview.title}\n\n${meta}${preview.content}`)
    return
  }

  if (handlers) {
    handlers.preview(preview)
    return
  }

  logger.box(`[dry-run] ${preview.title}\n\n${meta}${preview.content}`)
}

/**
 * What a release created, for its summary and its report: links and AI rewrites
 */
export interface ReleaseLink {
  step: 'publish' | 'providerRelease' | 'social' | 'prComment'
  /**
   * What it points to: `v2.0.0`, `relizy@2.0.0`, `Tweet`
   */
  label: string
  url: string
}

export interface AIRewrite {
  subject: string
  provider: string
  /**
   * Not called (dry run without `--ai-preview`)
   */
  simulated: boolean
  durationMs?: number
  /**
   * When the provider gives it (claude-code)
   */
  costUsd?: number
}

const facts = { links: [] as ReleaseLink[], aiRewrites: [] as AIRewrite[], aiCost: undefined as number | undefined }

export function recordLink(link: ReleaseLink): void {
  facts.links.push(link)
}

export function recordAIRewrite(rewrite: AIRewrite): void {
  facts.aiRewrites.push(rewrite)
}

/**
 * The cost of the last AI call, given by its provider
 */
export function recordAICost(costUsd: number | undefined): void {
  facts.aiCost = costUsd
}

export function takeAICost(): number | undefined {
  const cost = facts.aiCost
  facts.aiCost = undefined
  return cost
}

/**
 * The facts recorded since the last call
 */
export function takeReleaseFacts(): { links: ReleaseLink[], aiRewrites: AIRewrite[] } {
  return { links: facts.links.splice(0), aiRewrites: facts.aiRewrites.splice(0) }
}
