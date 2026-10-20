import type { AIGenerateRequest } from '../ai/provider'
import { logger } from '@maz-ui/node'
import { createMockConfig } from '../../../tests/mocks'

const mockGenerateText = vi.fn()

vi.mock('ai', async importOriginal => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}))

const { aiSdkProvider } = await import('../ai/providers/ai-sdk')

const model = { modelId: 'gpt-5-mini' } as any

describe('aiSdkProvider', () => {
  beforeEach(() => {
    mockGenerateText.mockReset()
    mockGenerateText.mockResolvedValue({ text: '  generated output  ' })
  })

  it('has name ai-sdk', () => {
    expect(aiSdkProvider.name).toBe('ai-sdk')
  })

  describe('safetyCheck', () => {
    it('passes when a model is configured', async () => {
      const config = createMockConfig({ ai: { providers: { 'ai-sdk': { model } } } })
      await expect(aiSdkProvider.safetyCheck(config)).resolves.toBeUndefined()
    })

    it('passes when the model is a gateway model id', async () => {
      const config = createMockConfig({ ai: { providers: { 'ai-sdk': { model: 'openai/gpt-5-mini' } } } })
      await expect(aiSdkProvider.safetyCheck(config)).resolves.toBeUndefined()
    })

    it('throws with the config path when no model is configured', async () => {
      const config = createMockConfig({})
      await expect(aiSdkProvider.safetyCheck(config)).rejects.toThrow(
        'No model configured for the ai-sdk provider. Set ai.providers[\'ai-sdk\'].model',
      )
    })
  })

  describe('generate', () => {
    const request: AIGenerateRequest = {
      systemPrompt: 'You are helpful.',
      prompt: 'Summarize changes',
    }

    it('calls generateText with the model, the system prompt and the wrapped prompt; returns trimmed output', async () => {
      const config = createMockConfig({ ai: { providers: { 'ai-sdk': { model } } } })
      const result = await aiSdkProvider.generate(config, request)

      expect(result).toBe('generated output')

      const [options] = mockGenerateText.mock.calls[0]
      expect(options.model).toBe(model)
      expect(options.instructions).toBe('You are helpful.')
      expect(options.prompt).toContain('<changelog>\nSummarize changes\n</changelog>')
    })

    it('lets the provider default apply when reasoning is not configured', async () => {
      const config = createMockConfig({ ai: { providers: { 'ai-sdk': { model } } } })
      await aiSdkProvider.generate(config, request)

      const [options] = mockGenerateText.mock.calls[0]
      expect(options).not.toHaveProperty('reasoning')
    })

    it('passes the configured reasoning effort', async () => {
      const config = createMockConfig({ ai: { providers: { 'ai-sdk': { model, reasoning: 'low' } } } })
      await aiSdkProvider.generate(config, request)

      const [options] = mockGenerateText.mock.calls[0]
      expect(options.reasoning).toBe('low')
    })

    it('throws with the config path when no model is configured (safety check skipped)', async () => {
      const config = createMockConfig({})

      await expect(aiSdkProvider.generate(config, request)).rejects.toThrow(
        'No model configured for the ai-sdk provider',
      )
      expect(mockGenerateText).not.toHaveBeenCalled()
    })

    it('logs the step content types', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'done',
        steps: [
          {
            content: [
              { type: 'reasoning', text: 'thinking about it' },
              { type: 'text', text: 'done' },
            ],
          },
        ],
      })

      const config = createMockConfig({ ai: { providers: { 'ai-sdk': { model } } } })
      const result = await aiSdkProvider.generate(config, request)

      expect(result).toBe('done')
      expect(logger.verbose).toHaveBeenCalledWith('AI SDK steps:', 'reasoning, text')
    })
  })

  describe('safetyCheck when ai is not installed', () => {
    it('throws with install instructions', async () => {
      vi.resetModules()
      vi.doMock('ai', () => {
        throw new Error('Cannot find module')
      })

      const { aiSdkProvider: providerFresh } = await import('../ai/providers/ai-sdk')
      const config = createMockConfig({ ai: { providers: { 'ai-sdk': { model } } } })

      await expect(providerFresh.safetyCheck(config)).rejects.toThrow(
        'ai is not installed. Install it with: pnpm add -D ai',
      )

      vi.doUnmock('ai')
      vi.resetModules()
    })
  })
})
