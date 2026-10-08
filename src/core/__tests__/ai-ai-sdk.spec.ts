import type { AIGenerateRequest } from '../ai/provider'
import { logger } from '@maz-ui/node'
import { createMockConfig } from '../../../tests/mocks'

const modelId = 'gemini-2.5-flash'

const { mockGenerateText, mockGoogle } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockGoogle: vi.fn((modelId: string) => ({ modelId })),
}))

vi.mock('ai', async importOriginal => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: mockGenerateText,
}))

vi.mock('@ai-sdk/google', () => ({
  google: (modelId: string) => mockGoogle(modelId),
}))

const { aiSdkProvider } = await import('../ai/providers/ai-sdk')

describe('aiSdkProvider', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mockGenerateText.mockReset()
    mockGoogle.mockClear()
    mockGenerateText.mockResolvedValue({ text: '  generated output  ' })
  })

  it('has name ai-sdk', () => {
    expect(aiSdkProvider.name).toBe('ai-sdk')
  })

  describe('safetyCheck', () => {
    it('passes when model instance is set in provider config', async () => {
      const config = createMockConfig({
        ai: { providers: { 'ai-sdk': { model: mockGoogle(modelId) } } },
      })
      await expect(aiSdkProvider.safetyCheck(config)).resolves.toBeUndefined()
    })

    it('throws when no when model instance is set in provider config', async () => {
      const config = createMockConfig({})
      await expect(aiSdkProvider.safetyCheck(config)).rejects.toThrow(
        'Language model instance not found. Install and attach your prefered model.',
      )
    })
  })

  describe('generate', () => {
    const request: AIGenerateRequest = {
      systemPrompt: 'You are helpful.',
      prompt: 'Summarize changes',
    }

    it('calls generateText with system prompt, wrapped user prompt; returns trimmed output', async () => {
      vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'AI...')
      mockGenerateText.mockResolvedValue({ text: '  Result text  ' })

      const config = createMockConfig({
        ai: { providers: { 'ai-sdk': { model: mockGoogle(modelId) } } },
      })
      const result = await aiSdkProvider.generate(config, request)

      expect(result).toBe('Result text')

      const [options] = mockGenerateText.mock.calls[0]
      expect(options.instructions).toBe('You are helpful.')
      expect(options.prompt).toContain('<changelog>')
      expect(options.prompt).toContain('Summarize changes')
      expect(options.prompt).toContain('</changelog>')
    })

    it('passes model when configured', async () => {
      vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'AI...')
      mockGenerateText.mockResolvedValue({ text: '  Result text  ' })

      const config = createMockConfig({
        ai: { providers: { 'ai-sdk': { model: mockGoogle(modelId) } } },
      })
      await aiSdkProvider.generate(config, request)

      const [options] = mockGenerateText.mock.calls[0]
      expect(options.model).toStrictEqual({ modelId })
    })

    it('logs steps when SDK returns steps', async () => {
      vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'AI...')
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

      const config = createMockConfig({
        ai: { providers: { 'ai-sdk': { model: mockGoogle(modelId) } } },
      })
      const result = await aiSdkProvider.generate(config, request)

      expect(result).toBe('done')
      expect(logger.verbose).toHaveBeenCalledWith(
        'AI SDK steps:',
        'reasoning, text',
      )
    })
  })

  describe('safetyCheck when SDK is not installed', () => {
    it('throws with install instructions', async () => {
      vi.resetModules()
      vi.doMock('ai', () => {
        throw new Error('Cannot find module')
      })

      const { aiSdkProvider: providerFresh } = await import('../ai/providers/ai-sdk')
      const config = createMockConfig({
        ai: { providers: { 'ai-sdk': { model: mockGoogle(modelId) } } },
      })

      await expect(providerFresh.safetyCheck(config)).rejects.toThrow(
        'ai is not installed. Install it with: pnpm add -D ai',
      )

      vi.doUnmock('ai')
      vi.resetModules()
    })
  })
})
