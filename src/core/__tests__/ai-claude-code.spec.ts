import type { AIGenerateRequest } from '../ai/provider'
import { createMockConfig } from '../../../tests/mocks'

const mockClaudeRun = vi.fn()
const mockSpawnSync = vi.fn<(...args: any[]) => { status: number | null }>(() => ({ status: 0 }))

vi.mock('node:child_process', () => ({
  spawnSync: (...args: any[]) => mockSpawnSync(...args),
}))

vi.mock('@yoloship/claude-sdk', () => ({
  claudeRun: (...args: unknown[]) => mockClaudeRun(...args),
}))

const { claudeCodeProvider } = await import('../ai/providers/claude-code')

describe('claudeCodeProvider', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mockClaudeRun.mockReset()
    mockSpawnSync.mockReset()
    mockSpawnSync.mockReturnValue({ status: 0 })
  })

  it('has name claude-code', () => {
    expect(claudeCodeProvider.name).toBe('claude-code')
  })

  describe('safetyCheck', () => {
    it('passes when apiKey is set in provider config', async () => {
      const config = createMockConfig({
        ai: { providers: { 'claude-code': { apiKey: 'sk-test' } } },
      })
      await expect(claudeCodeProvider.safetyCheck(config)).resolves.toBeUndefined()
    })

    it('passes when apiKey is set in tokens config', async () => {
      const config = createMockConfig({
        tokens: { ai: { 'claude-code': { apiKey: 'sk-test' } } },
      })
      await expect(claudeCodeProvider.safetyCheck(config)).resolves.toBeUndefined()
    })

    it('passes when ANTHROPIC_API_KEY env var is set', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-env')
      const config = createMockConfig({})
      await expect(claudeCodeProvider.safetyCheck(config)).resolves.toBeUndefined()
    })

    it('passes when RELIZY_ANTHROPIC_API_KEY env var is set', async () => {
      vi.stubEnv('RELIZY_ANTHROPIC_API_KEY', 'sk-env')
      const config = createMockConfig({})
      await expect(claudeCodeProvider.safetyCheck(config)).resolves.toBeUndefined()
    })

    it('passes when CLAUDE_CODE_OAUTH_TOKEN env var is set', async () => {
      vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', 'oauth-token')
      const config = createMockConfig({})
      await expect(claudeCodeProvider.safetyCheck(config)).resolves.toBeUndefined()
    })

    it('passes when oauthToken is set in provider config', async () => {
      const config = createMockConfig({
        ai: { providers: { 'claude-code': { oauthToken: 'oauth-test' } } },
      })
      await expect(claudeCodeProvider.safetyCheck(config)).resolves.toBeUndefined()
    })

    it('throws when no auth credential is available', async () => {
      const config = createMockConfig({})
      await expect(claudeCodeProvider.safetyCheck(config)).rejects.toThrow(
        'No authentication credential found for claude-code provider',
      )
    })

    it('throws when the claude CLI binary is not on PATH', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
      mockSpawnSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      const config = createMockConfig({})
      await expect(claudeCodeProvider.safetyCheck(config)).rejects.toThrow(
        /`claude` CLI binary was not found/,
      )
    })

    it('throws when the claude CLI binary exits non-zero', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
      mockSpawnSync.mockReturnValue({ status: 1 })

      const config = createMockConfig({})
      await expect(claudeCodeProvider.safetyCheck(config)).rejects.toThrow(
        /`claude` CLI binary was not found/,
      )
    })

    it('resolves auth in priority order: provider config > tokens > env', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-env')
      const config = createMockConfig({
        ai: { providers: { 'claude-code': { apiKey: 'sk-provider' } } },
        tokens: { ai: { 'claude-code': { apiKey: 'sk-tokens' } } },
      })
      await expect(claudeCodeProvider.safetyCheck(config)).resolves.toBeUndefined()
    })
  })

  describe('generate', () => {
    const request: AIGenerateRequest = {
      systemPrompt: 'You are helpful.',
      prompt: 'Summarize changes',
    }

    it('calls claudeRun with system prompt, wrapped user prompt, and auth; returns trimmed output', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
      mockClaudeRun.mockResolvedValue({ output: '  Result text  ' })

      const config = createMockConfig({})
      const result = await claudeCodeProvider.generate(config, request)

      expect(result).toBe('Result text')

      const [options, auth] = mockClaudeRun.mock.calls[0]
      expect(options.systemPrompt).toBe('You are helpful.')
      expect(options.prompt).toContain('<changelog>')
      expect(options.prompt).toContain('Summarize changes')
      expect(options.prompt).toContain('</changelog>')
      expect(auth).toEqual({ apiKey: 'sk-test', oauthToken: undefined })
    })

    it('ignores maxLength (not forwarded to claudeRun options)', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
      mockClaudeRun.mockResolvedValue({ output: 'short' })

      const config = createMockConfig({})
      await claudeCodeProvider.generate(config, { ...request, maxLength: 100 })

      const [options] = mockClaudeRun.mock.calls[0]
      expect(options).not.toHaveProperty('maxLength')
    })

    it('passes model when configured', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
      mockClaudeRun.mockResolvedValue({ output: 'result' })

      const config = createMockConfig({
        ai: { providers: { 'claude-code': { model: 'sonnet' } } },
      })
      await claudeCodeProvider.generate(config, request)

      const [options] = mockClaudeRun.mock.calls[0]
      expect(options.model).toBe('sonnet')
    })

    it('passes oauthToken as auth when apiKey is not available', async () => {
      vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', 'oauth-tok')
      mockClaudeRun.mockResolvedValue({ output: 'result' })

      const config = createMockConfig({})
      await claudeCodeProvider.generate(config, request)

      const [, auth] = mockClaudeRun.mock.calls[0]
      expect(auth).toEqual({ apiKey: undefined, oauthToken: 'oauth-tok' })
    })

    it('prefers provider config apiKey over env var', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-env')
      mockClaudeRun.mockResolvedValue({ output: 'result' })

      const config = createMockConfig({
        ai: { providers: { 'claude-code': { apiKey: 'sk-provider' } } },
      })
      await claudeCodeProvider.generate(config, request)

      const [, auth] = mockClaudeRun.mock.calls[0]
      expect(auth?.apiKey).toBe('sk-provider')
    })

    it('omits the auth argument when no credentials are available', async () => {
      mockClaudeRun.mockResolvedValue({ output: 'result' })

      const config = createMockConfig({})
      await claudeCodeProvider.generate(config, request)

      const [, auth] = mockClaudeRun.mock.calls[0]
      expect(auth).toBeUndefined()
    })

    it('falls back to tokens.ai.apiKey when ai.providers has no apiKey', async () => {
      mockClaudeRun.mockResolvedValue({ output: 'result' })

      const config = createMockConfig({
        tokens: { ai: { 'claude-code': { apiKey: 'sk-from-tokens' } } },
      })
      await claudeCodeProvider.generate(config, request)

      const [, auth] = mockClaudeRun.mock.calls[0]
      expect(auth).toEqual({ apiKey: 'sk-from-tokens', oauthToken: undefined })
    })

    it('falls back to tokens.ai.oauthToken when ai.providers has no oauthToken', async () => {
      mockClaudeRun.mockResolvedValue({ output: 'result' })

      const config = createMockConfig({
        tokens: { ai: { 'claude-code': { oauthToken: 'oauth-from-tokens' } } },
      })
      await claudeCodeProvider.generate(config, request)

      const [, auth] = mockClaudeRun.mock.calls[0]
      expect(auth).toEqual({ apiKey: undefined, oauthToken: 'oauth-from-tokens' })
    })

    it('omits model when not configured', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
      mockClaudeRun.mockResolvedValue({ output: 'result' })

      const config = createMockConfig({})
      delete (config.ai as any)?.providers
      await claudeCodeProvider.generate(config, request)

      const [options] = mockClaudeRun.mock.calls[0]
      expect(options).not.toHaveProperty('model')
    })

    it('handles null output from SDK', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
      mockClaudeRun.mockResolvedValue({ output: undefined })

      const config = createMockConfig({})
      const result = await claudeCodeProvider.generate(config, request)

      expect(result).toBe('')
    })

    it('logs event types when SDK returns events', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
      mockClaudeRun.mockResolvedValue({
        output: 'done',
        events: [{ type: 'thinking' }, { type: 'output' }, { type: 'result' }],
      })

      const config = createMockConfig({})
      const result = await claudeCodeProvider.generate(config, request)

      expect(result).toBe('done')
    })
  })

  describe('safetyCheck when SDK is not installed', () => {
    it('throws with install instructions', async () => {
      vi.resetModules()
      vi.doMock('@yoloship/claude-sdk', () => {
        throw new Error('Cannot find module')
      })

      const { claudeCodeProvider: providerFresh } = await import('../ai/providers/claude-code')
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
      const config = createMockConfig({
        ai: { providers: { 'claude-code': { apiKey: 'sk-test' } } },
      })

      await expect(providerFresh.safetyCheck(config)).rejects.toThrow(
        '@yoloship/claude-sdk is not installed',
      )

      vi.doUnmock('@yoloship/claude-sdk')
      vi.resetModules()
    })
  })
})
