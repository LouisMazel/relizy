import { describe, expect, it } from 'vitest'
import { redactSecrets } from '../redact'

describe('Given redactSecrets function', () => {
  describe('When values live under the tokens container', () => {
    it('Then masks every token value but keeps a recognizable extract', () => {
      const result = redactSecrets({
        tokens: {
          registry: 'npm_ZJLIEE5NB9oDZIqNrHqAbST62Hwk',
          github: 'github_pat_11ACYEURI0Az3sxaTxp0Ia',
        },
      })

      // long secrets keep their first/last 4 chars, the middle is masked
      expect(result.tokens.registry).not.toContain('ZJLIEE5NB9oDZIqNrHqAbST62Hwk')
      expect(result.tokens.registry).toBe('npm_***2Hwk')
      expect(result.tokens.github).not.toContain('11ACYEURI0Az3sxaTxp0Ia')
      expect(result.tokens.github).toBe('gith***p0Ia')
    })

    it('Then fully masks short secrets (no extract revealed)', () => {
      const result = redactSecrets({
        tokens: { twitter: { apiKey: 'tw-key', apiKeySecret: 'short-secret' } },
      })

      expect(result.tokens.twitter.apiKey).toBe('***')
      expect(result.tokens.twitter.apiKeySecret).toBe('***')
    })
  })

  describe('When sensitive keys appear outside the tokens container', () => {
    it('Then masks them by key name', () => {
      const result = redactSecrets({
        publish: { token: 'npm_FAKE000ZJLIEE5NB9oDZIqNr', registry: 'https://registry.npmjs.org/' },
        repo: { token: 'short', repo: 'owner/name' },
        social: { slack: { credentials: { token: 'xoxb-secret' }, webhookUrl: 'https://hooks.slack.com/services/AAAA/BBBB/CCCC' } },
        ai: { providers: { 'claude-code': { oauthToken: 'sk-ant-oat01-abcdefghij', apiKey: 'ai-key' } } },
      })

      expect(result.publish.token).not.toContain('FAKE000ZJLIEE5NB9oDZIqNr')
      expect(result.publish.token).toBe('npm_***IqNr')
      expect(result.repo.token).toBe('***')
      expect(result.social.slack.credentials.token).toBe('***')
      expect(result.social.slack.webhookUrl).not.toContain('AAAA')
      expect(result.ai.providers['claude-code'].oauthToken).not.toContain('abcdefghij')
      expect(result.ai.providers['claude-code'].apiKey).toBe('***')
    })
  })

  describe('When values are not sensitive', () => {
    it('Then leaves them untouched', () => {
      const result = redactSecrets({
        publish: { registry: 'https://registry.npmjs.org/', access: 'public' },
        repo: { repo: 'owner/name', provider: 'github' },
        version: '1.2.0',
      })

      expect(result.publish.registry).toBe('https://registry.npmjs.org/')
      expect(result.publish.access).toBe('public')
      expect(result.repo.repo).toBe('owner/name')
      expect(result.version).toBe('1.2.0')
    })
  })

  describe('When given an object', () => {
    it('Then does not mutate the original', () => {
      const original = { tokens: { github: 'github_pat_secret' } }

      redactSecrets(original)

      expect(original.tokens.github).toBe('github_pat_secret')
    })
  })

  describe('When empty or nullish values are present', () => {
    it('Then keeps them as-is', () => {
      const result = redactSecrets({
        tokens: { registry: '', github: undefined, twitter: {} },
        publish: { token: null },
      })

      expect(result.tokens.registry).toBe('')
      expect(result.tokens.github).toBeUndefined()
      expect(result.tokens.twitter).toEqual({})
      expect(result.publish.token).toBeNull()
    })
  })
})
