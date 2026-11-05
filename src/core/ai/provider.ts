import type { ResolvedRelizyConfig } from '../config'
import type { AIReleaseContext } from './prompts'

export interface AIGenerateRequest {
  systemPrompt: string
  prompt: string
  maxLength?: number
  /**
   * Sent before the changelog, so the model knows the release
   */
  context?: AIReleaseContext
}

export interface AIProvider {
  name: string
  safetyCheck: (config: ResolvedRelizyConfig) => void | Promise<void>
  generate: (config: ResolvedRelizyConfig, request: AIGenerateRequest) => Promise<string>
}
