import type { ResolvedRelizyConfig } from '../config'

export interface AIGenerateRequest {
  systemPrompt: string
  prompt: string
  maxLength?: number
}

export interface AIProvider {
  name: string
  safetyCheck: (config: ResolvedRelizyConfig) => void | Promise<void>
  generate: (config: ResolvedRelizyConfig, request: AIGenerateRequest) => Promise<string>
}
