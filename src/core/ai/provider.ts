import type { ResolvedRelizyConfig } from '../config'
import type { AIUsage } from '../progress'
import type { AIReleaseContext } from './prompts'

export interface AIGenerateRequest {
  systemPrompt: string
  prompt: string
  /**
   * Sent before the changelog, so the model knows the release
   */
  context?: AIReleaseContext
}

export interface AIGenerateResult {
  text: string
  /**
   * The tokens and the cost of the call, when the provider gives them
   */
  usage?: AIUsage
}

export interface AIProvider {
  name: string
  safetyCheck: (config: ResolvedRelizyConfig) => void | Promise<void>
  generate: (config: ResolvedRelizyConfig, request: AIGenerateRequest) => Promise<AIGenerateResult>
}
