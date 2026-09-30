import { createMockConfig } from '../../../tests/mocks'
import { aiSafetyCheck, BASE_PROMPT, generateAIProviderReleaseBody, generateAISocialChangelog, getAIProvider, PROVIDER_RELEASE_PROMPT, SLACK_PROMPT, TWITTER_PROMPT } from '../ai'

const { mockGenerateText } = vi.hoisted(() => ({ mockGenerateText: vi.fn() }))

vi.mock('ai', () => ({ generateText: (...args: unknown[]) => mockGenerateText(...args) }))
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: () => (modelId: string) => ({ modelId }),
}))

vi.mock('@maz-ui/node', () => ({
  logger: { warn: vi.fn(), fail: vi.fn(), debug: vi.fn(), info: vi.fn(), log: vi.fn(), success: vi.fn(), verbose: vi.fn() },
}))

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_AI_API_KEY', 'sk-test')
  mockGenerateText.mockReset()
  mockGenerateText.mockResolvedValue({ text: 'AI generated output' })
})

describe('aiSafetyCheck', () => {
  it('delegates to provider.safetyCheck', async () => {
    const config = createMockConfig({ ai: { provider: 'anthropic', model: 'claude-sonnet-4-6' } })
    await aiSafetyCheck({ config })
    expect(mockGenerateText).not.toHaveBeenCalled()
  })
})

describe('generateAIProviderReleaseBody', () => {
  it('assembles base + platform prompt with language substitution', async () => {
    const config = createMockConfig({ ai: { provider: 'anthropic', model: 'claude-sonnet-4-6', language: 'fr' } })
    await generateAIProviderReleaseBody({ config, rawBody: 'changelog content' })

    const expected = `${BASE_PROMPT}\n\n${PROVIDER_RELEASE_PROMPT}`.replaceAll('{{language}}', 'fr')
    expect(mockGenerateText.mock.calls[0][0].system).toBe(expected)
    expect(mockGenerateText.mock.calls[0][0].prompt).toContain('changelog content')
  })

  it('defaults language to en', async () => {
    const config = createMockConfig({ ai: { provider: 'anthropic', model: 'claude-sonnet-4-6' } })
    await generateAIProviderReleaseBody({ config, rawBody: 'body' })
    expect(mockGenerateText.mock.calls[0][0].system).toContain('Output language: en')
  })

  it('appends extraGuidelines when set', async () => {
    const config = createMockConfig({ ai: { provider: 'anthropic', model: 'claude-sonnet-4-6', extraGuidelines: 'Be concise.' } })
    await generateAIProviderReleaseBody({ config, rawBody: 'body' })
    expect(mockGenerateText.mock.calls[0][0].system).toContain('Be concise.')
  })

  it('uses systemPromptOverrides when provided', async () => {
    const config = createMockConfig({
      ai: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        language: 'Spanish',
        systemPromptOverrides: { providerRelease: 'Custom prompt in {{language}}' },
      },
    })
    await generateAIProviderReleaseBody({ config, rawBody: 'body' })
    expect(mockGenerateText.mock.calls[0][0].system).toBe('Custom prompt in Spanish')
  })

  it('returns provider output on success', async () => {
    const config = createMockConfig({ ai: { provider: 'anthropic', model: 'claude-sonnet-4-6' } })
    const result = await generateAIProviderReleaseBody({ config, rawBody: 'body' })
    expect(result).toBe('AI generated output')
  })
})

describe('generateAISocialChangelog', () => {
  it('assembles base + twitter prompt with maxLength substitution', async () => {
    const config = createMockConfig({ ai: { provider: 'anthropic', model: 'claude-sonnet-4-6' } })
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'twitter', maxLength: 280 })

    const expected = `${BASE_PROMPT}\n\n${TWITTER_PROMPT}`
      .replaceAll('{{language}}', 'en')
      .replaceAll('{{maxLength}}', '280')
    expect(mockGenerateText.mock.calls[0][0].system).toBe(expected)
  })

  it('assembles base + slack prompt', async () => {
    const config = createMockConfig({ ai: { provider: 'anthropic', model: 'claude-sonnet-4-6' } })
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'slack' })
    expect(mockGenerateText.mock.calls[0][0].system).toContain(SLACK_PROMPT)
  })

  it('uses systemPromptOverrides per platform', async () => {
    const config = createMockConfig({
      ai: { provider: 'anthropic', model: 'claude-sonnet-4-6', systemPromptOverrides: { twitter: 'Twitter override {{maxLength}}' } },
    })
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'twitter', maxLength: 140 })
    expect(mockGenerateText.mock.calls[0][0].system).toBe('Twitter override 140')
  })
})

describe('fallback modes', () => {
  it('warns and returns rawBody when fallback is raw (default)', async () => {
    const { logger } = await import('@maz-ui/node')
    mockGenerateText.mockRejectedValue(new Error('API down'))
    const config = createMockConfig({ ai: { provider: 'anthropic', model: 'claude-sonnet-4-6' } })
    const result = await generateAIProviderReleaseBody({ config, rawBody: 'raw content' })
    expect(result).toBe('raw content')
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('AI generation failed'))
  })

  it('warns and returns rawBody when fallback is explicitly raw', async () => {
    mockGenerateText.mockRejectedValue(new Error('timeout'))
    const config = createMockConfig({ ai: { provider: 'anthropic', model: 'claude-sonnet-4-6', fallback: 'raw' } })
    const result = await generateAISocialChangelog({ config, rawBody: 'fallback body', platform: 'slack' })
    expect(result).toBe('fallback body')
  })

  it('re-throws with context when fallback is fail', async () => {
    mockGenerateText.mockRejectedValue(new Error('API down'))
    const config = createMockConfig({ ai: { provider: 'anthropic', model: 'claude-sonnet-4-6', fallback: 'fail' } })
    await expect(generateAIProviderReleaseBody({ config, rawBody: 'body' }))
      .rejects
      .toThrow('AI generation failed: API down')
  })
})

describe('unknown provider error', () => {
  it('rejects provider names outside the supported catalog', () => {
    const config = createMockConfig({ ai: { provider: 'nonexistent' as any, model: 'model-id' } })
    expect(() => getAIProvider(config)).toThrow('Unknown AI provider')
  })
})
