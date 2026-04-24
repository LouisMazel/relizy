import type { AIPromptTarget } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import { logger } from '@maz-ui/node'
import { BASE_PROMPT, PROVIDER_RELEASE_PROMPT, SLACK_PROMPT, TWITTER_PROMPT } from './prompts'
import { getAIProvider } from './registry'

const PLATFORM_PROMPTS: Record<AIPromptTarget, string> = {
  providerRelease: PROVIDER_RELEASE_PROMPT,
  twitter: TWITTER_PROMPT,
  slack: SLACK_PROMPT,
}

function substitutePlaceholders(prompt: string, vars: Record<string, string | undefined>): string {
  let result = prompt
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) {
      result = result.replaceAll(`{{${key}}}`, value)
    }
  }
  return result
}

function assemblePrompt(
  config: ResolvedRelizyConfig,
  target: AIPromptTarget,
  maxLength?: number,
): string {
  const vars = {
    language: config.ai?.language ?? 'en',
    maxLength: maxLength?.toString(),
  }

  const override = config.ai?.systemPromptOverrides?.[target]
  if (override) {
    return substitutePlaceholders(override, vars)
  }

  const parts = [BASE_PROMPT, PLATFORM_PROMPTS[target]]
  if (config.ai?.extraGuidelines) {
    parts.push(config.ai.extraGuidelines)
  }

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

export async function generateAIProviderReleaseBody({ config, rawBody }: { config: ResolvedRelizyConfig, rawBody: string }): Promise<string> {
  if (!rawBody.trim()) {
    logger.debug('AI skipped: empty changelog body')
    return rawBody
  }

  const provider = getAIProvider(config)
  const systemPrompt = assemblePrompt(config, 'providerRelease')

  logger.info(`✨ Rewriting release notes with AI (provider: ${provider.name})`)
  logger.verbose('AI system prompt:', systemPrompt)
  logger.verbose('AI input body:', rawBody)

  try {
    const started = Date.now()
    const output = await provider.generate(config, { systemPrompt, prompt: rawBody })
    const elapsed = Date.now() - started
    logger.info(`✅ AI rewrite done in ${elapsed}ms (${rawBody.length} → ${output.length} chars)`)
    logger.verbose('AI output body:', output)
    return output
  }
  catch (error) {
    return handleFallback(config, rawBody, error)
  }
}

export async function generateAISocialChangelog({ config, rawBody, fallbackBody, platform, maxLength }: {
  config: ResolvedRelizyConfig
  /** Input sent to the AI. Typically the rich (non-minified) changelog so the model has context. */
  rawBody: string
  /** Value returned when the AI fails and fallback is 'raw'. Defaults to rawBody. */
  fallbackBody?: string
  platform: 'twitter' | 'slack'
  maxLength?: number
}): Promise<string> {
  const fallbackValue = fallbackBody ?? rawBody

  if (!rawBody.trim()) {
    logger.debug(`AI skipped for ${platform}: empty changelog body`)
    return fallbackValue
  }

  const provider = getAIProvider(config)
  const systemPrompt = assemblePrompt(config, platform, maxLength)

  const maxLengthHint = maxLength ? `, max ${maxLength} chars` : ''
  logger.info(`✨ Rewriting ${platform} post with AI (provider: ${provider.name}${maxLengthHint})`)
  logger.verbose(`AI system prompt (${platform}):`, systemPrompt)
  logger.verbose(`AI input body (${platform}):`, rawBody)

  try {
    const started = Date.now()
    const output = await provider.generate(config, { systemPrompt, prompt: rawBody, maxLength })
    const elapsed = Date.now() - started
    logger.info(`✅ AI rewrite done for ${platform} in ${elapsed}ms (${rawBody.length} → ${output.length} chars)`)
    logger.verbose(`AI output body (${platform}):`, output)
    return output
  }
  catch (error) {
    return handleFallback(config, fallbackValue, error)
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
