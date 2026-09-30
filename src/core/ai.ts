import type { LanguageModel } from 'ai'
import type { AIPromptTarget, AIProviderName } from '../types'
import type { ResolvedRelizyConfig } from './config'
import process from 'node:process'
import { logger } from '@maz-ui/node'

export interface AIGenerateRequest {
  systemPrompt: string
  prompt: string
  maxLength?: number
}

export interface AIProvider {
  name: AIProviderName
  safetyCheck: (config: ResolvedRelizyConfig) => void | Promise<void>
  generate: (config: ResolvedRelizyConfig, request: AIGenerateRequest) => Promise<string>
}

interface AIProviderDefinition {
  packageName: string
  factoryName: string
  apiKeyEnv?: string
}

export const BASE_PROMPT = `You are a release-notes rewriter.
The user message contains a markdown changelog built from conventional commits, wrapped in a <changelog> tag. Your job: rewrite the content inside that tag.
Never ask for clarification. Never reply with questions, greetings, or meta-commentary. Your only output is the rewritten changelog content.
Never invent changes that are not in the input — if something is not mentioned, it does not exist.
Never include compare links, contributor lists, or release metadata — only the content provided.
Respond with the rewritten content only — no preamble, no explanation, no surrounding code fence, no <changelog> tag.
Output language: {{language}}.`

export const PROVIDER_RELEASE_PROMPT = `Format the output as markdown with "### <Type>" sections matching the input (Features, Bug Fixes, etc.).
Merge redundant items that describe the same change.
Rewrite each bullet for end-user clarity — focus on what changed for the user, not internal details.
Preserve exactly as given: PR and issue references like #123, commit hashes, commit scopes like **auth:**, and all markdown links.
Preserve the ⚠️ marker on breaking items and the "#### ⚠️ Breaking Changes" section if present.
Purely internal commits (chore, refactor with no user-visible impact) may be dropped unless they carry meaningful information.
Tone: professional, concise, public-facing release notes.`

export const TWITTER_PROMPT = `Output plain text — no markdown. A leading "#" becomes a hashtag on Twitter, so avoid it.
Hard maximum: {{maxLength}} characters — never exceed it.
Remove commit hashes (e.g. "aabf96b") and PR/issue references (e.g. "#123") — they are meaningless on Twitter.
If the input has one change, write one substantive sentence about it (ground it in the input, never invent).
If the input has multiple changes, surface 2 to 4 highlights.
You produce ONLY the changelog content — the outer template will add the project name, version, and URLs around it.
Tone: enthusiastic but not cringy. At most 1-2 emojis total.
Do not add hashtags unless the user explicitly supplies them.`

export const SLACK_PROMPT = `Format with Slack-compatible markdown: *bold*, _italic_, \`code\`, and "-" bullet lists.
Keep it concise — 3 to 8 bullets maximum.
If any breaking changes are present, lead with them.
Tone: factual, oriented toward an internal team audience.`

export const AI_PROVIDER_CATALOG: Record<AIProviderName, AIProviderDefinition> = {
  anthropic: { packageName: '@ai-sdk/anthropic', factoryName: 'createAnthropic', apiKeyEnv: 'ANTHROPIC_AI_API_KEY' },
  google: { packageName: '@ai-sdk/google', factoryName: 'createGoogle', apiKeyEnv: 'GOOGLE_AI_API_KEY' },
}

const PLATFORM_PROMPTS: Record<AIPromptTarget, string> = {
  providerRelease: PROVIDER_RELEASE_PROMPT,
  twitter: TWITTER_PROMPT,
  slack: SLACK_PROMPT,
}

const CHANGELOG_INSTRUCTION = '\n\nRewrite the content inside the <changelog> tag per the rules in the system prompt. Output ONLY the rewritten content, with no preamble, no explanation, no surrounding tags.'

type AIModelProvider = ((modelId: string) => LanguageModel)
type AIModelFactory = (options: Record<string, unknown>) => AIModelProvider

function substitutePlaceholders(prompt: string, vars: Record<string, string | undefined>): string {
  let result = prompt
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) {
      result = result.replaceAll(`{{${key}}}`, value)
    }
  }
  return result
}

function assemblePrompt(config: ResolvedRelizyConfig, target: AIPromptTarget, maxLength?: number): string {
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

function resolveSelection(config: ResolvedRelizyConfig) {
  const providerName = config.ai?.provider
  if (!providerName) {
    throw new Error('AI provider is required. Set ai.provider to an official Vercel AI SDK provider.')
  }

  const definition = AI_PROVIDER_CATALOG[providerName]
  if (!definition) {
    throw new Error(`Unknown AI provider "${providerName}". Available providers: ${Object.keys(AI_PROVIDER_CATALOG).join(', ')}`)
  }

  const model = config.ai?.model?.trim()
  if (!model) {
    throw new Error(`AI model is required when using provider "${providerName}". Set ai.model to a model ID supported by that provider.`)
  }

  return { providerName, definition, model }
}

export function resolveAIAPIKey(config: ResolvedRelizyConfig, providerName: AIProviderName): string | undefined {
  const configuredKey = config.ai?.apiKey ?? config.tokens?.ai ?? config.ai?.providerOptions?.apiKey
  if (typeof configuredKey === 'string' && configuredKey.length > 0) {
    return configuredKey
  }

  const envName = AI_PROVIDER_CATALOG[providerName].apiKeyEnv ?? ''
  const value = process.env[`RELIZY_${envName}`] || process.env[envName]
  if (value) {
    return value
  }
}

async function loadAIProviderPackage(packageName: string): Promise<Record<string, unknown>> {
  try {
    return await import(packageName) as Record<string, unknown>
  }
  catch (error) {
    throw new Error(`The selected Vercel AI SDK adapter "${packageName}" is not installed. Install it with your package manager.`, { cause: error })
  }
}

function getProviderOptions(config: ResolvedRelizyConfig, apiKey?: string): Record<string, unknown> {
  const options = { ...config.ai?.providerOptions }
  if (apiKey) {
    options.apiKey = apiKey
  }
  return options
}

export function getAIProvider(config: ResolvedRelizyConfig): AIProvider {
  const { providerName, definition, model } = resolveSelection(config)

  return {
    name: providerName,

    async safetyCheck() {
      if (definition.apiKeyEnv && !resolveAIAPIKey(config, providerName)) {
        throw new Error(
          `No API key found for AI provider "${providerName}". Set ai.apiKey, tokens.ai.${providerName}, RELIZY_${definition.apiKeyEnv}, or ${definition.apiKeyEnv}.`,
        )
      }

      try {
        await import('ai')
      }
      catch (error) {
        throw new Error('The Vercel AI SDK package "ai" is not installed. Install it with your package manager.', { cause: error })
      }

      await loadAIProviderPackage(definition.packageName)
    },

    async generate(_config, request) {
      const apiKey = resolveAIAPIKey(config, providerName)
      if (definition.apiKeyEnv && !apiKey) {
        throw new Error(`No API key found for AI provider "${providerName}".`)
      }

      const providerModule = await loadAIProviderPackage(definition.packageName)
      const factory = providerModule[definition.factoryName]
      if (typeof factory !== 'function') {
        throw new TypeError(`AI SDK adapter "${definition.packageName}" does not export ${definition.factoryName}.`)
      }

      const provider = (factory as AIModelFactory)(getProviderOptions(config, apiKey))

      if (typeof provider !== 'function') {
        throw new TypeError(`AI SDK adapter "${definition.packageName}" is not callable with a model ID.`)
      }
      const selectedModel = provider(model)

      const { generateText } = await import('ai')
      const result = await generateText({
        model: selectedModel,
        system: request.systemPrompt,
        prompt: `<changelog>\n${request.prompt}\n</changelog>${CHANGELOG_INSTRUCTION}`,
      })
      return (result.text ?? '').trim()
    },
  }
}

export function applyAIOverride(config: ResolvedRelizyConfig, ai?: boolean): void {
  if (ai === undefined) {
    return
  }

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
  await getAIProvider(config).safetyCheck(config)
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
  rawBody: string
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
    logger.verbose('AI output body:', output)
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
