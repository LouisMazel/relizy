import type { LanguageModel } from 'ai'
import type { AIProvider } from '../provider'
import { logger } from '@maz-ui/node'

export const aiSdkProvider: AIProvider = {
  name: 'ai-sdk',

  async safetyCheck(config): Promise<void> {
    if (!config.ai.providers?.['ai-sdk']?.model) {
      throw new Error('Language model instance not found. Install and attach your prefered model.')
    }

    try {
      await import('ai')
    }
    catch {
      throw new Error('ai is not installed. Install it with: pnpm add -D ai')
    }
  },

  async generate(config, request) {
    const { generateText, isStepCount } = await import('ai')
    const model = config.ai?.providers?.['ai-sdk']?.model

    const wrappedPrompt = `<changelog>\n${request.prompt}\n</changelog>\n\nRewrite the content inside the <changelog> tag per the rules in the system prompt. Output ONLY the rewritten content, with no preamble, no explanation, no surrounding tags.`

    const result = await generateText({
      model: model as LanguageModel, // Model is not optional, Casted as safety check already handles missing model.
      instructions: request.systemPrompt,
      prompt: wrappedPrompt,
      reasoning: 'low',
      stopWhen: isStepCount(1),
      activeTools: [],
      toolChoice: 'none',
    })

    logger.verbose('AI SDK steps:', result.steps?.flatMap(step => step.content.map(part => part.type)).join(', '))

    return result.text.trim()
  },
}
