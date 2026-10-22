import type { ResolvedRelizyConfig } from '../config'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { MockLanguageModelV3, MockLanguageModelV4 } from 'ai/test'
import { createMockConfig } from '../../../tests/mocks'
import { aiSafetyCheck, generateAIProviderReleaseBody, generateAISocialChangelog } from '../ai'
import { aiSdkProvider } from '../ai/providers/ai-sdk'
import { loadRelizyConfig } from '../config'

/**
 * Integration tests of the ai-sdk provider: `ai` is not mocked, the real
 * `generateText` runs against the mock models of the AI SDK (`ai/test`).
 */

const RAW_BODY = '### 🚀 Enhancements\n\n- Add the a feature ([bce8ce9](https://github.com/demo/demo/commit/bce8ce9))'

function generateResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: 'stop' },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 5, text: 5, reasoning: 0 },
    },
    warnings: [],
  }
}

function createModel(output: string | Error = '  AI rewritten notes  ') {
  return new MockLanguageModelV4({
    doGenerate: () => output instanceof Error ? Promise.reject(output) : Promise.resolve(generateResult(output)),
  })
}

function createConfig(model: unknown, ai: Record<string, unknown> = {}): ResolvedRelizyConfig {
  const config = createMockConfig({})
  config.ai = {
    ...config.ai,
    provider: 'ai-sdk',
    ...ai,
    providers: { 'ai-sdk': { model, ...(ai.providers as object) } },
  } as ResolvedRelizyConfig['ai']

  return config
}

/** System and user messages sent to the model by the last call */
function lastMessages(model: MockLanguageModelV4 | MockLanguageModelV3) {
  const call = model.doGenerateCalls.at(-1)!
  const [system, user] = call.prompt as any[]

  return {
    call,
    // Only in the call options of the current specification (V4)
    reasoning: (call as { reasoning?: string }).reasoning,
    system: system.content as string,
    user: user.content.map((part: { text: string }) => part.text).join(''),
  }
}

describe('Given the ai-sdk provider with the mock models of the AI SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When generating', () => {
    it('Then sends the system prompt as instructions and the changelog wrapped in the <changelog> tag', async () => {
      const model = createModel()
      const result = await aiSdkProvider.generate(createConfig(model), { systemPrompt: 'Rewrite the notes.', prompt: RAW_BODY })

      const { call, system, user } = lastMessages(model)
      expect(call.prompt.map(message => message.role)).toEqual(['system', 'user'])
      expect(system).toBe('Rewrite the notes.')
      expect(user).toContain(`<changelog>\n${RAW_BODY}\n</changelog>`)
      expect(user).toContain('Output ONLY the rewritten content')
      expect(result).toBe('AI rewritten notes')
    })

    it('Then sends no tool and lets the provider default reasoning apply', async () => {
      const model = createModel()
      await aiSdkProvider.generate(createConfig(model), { systemPrompt: 'Rewrite.', prompt: RAW_BODY })

      const { call, reasoning } = lastMessages(model)
      expect(reasoning).toBeUndefined()
      expect(call.tools ?? []).toEqual([])
      expect(model.doGenerateCalls).toHaveLength(1)
    })

    it('Then sends the configured reasoning effort', async () => {
      const model = createModel()
      await aiSdkProvider.generate(createConfig(model, { providers: { reasoning: 'low' } }), { systemPrompt: 'Rewrite.', prompt: RAW_BODY })

      expect(lastMessages(model).reasoning).toBe('low')
    })

    it('Then works with a model of the previous specification (provider packages of the previous major)', async () => {
      const model = new MockLanguageModelV3({ doGenerate: () => Promise.resolve(generateResult('v3 notes') as any) })
      const result = await aiSdkProvider.generate(createConfig(model), { systemPrompt: 'Rewrite.', prompt: RAW_BODY })

      expect(result).toBe('v3 notes')
      expect(lastMessages(model).user).toContain(RAW_BODY)
    })

    it('Then rejects with the error of the model', async () => {
      const model = createModel(new Error('quota exceeded'))

      await expect(aiSdkProvider.generate(createConfig(model), { systemPrompt: 'Rewrite.', prompt: RAW_BODY })).rejects.toThrow('quota exceeded')
    })
  })

  describe('When running the safety check', () => {
    it('Then passes with a configured model', async () => {
      await expect(aiSafetyCheck({ config: createConfig(createModel()) })).resolves.toBeUndefined()
    })

    it('Then fails without a model', async () => {
      await expect(aiSafetyCheck({ config: createConfig(undefined) })).rejects.toThrow('No model configured for the ai-sdk provider')
    })
  })

  describe('When rewriting the release notes', () => {
    it('Then returns the output of the model, generated with the release notes rules and the configured language', async () => {
      const model = createModel()
      const result = await generateAIProviderReleaseBody({ config: createConfig(model, { language: 'fr' }), rawBody: RAW_BODY })

      const { system, user } = lastMessages(model)
      expect(result).toBe('AI rewritten notes')
      expect(system).toContain('You are a release-notes rewriter.')
      expect(system).toContain('Format the output as markdown with "### <Type>" sections')
      expect(system).toContain('Output language: fr.')
      expect(user).toContain(RAW_BODY)
    })

    it('Then uses the extra guidelines and the system prompt overrides', async () => {
      const withGuidelines = createModel()
      await generateAIProviderReleaseBody({ config: createConfig(withGuidelines, { extraGuidelines: 'Mention the ticket ids.' }), rawBody: RAW_BODY })
      expect(lastMessages(withGuidelines).system).toContain('Mention the ticket ids.')

      const withOverride = createModel()
      await generateAIProviderReleaseBody({
        config: createConfig(withOverride, { language: 'de', systemPromptOverrides: { providerRelease: 'Custom prompt in {{language}}.' } }),
        rawBody: RAW_BODY,
      })
      expect(lastMessages(withOverride).system).toBe('Custom prompt in de.')
    })

    it('Then does not call the model for an empty changelog', async () => {
      const model = createModel()
      const result = await generateAIProviderReleaseBody({ config: createConfig(model), rawBody: '  \n' })

      expect(result).toBe('  \n')
      expect(model.doGenerateCalls).toHaveLength(0)
    })

    it('Then falls back to the raw changelog when the model fails (fallback: raw)', async () => {
      const model = createModel(new Error('quota exceeded'))
      const result = await generateAIProviderReleaseBody({ config: createConfig(model, { fallback: 'raw' }), rawBody: RAW_BODY })

      expect(result).toBe(RAW_BODY)
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('quota exceeded'))
    })

    it('Then fails when the model fails (fallback: fail)', async () => {
      const model = createModel(new Error('quota exceeded'))

      await expect(generateAIProviderReleaseBody({ config: createConfig(model, { fallback: 'fail' }), rawBody: RAW_BODY })).rejects.toThrow('AI generation failed: quota exceeded')
    })

    it('Then falls back to the raw changelog without a model when the safety check is skipped', async () => {
      const result = await generateAIProviderReleaseBody({ config: createConfig(undefined, { fallback: 'raw' }), rawBody: RAW_BODY })

      expect(result).toBe(RAW_BODY)
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No model configured for the ai-sdk provider'))
    })
  })

  describe('When rewriting the social posts', () => {
    it('Then generates the Twitter post with its rules and its max length', async () => {
      const model = createModel('🚀 New release')
      const result = await generateAISocialChangelog({ config: createConfig(model), rawBody: RAW_BODY, platform: 'twitter', maxLength: 180 })

      const { system, user } = lastMessages(model)
      expect(result).toBe('🚀 New release')
      expect(system).toContain('Output plain text')
      expect(system).toContain('Hard maximum: 180 characters')
      expect(user).toContain(RAW_BODY)
    })

    it('Then generates the Slack post with its rules', async () => {
      const model = createModel('**New release**')
      const result = await generateAISocialChangelog({ config: createConfig(model), rawBody: RAW_BODY, platform: 'slack', maxLength: 2500 })

      const { system } = lastMessages(model)
      expect(result).toBe('**New release**')
      expect(system).toContain('standard markdown')
      expect(system).toContain('Hard maximum: 2500 characters')
    })

    it('Then returns the fallback body when the model fails', async () => {
      const model = createModel(new Error('timeout'))
      const result = await generateAISocialChangelog({ config: createConfig(model), rawBody: RAW_BODY, fallbackBody: 'minified body', platform: 'twitter', maxLength: 280 })

      expect(result).toBe('minified body')
    })
  })

  describe('When the model is set in the config file', () => {
    let cwd: string

    beforeEach(() => {
      // Inside node_modules so that the config file resolves `ai` like a project would
      const cacheDir = join(process.cwd(), 'node_modules', '.cache')
      mkdirSync(cacheDir, { recursive: true })
      cwd = mkdtempSync(join(cacheDir, 'relizy-ai-sdk-'))
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }))
    })

    afterEach(() => {
      rmSync(cwd, { recursive: true, force: true })
    })

    it('Then keeps the model instance through the config loading and generates with it', async () => {
      writeFileSync(join(cwd, 'relizy.config.ts'), `
import { MockLanguageModelV4 } from 'ai/test'

export default {
  ai: {
    provider: 'ai-sdk',
    providers: {
      'ai-sdk': {
        reasoning: 'low',
        model: new MockLanguageModelV4({
          modelId: 'mock-from-config',
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'notes from the config model' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
            warnings: [],
          }),
        }),
      },
    },
  },
}
`)

      const config = await loadRelizyConfig({ overrides: { cwd } })
      const model = config.ai.providers?.['ai-sdk']?.model

      expect(model).toBeInstanceOf(MockLanguageModelV4)
      expect((model as MockLanguageModelV4).modelId).toBe('mock-from-config')

      await expect(aiSafetyCheck({ config })).resolves.toBeUndefined()
      expect(await generateAIProviderReleaseBody({ config, rawBody: RAW_BODY })).toBe('notes from the config model')
      expect(lastMessages(model as MockLanguageModelV4).reasoning).toBe('low')
    })

    it('Then loads a model referencing itself and keeps its secrets out of the config dump', async () => {
      writeFileSync(join(cwd, 'relizy.config.ts'), `
import { MockLanguageModelV4 } from 'ai/test'

const model = new MockLanguageModelV4({ modelId: 'circular' })
// A provider client holding a secret and pointing back to its model
model.client = { apiKey: 'sk-secret-1234567890', headers: () => ({ authorization: 'Bearer HEADER-SECRET' }), model }

export default {
  ai: { provider: 'ai-sdk', providers: { 'ai-sdk': { model } } },
}
`)

      const config = await loadRelizyConfig({ overrides: { cwd } })
      const dump = vi.mocked(logger.debug).mock.calls.find(([label]) => label === 'Resolved config:')?.[1] as string

      expect((config.ai.providers?.['ai-sdk']?.model as MockLanguageModelV4).modelId).toBe('circular')
      expect(dump).toContain('"model": "[Circular]"')
      expect(dump).not.toContain('sk-secret-1234567890')
      expect(dump).not.toContain('HEADER-SECRET')
    })
  })
})
