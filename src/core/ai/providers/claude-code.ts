import type { ResolvedRelizyConfig } from '../../config'
import type { AIGenerateRequest, AIProvider } from '../provider'
import { spawnSync } from 'node:child_process'
import { logger } from '@maz-ui/node'

function claudeBinaryAvailable(): boolean {
  try {
    const result = spawnSync('claude', ['--version'], { stdio: 'ignore' })
    return result.status === 0
  }
  catch {
    return false
  }
}

function resolveAuth(config: ResolvedRelizyConfig) {
  const providerOpts = config.ai?.providers?.['claude-code']
  const tokenOpts = config.tokens?.ai?.['claude-code']

  return {
    apiKey: providerOpts?.apiKey ?? tokenOpts?.apiKey,
    oauthToken: providerOpts?.oauthToken ?? tokenOpts?.oauthToken,
  }
}

export const claudeCodeProvider: AIProvider = {
  name: 'claude-code',

  async safetyCheck(config: ResolvedRelizyConfig): Promise<void> {
    const { apiKey, oauthToken } = resolveAuth(config)

    if (!apiKey && !oauthToken) {
      throw new Error(
        'No authentication credential found for claude-code provider. '
        + 'Set one of: ANTHROPIC_API_KEY, RELIZY_ANTHROPIC_API_KEY, '
        + 'CLAUDE_CODE_OAUTH_TOKEN, RELIZY_CLAUDE_CODE_OAUTH_TOKEN, '
        + 'or configure ai.providers[\'claude-code\'].apiKey / oauthToken.',
      )
    }

    try {
      await import('@yoloship/claude-sdk')
    }
    catch {
      throw new Error(
        '@yoloship/claude-sdk is not installed. Install it with: pnpm add -D @yoloship/claude-sdk',
      )
    }

    if (!claudeBinaryAvailable()) {
      throw new Error(
        'The `claude` CLI binary was not found on PATH. '
        + 'Install it with one of:\n'
        + '  • npm install -g @anthropic-ai/claude-code\n'
        + '  • brew install --cask claude-code\n'
        + '  • curl -fsSL https://claude.ai/install.sh | bash',
      )
    }
  },

  async generate(config: ResolvedRelizyConfig, request: AIGenerateRequest): Promise<string> {
    const { claudeRun } = await import('@yoloship/claude-sdk')
    const auth = resolveAuth(config)
    const model = config.ai?.providers?.['claude-code']?.model

    const wrappedPrompt = `<changelog>\n${request.prompt}\n</changelog>\n\nRewrite the content inside the <changelog> tag per the rules in the system prompt. Output ONLY the rewritten content, with no preamble, no explanation, no surrounding tags.`

    const hasAuth = !!(auth.apiKey || auth.oauthToken)
    const result = await claudeRun(
      {
        systemPrompt: request.systemPrompt,
        prompt: wrappedPrompt,
        maxTurns: 1,
        effort: 'low',
        disableSlashCommands: true,
        noSessionPersistence: true,
        allowedTools: [],
        settingSources: ['project'],
        ...(model && { model }),
      },
      hasAuth ? auth : undefined,
    )

    logger.verbose('Claude SDK events:', result.events?.map(e => e.type).join(', '))

    return (result.output ?? '').trim()
  },
}
