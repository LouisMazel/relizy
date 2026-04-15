import { createMockConfig } from '../../../tests/mocks'
import { getAIProvider } from '../ai/registry'

describe('getAIProvider', () => {
  it('returns claude-code provider by default', () => {
    const config = createMockConfig({})
    const provider = getAIProvider(config)
    expect(provider.name).toBe('claude-code')
  })

  it('returns claude-code provider when explicitly configured', () => {
    const config = createMockConfig({ ai: { provider: 'claude-code' } })
    const provider = getAIProvider(config)
    expect(provider.name).toBe('claude-code')
  })

  it('throws with available providers for unknown provider', () => {
    const config = createMockConfig({ ai: { provider: 'unknown' as any } })
    expect(() => getAIProvider(config)).toThrow('Unknown AI provider "unknown"')
    expect(() => getAIProvider(config)).toThrow('Available providers: claude-code')
  })

  it('falls back to claude-code when ai config is absent', () => {
    const config = createMockConfig({})
    delete (config as any).ai
    const provider = getAIProvider(config)
    expect(provider.name).toBe('claude-code')
  })

  it('falls back to claude-code when provider is undefined', () => {
    const config = createMockConfig({ ai: {} })
    delete (config.ai as any).provider
    const provider = getAIProvider(config)
    expect(provider.name).toBe('claude-code')
  })
})
