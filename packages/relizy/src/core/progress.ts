import { logger } from '@maz-ui/node'
import { emitEvent } from './events'

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
  emitEvent({ type: 'progress', message, ai: options.ai ?? false })
  handlers?.progress(message, options)
}

export function reportStepNote(message: string, options: ProgressOptions = {}): void {
  emitEvent({ type: 'note', message, ai: options.ai ?? false })
  handlers?.note(message, options)
}

/**
 * Show what a dry run generated: under the step of the release output, or
 * in a box of the logger
 */
export function showPreview(preview: Preview): void {
  const meta = preview.meta?.length
    ? `${preview.meta.join('\n')}\n\n`
    : ''

  // --no-preview: only in the logs of --log-level verbose (and the log file of the release)
  if (!dryRunOptions.preview) {
    logger.verbose(`[dry-run] ${preview.title}\n\n${meta}${preview.content}`)
    return
  }

  emitEvent({
    type: 'preview',
    title: preview.title,
    meta: preview.meta ?? [],
    content: preview.content,
  })

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

/**
 * What an AI call used, when its provider gives it
 */
export interface AIUsage {
  inputTokens?: number
  outputTokens?: number
  /**
   * Estimated by the provider (claude-code)
   */
  costUsd?: number
}

export interface AIRewrite extends AIUsage {
  subject: string
  provider: string
  /**
   * Not called (dry run without `--ai-preview`)
   */
  simulated: boolean
  durationMs?: number
}

/**
 * `850`, `12.4k`, `1.2M`
 */
function formatTokenCount(count: number): string {
  if (count < 1000) {
    return String(count)
  }
  const [value, unit] = count < 1_000_000
    ? [count / 1000, 'k']
    : [count / 1_000_000, 'M']
  return `${value.toFixed(1).replace(/\.0$/, '')}${unit}`
}

/**
 * The usage of AI calls, in words: `['12.4k tokens', '$0.042']`
 */
export function describeAIUsage(usage: AIUsage): string[] {
  const tokens = usage.inputTokens === undefined && usage.outputTokens === undefined
    ? undefined
    : (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)

  return [
    tokens === undefined
      ? ''
      : `${formatTokenCount(tokens)} ${tokens === 1
        ? 'token'
        : 'tokens'}`,
    usage.costUsd === undefined
      ? ''
      : `$${usage.costUsd.toFixed(3)}`,
  ].filter(Boolean)
}

const facts = { links: [] as ReleaseLink[], aiRewrites: [] as AIRewrite[] }

export function recordLink(link: ReleaseLink): void {
  facts.links.push(link)
  emitEvent({
    type: 'link',
    step: link.step,
    label: link.label,
    url: link.url,
  })
}

export function recordAIRewrite(rewrite: AIRewrite): void {
  facts.aiRewrites.push(rewrite)
}

/**
 * The facts recorded since the last call
 */
export function takeReleaseFacts(): { links: ReleaseLink[], aiRewrites: AIRewrite[] } {
  return {
    links: facts.links.splice(0),
    aiRewrites: facts.aiRewrites.splice(0),
  }
}
