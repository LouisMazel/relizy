import type { ResolvedRelizyConfig } from '../config'
import type { AIProvider } from './provider'
import { claudeCodeProvider } from './providers/claude-code'

const providers: Record<string, AIProvider> = {
  'claude-code': claudeCodeProvider,
}

export function getAIProvider(config: ResolvedRelizyConfig): AIProvider {
  const name = config.ai?.provider ?? 'claude-code'
  const provider = providers[name]

  if (!provider) {
    const available = Object.keys(providers).join(', ')
    throw new Error(`Unknown AI provider "${name}". Available providers: ${available}`)
  }

  return provider
}
