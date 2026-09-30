import { createMockConfig } from '../../../tests/mocks'

const { mockGenerateText, mockCreateAnthropic, mockCreateGoogle, mockCreateProdia } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockCreateAnthropic: vi.fn((options: Record<string, unknown>) => (modelId: string) => ({ options, modelId })),
  mockCreateGoogle: vi.fn((options: Record<string, unknown>) => (modelId: string) => ({ options, modelId })),
  mockCreateProdia: vi.fn(() => ({ languageModel: (modelId: string) => ({ modelId }) })),
}))

vi.mock('ai', () => ({ generateText: (...args: unknown[]) => mockGenerateText(...args) }))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: (options: Record<string, unknown>) => mockCreateAnthropic(options) }))
vi.mock('@ai-sdk/google', () => ({ createGoogle: (options: Record<string, unknown>) => mockCreateGoogle(options) }))
vi.mock('@ai-sdk/prodia', () => ({ createProdia: () => mockCreateProdia() }))

const { AI_PROVIDER_CATALOG, getAIProvider, resolveAIAPIKey } = await import('../ai')

describe('Vercel AI provider configuration', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mockGenerateText.mockReset()
    mockCreateAnthropic.mockClear()
    mockCreateGoogle.mockClear()
    mockGenerateText.mockResolvedValue({ text: '  generated output  ' })
  })

  it('catalogs official text providers', () => {
    expect(Object.keys(AI_PROVIDER_CATALOG)).toEqual(expect.arrayContaining([
      'anthropic',
      'google',
    ]))
    expect(Object.keys(AI_PROVIDER_CATALOG)).not.toContain('claude-code')
  })

  it('requires a configured provider and model', () => {
    expect(() => getAIProvider(createMockConfig({}))).toThrow('AI provider is required')
    expect(() => getAIProvider(createMockConfig({ ai: { provider: 'anthropic' } }))).toThrow('AI model is required')
  })

  it('rejects unsupported provider names with the available list', () => {
    expect(() => getAIProvider(createMockConfig({
      ai: { provider: 'unknown' as any, model: 'model-id' },
    }))).toThrow('Unknown AI provider "unknown"')
  })

  it('resolves credentials from config before provider options and environment', () => {
    vi.stubEnv('ANTHROPIC_AI_API_KEY', 'sk-env')
    vi.stubEnv('RELIZY_ANTHROPIC_AI_API_KEY', 'sk-relizy-env')
    const config = createMockConfig({
      ai: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        apiKey: 'sk-ai-config',
        providerOptions: { apiKey: 'sk-provider-options' },
      },
      tokens: { ai: 'sk-token-config' },
    })

    expect(resolveAIAPIKey(config, 'anthropic')).toBe('sk-ai-config')
    delete config.ai?.apiKey
    expect(resolveAIAPIKey(config, 'anthropic')).toBe('sk-token-config')
    delete config.tokens?.ai
    expect(resolveAIAPIKey(config, 'anthropic')).toBe('sk-provider-options')
  })

  it('resolves Relizy-prefixed then provider-standard environment variables', () => {
    const config = createMockConfig({ ai: { provider: 'anthropic', model: 'claude-sonnet-4-6' } })
    vi.stubEnv('ANTHROPIC_AI_API_KEY', 'sk-standard')
    expect(resolveAIAPIKey(config, 'anthropic')).toBe('sk-standard')

    vi.stubEnv('RELIZY_ANTHROPIC_AI_API_KEY', 'sk-relizy')
    expect(resolveAIAPIKey(config, 'anthropic')).toBe('sk-relizy')
  })

  it('reports missing API credentials during the safety check', async () => {
    const provider = getAIProvider(createMockConfig({ ai: { provider: 'anthropic', model: 'claude-sonnet-4-6' } }))
    await expect(provider.safetyCheck(createMockConfig({}))).rejects.toThrow('No API key found for AI provider "anthropic"')
  })

  it('calls the shared SDK with the selected provider, model, prompts, and resolved key', async () => {
    const config = createMockConfig({
      ai: { provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'sk-test' },
    })
    const provider = getAIProvider(config)
    const result = await provider.generate(config, {
      systemPrompt: 'Rewrite faithfully.',
      prompt: 'Summarize changes',
    })

    expect(result).toBe('generated output')
    expect(mockCreateAnthropic).toHaveBeenCalledWith({ apiKey: 'sk-test' })
    expect(mockCreateAnthropic.mock.results[0].value).toBeTypeOf('function')
    expect(mockGenerateText).toHaveBeenCalledWith({
      model: { options: { apiKey: 'sk-test' }, modelId: 'claude-sonnet-4-6' },
      system: 'Rewrite faithfully.',
      prompt: expect.stringContaining('<changelog>\nSummarize changes\n</changelog>'),
    })
  })

  it('uses the selected Google adapter and passes provider-specific options', async () => {
    const config = createMockConfig({
      ai: {
        provider: 'google',
        model: 'gemini-2.5-flash',
        apiKey: 'google-test-key',
        providerOptions: { baseURL: 'https://example.test' },
      },
    })
    const provider = getAIProvider(config)
    await provider.generate(config, { systemPrompt: 'System', prompt: 'Body' })

    expect(mockCreateGoogle).toHaveBeenCalledWith({
      baseURL: 'https://example.test',
      apiKey: 'google-test-key',
    })
    expect(mockGenerateText.mock.calls[0][0].model.modelId).toBe('gemini-2.5-flash')
  })

  it('reports a missing selected adapter package', async () => {
    vi.resetModules()
    vi.doMock('@ai-sdk/anthropic', () => {
      throw new Error('missing adapter')
    })
    const { getAIProvider: getFreshProvider } = await import('../ai')
    const config = createMockConfig({
      ai: { provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'sk-test' },
    })
    await expect(getFreshProvider(config).safetyCheck(config)).rejects.toThrow(/@ai-sdk\/anthropic.*is not installed/)
    vi.doUnmock('@ai-sdk/anthropic')
    vi.resetModules()
  })
})
