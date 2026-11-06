import type { AIGenerateRequest, AIProvider } from '../ai/provider'
import type { ResolvedRelizyConfig } from '../config'
import { createMockConfig } from '../../../tests/mocks'
import { aiSafetyCheck, generateAIProviderReleaseBody, generateAISocialChangelog, generateAISocialReleases } from '../ai/index'
import { BASE_PROMPT, MAX_LENGTH_PROMPT, PROVIDER_RELEASE_PROMPT, RELEASES_PROMPT, SLACK_FORMAT_PROMPTS, SLACK_PROMPT, TWITTER_PROMPT, TWITTER_RELEASES_PROMPT, wrapChangelogPrompt } from '../ai/prompts'
import { setDryRunOptions, setProgressHandlers, takeReleaseFacts } from '../progress'

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
      return Promise.resolve({ text: 'AI generated output' })
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

  it('sends the context of the release to the provider', async () => {
    const config = createMockConfig({})
    const context = { project: 'relizy', version: '2.0.0', previousVersion: '1.14.3' }
    await generateAIProviderReleaseBody({ config, rawBody: 'body', context })
    expect(fakeProvider.lastRequest?.context).toEqual(context)
  })
})

describe('Given the changelog sent to the model', () => {
  it('When there is no context, Then only wraps it in the changelog tag', () => {
    expect(wrapChangelogPrompt('- feat a')).toMatch(/^<changelog>\n- feat a\n<\/changelog>\n\nRewrite the content/)
  })

  it('When the release is a major, Then tells it before the changelog', () => {
    const prompt = wrapChangelogPrompt('- feat a', { project: 'relizy', version: '2.0.0', previousVersion: '1.14.3' })
    expect(prompt.startsWith('<release-context>\nProject: relizy\nVersion: 2.0.0\nPrevious version: 1.14.3\nKind: major release\n</release-context>\n\n<changelog>\n- feat a\n</changelog>')).toBe(true)
  })

  it('When the version is a prerelease, Then tells it is not stable yet', () => {
    const prompt = wrapChangelogPrompt('- feat a', { project: 'relizy', version: '2.0.0-beta.1', previousVersion: '1.14.3' })
    expect(prompt).toContain('Kind: prerelease (beta), not a stable version yet')
  })

  it('When the previous version is unknown, Then gives the version only', () => {
    const prompt = wrapChangelogPrompt('- feat a', { project: '@acme/ui', version: '1.3.0' })
    expect(prompt.startsWith('<release-context>\nProject: @acme/ui\nVersion: 1.3.0\n</release-context>')).toBe(true)
  })
})

describe('generateAISocialChangelog', () => {
  it('assembles base + twitter prompt with maxLength substitution', async () => {
    const config = createMockConfig({})
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'twitter', maxLength: 280 })

    const expected = `${BASE_PROMPT}\n\n${TWITTER_PROMPT}\n\n${MAX_LENGTH_PROMPT}`
      .replaceAll('{{language}}', 'en')
      .replaceAll('{{maxLength}}', '280')
    expect(fakeProvider.lastRequest?.systemPrompt).toBe(expected)
  })

  it('assembles base + slack prompt, with the rules of the summary format by default', async () => {
    const config = createMockConfig({})
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'slack' })
    expect(fakeProvider.lastRequest?.systemPrompt).toBe(`${BASE_PROMPT}\n\n${SLACK_PROMPT}\n\n${SLACK_FORMAT_PROMPTS.summary}`.replaceAll('{{language}}', 'en'))
  })

  it('keeps every change of the slack message in the full format', async () => {
    const config = createMockConfig({ social: { slack: { changelogFormat: 'full' } } })
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'slack' })

    const systemPrompt = fakeProvider.lastRequest?.systemPrompt ?? ''
    expect(systemPrompt).toContain(SLACK_FORMAT_PROMPTS.full)
    expect(systemPrompt).not.toContain(SLACK_FORMAT_PROMPTS.summary)
  })

  it('sends the context of the release to the provider', async () => {
    const config = createMockConfig({})
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'twitter', maxLength: 280, context: { project: 'relizy', version: '2.0.0' } })
    expect(fakeProvider.lastRequest?.context).toEqual({ project: 'relizy', version: '2.0.0' })
  })

  it('adds the length budget to the slack prompt when provided', async () => {
    const config = createMockConfig({})
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'slack', maxLength: 2500 })
    expect(fakeProvider.lastRequest?.systemPrompt).toContain('Hard maximum: 2500 characters')
  })

  it('appends the global then the target extraGuidelines when given per target', async () => {
    const config = createMockConfig({
      ai: { extraGuidelines: { global: 'Global rule.', slack: 'Slack rule.', twitter: 'Twitter rule.' } },
    })
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'slack' })

    const systemPrompt = fakeProvider.lastRequest?.systemPrompt ?? ''
    expect(systemPrompt.endsWith('Global rule.\n\nSlack rule.')).toBe(true)
    expect(systemPrompt).not.toContain('Twitter rule.')
  })

  it('appends only the target extraGuidelines when no global ones are set', async () => {
    const config = createMockConfig({ ai: { extraGuidelines: { twitter: 'Twitter rule.' } } })
    await generateAISocialChangelog({ config, rawBody: 'body', platform: 'twitter', maxLength: 280 })
    expect(fakeProvider.lastRequest?.systemPrompt?.endsWith(`${MAX_LENGTH_PROMPT.replace('{{maxLength}}', '280')}\n\nTwitter rule.`)).toBe(true)
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

describe('generateAISocialReleases', () => {
  const releases = [
    { id: '1', title: 'Maz UI 7.0.0', body: '- feat a', highlights: 3 },
    { id: '2', title: '@scope/nav 1.3.0', body: '- fix b', highlights: 1 },
  ]

  it('sends every release in one call, with the release instructions even over an overridden prompt', async () => {
    const config = createMockConfig({ ai: { systemPromptOverrides: { twitter: 'Custom prompt' } } })

    await generateAISocialReleases({ config, releases, platform: 'twitter', maxLength: 200 })

    expect(fakeProvider.lastRequest?.systemPrompt).toBe(`Custom prompt\n\n${RELEASES_PROMPT}\n${TWITTER_RELEASES_PROMPT}`)
    expect(fakeProvider.lastRequest?.prompt).toBe('<release id="1" title="Maz UI 7.0.0" highlights="3">\n- feat a\n</release>\n\n<release id="2" title="@scope/nav 1.3.0" highlights="1">\n- fix b\n</release>')
  })

  it('returns the rewritten changelog of each release found in the output', async () => {
    fakeProvider = createFakeProvider({
      generate: () => Promise.resolve({ text: '<release id="2">\nFixed b\n</release>\n<release id="1" title="x">A is new</release>' }),
    })

    const result = await generateAISocialReleases({ config: createMockConfig({}), releases, platform: 'slack' })

    expect(result).toEqual(new Map([['2', 'Fixed b'], ['1', 'A is new']]))
  })

  it('leaves out the releases without changelog and skips the call when none has one', async () => {
    const result = await generateAISocialReleases({ config: createMockConfig({}), releases: [{ id: '1', title: 'a 1.0.0', body: '  ' }], platform: 'slack' })

    expect(result).toEqual(new Map())
    expect(fakeProvider.lastRequest).toBeUndefined()
  })

  it('returns no changelog when the call fails with the raw fallback, throws with the fail one', async () => {
    fakeProvider = createFakeProvider({ generate: () => Promise.reject(new Error('down')) })

    await expect(generateAISocialReleases({ config: createMockConfig({}), releases, platform: 'slack' })).resolves.toEqual(new Map())
    await expect(generateAISocialReleases({ config: createMockConfig({ ai: { fallback: 'fail' } }), releases, platform: 'slack' })).rejects.toThrow('AI generation failed: down')
  })
})

describe('Given the AI in a dry run', () => {
  const progress = vi.fn()
  const note = vi.fn()

  beforeEach(() => {
    setProgressHandlers({ progress, note, preview: vi.fn() })
    takeReleaseFacts()
    progress.mockClear()
    note.mockClear()
  })

  afterEach(() => {
    setProgressHandlers(undefined)
    setDryRunOptions({ ai: false })
  })

  it('Then simulates the rewrites without calling the provider, keeping the raw text', async () => {
    const generate = vi.fn()
    fakeProvider = createFakeProvider({ generate })
    const config = createMockConfig({})

    expect(await generateAIProviderReleaseBody({ config, rawBody: 'raw notes', label: 'v2.0.0', dryRun: true })).toBe('raw notes')
    expect(await generateAISocialChangelog({ config, rawBody: 'rich', fallbackBody: 'minified', platform: 'twitter', dryRun: true })).toBe('minified')
    expect(await generateAISocialReleases({ config, releases: [{ id: '1', title: 'a 1.0.0', body: 'body' }], platform: 'slack', dryRun: true })).toEqual(new Map())

    expect(generate).not.toHaveBeenCalled()
    expect(note).toHaveBeenCalledWith('The notes of v2.0.0: AI rewrite simulated (fake not called in dry run, see --ai-preview)', { ai: true })
    expect(note).toHaveBeenCalledWith('The Twitter post: AI rewrite simulated (fake not called in dry run, see --ai-preview)', { ai: true })
    expect(note).toHaveBeenCalledWith('The Slack post of 1 version: AI rewrite simulated (fake not called in dry run, see --ai-preview)', { ai: true })
    expect(takeReleaseFacts().aiRewrites).toEqual([
      { subject: 'the notes of v2.0.0', provider: 'fake', simulated: true },
      { subject: 'the Twitter post', provider: 'fake', simulated: true },
      { subject: 'the Slack post of 1 version', provider: 'fake', simulated: true },
    ])
  })

  it('Then calls the provider with --ai-preview', async () => {
    setDryRunOptions({ ai: true })
    const config = createMockConfig({})

    expect(await generateAIProviderReleaseBody({ config, rawBody: 'raw notes', label: 'v2.0.0', dryRun: true })).toBe('AI generated output')
    expect(fakeProvider.lastRequest?.prompt).toBe('raw notes')
  })

  it('Then shows the rewrite while it runs, then its duration, tokens and cost', async () => {
    fakeProvider = createFakeProvider({
      generate: () => Promise.resolve({ text: 'rewritten', usage: { inputTokens: 1800, outputTokens: 450, costUsd: 0.0123 } }),
    })
    const config = createMockConfig({})

    expect(await generateAIProviderReleaseBody({ config, rawBody: 'raw notes', label: 'v2.0.0' })).toBe('rewritten')

    expect(progress).toHaveBeenCalledWith('Rewriting the notes of v2.0.0 with AI (fake)', { ai: true })
    expect(note).toHaveBeenCalledWith(expect.stringMatching(/^The notes of v2\.0\.0 rewritten by AI \(fake\) in \d+ms, 2\.3k tokens, \$0\.012$/), { ai: true })
    expect(takeReleaseFacts().aiRewrites).toEqual([
      { subject: 'the notes of v2.0.0', provider: 'fake', simulated: false, durationMs: expect.any(Number), inputTokens: 1800, outputTokens: 450, costUsd: 0.0123 },
    ])
  })

  it('Then records each call of a release with its own usage, so they add up', async () => {
    const usages = [{ inputTokens: 1000, outputTokens: 200, costUsd: 0.01 }, { inputTokens: 500, outputTokens: 100, costUsd: 0.005 }]
    fakeProvider = createFakeProvider({ generate: () => Promise.resolve({ text: 'rewritten', usage: usages.shift() }) })
    const config = createMockConfig({})

    await generateAIProviderReleaseBody({ config, rawBody: 'raw notes', label: 'v2.0.0' })
    await generateAISocialChangelog({ config, rawBody: 'rich', platform: 'twitter', maxLength: 200 })

    expect(takeReleaseFacts().aiRewrites.map(({ inputTokens, outputTokens, costUsd }) => ({ inputTokens, outputTokens, costUsd }))).toEqual([
      { inputTokens: 1000, outputTokens: 200, costUsd: 0.01 },
      { inputTokens: 500, outputTokens: 100, costUsd: 0.005 },
    ])
  })

  it('Then shows no usage when the provider gives none', async () => {
    await generateAIProviderReleaseBody({ config: createMockConfig({}), rawBody: 'raw notes', label: 'v2.0.0' })

    expect(note).toHaveBeenCalledWith(expect.stringMatching(/^The notes of v2\.0\.0 rewritten by AI \(fake\) in \d+ms$/), { ai: true })
  })
})
