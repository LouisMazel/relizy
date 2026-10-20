import type { LanguageModel } from 'ai'
import type { ResolvedRelizyConfig } from '../../config'
import type { AIGenerateRequest, AIProvider } from '../provider'
import { logger } from '@maz-ui/node'
import { wrapChangelogPrompt } from '../prompts'

function getModel(config: ResolvedRelizyConfig): LanguageModel {
  const model = config.ai?.providers?.['ai-sdk']?.model

  if (!model) {
    throw new Error(
      'No model configured for the ai-sdk provider. '
      + 'Set ai.providers[\'ai-sdk\'].model, e.g. openai(\'gpt-5-mini\') from @ai-sdk/openai.',
    )
  }

  return model
}

export const aiSdkProvider: AIProvider = {
  name: 'ai-sdk',

  async safetyCheck(config: ResolvedRelizyConfig): Promise<void> {
    getModel(config)

    try {
      await import('ai')
    }
    catch {
      throw new Error('ai is not installed. Install it with: pnpm add -D ai')
    }
  },

  async generate(config: ResolvedRelizyConfig, request: AIGenerateRequest): Promise<string> {
    // The safety check can be skipped (--no-safety-check): check the model again
    const model = getModel(config)
    const { generateText } = await import('ai')
    const reasoning = config.ai?.providers?.['ai-sdk']?.reasoning

    const result = await generateText({
      model,
      instructions: request.systemPrompt,
      prompt: wrapChangelogPrompt(request.prompt),
      ...(reasoning && { reasoning }),
    })

    logger.verbose('AI SDK steps:', result.steps?.flatMap(step => step.content.map(part => part.type)).join(', '))

    return result.text.trim()
  },
}
