import type { AIPromptTarget } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import type { AIReleaseContext } from './prompts'
import type { AIGenerateRequest } from './provider'
import { logger } from '@maz-ui/node'
import { upperFirst } from '@maz-ui/utils/helpers/upperFirst'
import { describeAIUsage, isAIPreviewEnabled, recordAIRewrite, reportProgress, reportStepNote } from '../progress'
import { BASE_PROMPT, MAX_LENGTH_PROMPT, PROVIDER_RELEASE_PROMPT, RELEASES_PROMPT, SLACK_FORMAT_PROMPTS, SLACK_PROMPT, TWITTER_PROMPT, TWITTER_RELEASES_PROMPT } from './prompts'
import { getAIProvider } from './registry'

export type { AIReleaseContext } from './prompts'

const PLATFORM_PROMPTS: Record<AIPromptTarget, string> = {
  providerRelease: PROVIDER_RELEASE_PROMPT,
  twitter: TWITTER_PROMPT,
  slack: SLACK_PROMPT,
}

const PLATFORM_NAMES = { twitter: 'Twitter', slack: 'Slack' } as const

function substitutePlaceholders(prompt: string, vars: Record<string, string | undefined>): string {
  let result = prompt
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) {
      result = result.replaceAll(`{{${key}}}`, value)
    }
  }
  return result
}

/**
 * Extra guidelines of a target: a string applies to every target, an object
 * adds its `global` guidelines followed by the target-specific ones.
 */
function getExtraGuidelines(config: ResolvedRelizyConfig, target: AIPromptTarget): string[] {
  const guidelines = config.ai?.extraGuidelines
  if (!guidelines) {
    return []
  }
  if (typeof guidelines === 'string') {
    return [guidelines]
  }
  return [guidelines.global, guidelines[target]].filter((guideline): guideline is string => !!guideline?.trim())
}

function assemblePrompt(
  config: ResolvedRelizyConfig,
  target: AIPromptTarget,
  maxLength?: number,
): string {
  const vars = {
    language: config.ai.language,
    maxLength: maxLength?.toString(),
  }

  const override = config.ai?.systemPromptOverrides?.[target]
  if (override) {
    return substitutePlaceholders(override, vars)
  }

  const parts = [BASE_PROMPT, PLATFORM_PROMPTS[target]]
  if (target === 'slack') {
    parts.push(SLACK_FORMAT_PROMPTS[config.social?.slack?.changelogFormat ?? 'summary'])
  }
  if (maxLength !== undefined) {
    parts.push(MAX_LENGTH_PROMPT)
  }
  parts.push(...getExtraGuidelines(config, target))

  return substitutePlaceholders(parts.join('\n\n'), vars)
}

export function applyAIOverride(config: ResolvedRelizyConfig, ai?: boolean): void {
  if (ai === undefined)
    return

  if (!config.ai) {
    config.ai = {} as ResolvedRelizyConfig['ai']
  }
  const aiConfig = config.ai as NonNullable<ResolvedRelizyConfig['ai']>
  aiConfig.providerRelease = { enabled: ai }
  aiConfig.social = {
    twitter: { enabled: ai },
    slack: { enabled: ai },
  }
}

export function isAIProviderReleaseEnabled(config: ResolvedRelizyConfig): boolean {
  return !!config.ai?.providerRelease?.enabled
}

export function isAISocialEnabled(config: ResolvedRelizyConfig, platform: 'twitter' | 'slack'): boolean {
  return !!config.social?.[platform]?.enabled && !!config.ai?.social?.[platform]?.enabled
}

export async function aiSafetyCheck({ config }: { config: ResolvedRelizyConfig }): Promise<void> {
  const provider = getAIProvider(config)
  await provider.safetyCheck(config)
}

function formatElapsed(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

/**
 * The AI is not called in dry-run (each call costs): the raw text is kept
 * and the output tells that the rewrite is simulated
 */
function simulateRewrite({ subject, provider }: { subject: string, provider: string }): void {
  logger.info(`✨ AI rewrite of ${subject} simulated (dry run, --ai-preview to call the AI): the raw text is kept`)
  reportStepNote(`${upperFirst(subject)}: AI rewrite simulated (${provider} not called in dry run, see --ai-preview)`, { ai: true })
  recordAIRewrite({ subject, provider, simulated: true })
}

/**
 * Call the provider, and record the rewrite with its duration, tokens and cost
 */
async function rewrite({ subject, config, request }: {
  subject: string
  config: ResolvedRelizyConfig
  request: AIGenerateRequest
}): Promise<string> {
  const provider = getAIProvider(config)
  const started = Date.now()
  logger.info(`✨ Rewriting ${subject} with AI (${provider.name})`)
  reportProgress(`Rewriting ${subject} with AI (${provider.name})`, { ai: true })

  const { text, usage = {} } = await provider.generate(config, request)

  const durationMs = Date.now() - started
  const details = [formatElapsed(durationMs), ...describeAIUsage(usage)].join(', ')
  logger.info(`✨ ${upperFirst(subject)} rewritten by AI in ${details}`)
  reportStepNote(`${upperFirst(subject)} rewritten by AI (${provider.name}) in ${details}`, { ai: true })
  recordAIRewrite({ subject, provider: provider.name, simulated: false, durationMs, ...usage })

  return text
}

export async function generateAIProviderReleaseBody({ config, rawBody, label, context, dryRun = false }: {
  config: ResolvedRelizyConfig
  rawBody: string
  /**
   * The release, for the output: `v2.0.0`
   */
  label?: string
  context?: AIReleaseContext
  dryRun?: boolean
}): Promise<string> {
  if (!rawBody.trim()) {
    logger.debug('AI skipped: empty changelog body')
    return rawBody
  }

  const provider = getAIProvider(config)
  const subject = label ? `the notes of ${label}` : 'the release notes'

  const systemPrompt = assemblePrompt(config, 'providerRelease')

  logger.verbose('AI system prompt:', systemPrompt)
  logger.verbose('AI input body:', rawBody)

  if (dryRun && !isAIPreviewEnabled()) {
    simulateRewrite({ subject, provider: provider.name })
    return rawBody
  }

  try {
    const output = await rewrite({ subject, config, request: { systemPrompt, prompt: rawBody, context } })
    logger.verbose('AI output body:', output)
    return output
  }
  catch (error) {
    return handleFallback(config, rawBody, error)
  }
}

export async function generateAISocialChangelog({ config, rawBody, fallbackBody, platform, maxLength, context, dryRun = false }: {
  config: ResolvedRelizyConfig
  dryRun?: boolean
  /** Input sent to the AI. Typically the rich (non-minified) changelog so the model has context. */
  rawBody: string
  /** Value returned when the AI fails and fallback is 'raw'. Defaults to rawBody. */
  fallbackBody?: string
  platform: 'twitter' | 'slack'
  maxLength?: number
  context?: AIReleaseContext
}): Promise<string> {
  const fallbackValue = fallbackBody ?? rawBody

  if (!rawBody.trim()) {
    logger.debug(`AI skipped for ${platform}: empty changelog body`)
    return fallbackValue
  }

  const provider = getAIProvider(config)
  const subject = `the ${PLATFORM_NAMES[platform]} post`

  const systemPrompt = assemblePrompt(config, platform, maxLength)

  logger.verbose(`AI system prompt (${platform}):`, systemPrompt)
  logger.verbose(`AI input body (${platform}):`, rawBody)

  if (dryRun && !isAIPreviewEnabled()) {
    simulateRewrite({ subject, provider: provider.name })
    return fallbackValue
  }

  try {
    const output = await rewrite({ subject, config, request: { systemPrompt, prompt: rawBody, maxLength, context } })
    logger.verbose(`AI output body (${platform}):`, output)
    return output
  }
  catch (error) {
    return handleFallback(config, fallbackValue, error)
  }
}

/**
 * A version of a post announcing several versions
 */
export interface AISocialRelease {
  id: string
  /**
   * `<name> <version>`
   */
  title: string
  /**
   * Changelog of the version (markdown)
   */
  body: string
  /**
   * Maximum number of highlights (Twitter)
   */
  highlights?: number
}

const RELEASE_OUTPUT_REGEX = /<release\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/release>/g

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

/**
 * Rewrite the changelogs of the versions of a post in a single AI call. Returns
 * the rewritten changelog of each version found in the output, by id: the
 * missing ones (or all of them when the call fails and `ai.fallback` is `raw`)
 * keep their raw changelog.
 */
export async function generateAISocialReleases({ config, releases, platform, maxLength, dryRun = false }: {
  config: ResolvedRelizyConfig
  dryRun?: boolean
  releases: AISocialRelease[]
  platform: 'twitter' | 'slack'
  maxLength?: number
}): Promise<Map<string, string>> {
  const input = releases.filter(release => release.body.trim())

  if (input.length === 0) {
    logger.debug(`AI skipped for ${platform}: empty changelogs`)
    return new Map()
  }

  const provider = getAIProvider(config)
  const subject = `the ${PLATFORM_NAMES[platform]} post of ${input.length} ${input.length === 1 ? 'version' : 'versions'}`

  const releasesPrompt = platform === 'twitter' ? `${RELEASES_PROMPT}\n${TWITTER_RELEASES_PROMPT}` : RELEASES_PROMPT
  const systemPrompt = `${assemblePrompt(config, platform, maxLength)}\n\n${releasesPrompt}`
  const prompt = input
    .map((release) => {
      const highlights = release.highlights ? ` highlights="${release.highlights}"` : ''
      return `<release id="${escapeAttribute(release.id)}" title="${escapeAttribute(release.title)}"${highlights}>\n${release.body}\n</release>`
    })
    .join('\n\n')

  logger.verbose(`AI system prompt (${platform}):`, systemPrompt)
  logger.verbose(`AI input body (${platform}):`, prompt)

  if (dryRun && !isAIPreviewEnabled()) {
    simulateRewrite({ subject, provider: provider.name })
    return new Map()
  }

  try {
    const output = await rewrite({ subject, config, request: { systemPrompt, prompt, maxLength } })
    const rewritten = new Map([...output.matchAll(RELEASE_OUTPUT_REGEX)].map(([, id, body]) => [id!, body!.trim()]))
    const missing = input.filter(release => !rewritten.get(release.id))

    logger.verbose(`AI output body (${platform}):`, output)

    if (missing.length > 0) {
      logger.warn(`AI output has no changelog for ${missing.map(release => release.title).join(', ')}: their raw changelog is used`)
    }

    return rewritten
  }
  catch (error) {
    handleFallback(config, '', error)
    return new Map()
  }
}

function handleFallback(config: ResolvedRelizyConfig, rawBody: string, error: unknown): string {
  const fallback = config.ai?.fallback ?? 'raw'
  const message = error instanceof Error ? error.message : String(error)

  if (fallback === 'fail') {
    throw new Error(`AI generation failed: ${message}`, { cause: error })
  }

  logger.warn(`AI generation failed, falling back to raw body: ${message}`)
  return rawBody
}
