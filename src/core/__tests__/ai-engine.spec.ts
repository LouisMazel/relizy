import type { AIGenerateRequest, AIProvider } from '../ai/provider'
import type { ResolvedRelizyConfig } from '../config'
import { createMockConfig } from '../../../tests/mocks'
import { aiSafetyCheck, generateAIProviderReleaseBody, generateAISocialChangelog } from '../ai/index'
import { BASE_PROMPT, PROVIDER_RELEASE_PROMPT, SLACK_PROMPT, TWITTER_PROMPT } from '../ai/prompts'

let fakeProvider: AIProvider & { lastRequest?: AIGenerateRequest, safetyCheckCalled: boolean }

vi.mock('../ai/registry', () => ({
  getAIProvider: () => fakeProvider,
}))

vi.mock('@maz-ui/node', () => ({
  logger: { warn: vi.fn(), fail: vi.fn(), debug: vi.fn(), info: vi.fn(), log: vi.fn(), success: vi.fn(), verbose: vi.fn() },
}))

function createFakeProvider(overrides?: Partial<AIProvider>) {
  return {
    name: 'fake',
    safetyCheckCalled: false,
    lastRequest: undefined as AIGenerateRequest | undefined,
    safetyCheck(_config: ResolvedRelizyConfig) {
      fakeProvider.safetyCheckCalled = true
    },
    generate(_config: ResolvedRelizyConfig, request: AIGenerateRequest) {
      fakeProvider.lastRequest = request
      return Promise.resolve('AI generated output')
    },
    ...overrides,
  }
}

beforeEach(() => {
  fakeProvider = createFakeProvider()
})

describe('aiSafetyCheck', () => {
  it('delegates to provider.safetyCheck', async () => {
    const config = createMockConfig({})
    await aiSafetyCheck({ config })
    expect(fakeProvider.safetyCheckCalled).toBe(true)
  })
})

describe('generateAIProviderReleaseBody', () => {
  it('assembles base + platform prompt with language substitution', async () => {
    const config = createMockConfig({ ai: { language: 'fr' } })
    await generateAIProviderReleaseBody({ config, rawBody: 'changelog content' })

    const expected = `${BASE_PROMPT}\n\n${PROVIDER_RELEASE_PROMPT}`.replaceAll('{{language}}', 'fr')
    expect(fakeProvider.lastRequest?.systemPrompt).toBe(expected)
    expect(fakeProvider.lastRequest?.prompt).toBe('changelog content')
  })

  it('defaults language to en', async () => {
    const config = createMockConfig({})
    await generateAIProviderReleaseBody({ config, rawBody: 'body' })
    expect(fakeProvider.lastRequest?.systemPrompt).toContain('Output language: en')
  })

  it('appends extraGuidelines when set', async () => {
    const config = createMockConfig({ ai: { extraGuidelines: 'Be concise.' } })
    await generateAIProviderReleaseBody({ config, rawBody: 'body' })
    expect(fakeProvider.lastRequest?.systemPrompt).toContain('Be concise.')
  })

  it('uses systemPromptOverrides when provided', async () => {
    const config = createMockConfig({
      ai: {
        language: 'Spanish',
        systemPromptOverrides: { providerRelease: 'Custom prompt in {{language}}' },
      },
    })
    await generateAIProviderReleaseBody({ config, rawBody: 'body' })
    expect(fakeProvider.lastRequest?.systemPrompt).toBe('Custom prompt in Spanish')
  })

  it('returns provider output on success', async () => {
    const config = createMockConfig({})
    const result = await generateAIProviderReleaseBody({ config, rawBody: 'body' })
    expect(result).toBe('AI generated output')
  })
})

describe('generateAISocialChangelog', () => {
  it('assembles base + twitter prompt with maxLength substitution', async () => {
    const config = createMockConfig({})
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'twitter', maxLength: 280 })

    const expected = `${BASE_PROMPT}\n\n${TWITTER_PROMPT}`
      .replaceAll('{{language}}', 'en')
      .replaceAll('{{maxLength}}', '280')
    expect(fakeProvider.lastRequest?.systemPrompt).toBe(expected)
    expect(fakeProvider.lastRequest?.maxLength).toBe(280)
  })

  it('assembles base + slack prompt', async () => {
    const config = createMockConfig({})
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'slack' })
    expect(fakeProvider.lastRequest?.systemPrompt).toContain(SLACK_PROMPT)
  })

  it('uses systemPromptOverrides per platform', async () => {
    const config = createMockConfig({
      ai: { systemPromptOverrides: { twitter: 'Twitter override {{maxLength}}' } },
    })
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'twitter', maxLength: 140 })
    expect(fakeProvider.lastRequest?.systemPrompt).toBe('Twitter override 140')
  })
})

describe('fallback modes', () => {
  it('warns and returns rawBody when fallback is raw (default)', async () => {
    const { logger } = await import('@maz-ui/node')
    fakeProvider = createFakeProvider({
      generate() { throw new Error('API down') },
    })
    const config = createMockConfig({})
    const result = await generateAIProviderReleaseBody({ config, rawBody: 'raw content' })
    expect(result).toBe('raw content')
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('AI generation failed'))
  })

  it('warns and returns rawBody when fallback is explicitly raw', async () => {
    fakeProvider = createFakeProvider({
      generate() { throw new Error('timeout') },
    })
    const config = createMockConfig({ ai: { fallback: 'raw' } })
    const result = await generateAISocialChangelog({ config, rawBody: 'fallback body', platform: 'slack' })
    expect(result).toBe('fallback body')
  })

  it('re-throws with context when fallback is fail', async () => {
    fakeProvider = createFakeProvider({
      generate() { throw new Error('API down') },
    })
    const config = createMockConfig({ ai: { fallback: 'fail' } })
    await expect(generateAIProviderReleaseBody({ config, rawBody: 'body' }))
      .rejects
      .toThrow('AI generation failed: API down')
  })
})

describe('unknown provider error', () => {
  it('propagates registry errors', async () => {
    vi.resetModules()

    const { getAIProvider: originalGetAIProvider } = await vi.importActual('../ai/registry') as typeof import('../ai/registry')

    const config = createMockConfig({ ai: { provider: 'nonexistent' as any } })
    await expect(async () => {
      const provider = originalGetAIProvider(config)
      await provider.safetyCheck(config)
    }).rejects.toThrow('Unknown AI provider')

    vi.restoreAllMocks()
  })
})
