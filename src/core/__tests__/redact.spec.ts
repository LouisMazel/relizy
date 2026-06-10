import { describe, expect, it } from 'vitest'
import { redactSecrets } from '../redact'

describe('Given redactSecrets function', () => {
  describe('When values live under the tokens container', () => {
    it('Then masks every token value regardless of the key name', () => {
      const result = redactSecrets({
        tokens: {
          registry: 'npm_ZJLIEE5NB9oDZIqNrHqAbST62Hwk',
          github: 'github_pat_11ACYEURI0Az3sxaTxp0Ia',
          twitter: { apiKey: 'tw-key', apiKeySecret: 'tw-secret' },
        },
      })

      expect(result.tokens.registry).toBe('[redacted]')
      expect(result.tokens.github).toBe('[redacted]')
      expect(result.tokens.twitter.apiKey).toBe('[redacted]')
      expect(result.tokens.twitter.apiKeySecret).toBe('[redacted]')
    })
  })

  describe('When sensitive keys appear outside the tokens container', () => {
    it('Then masks them by key name', () => {
      const result = redactSecrets({
        publish: { token: 'npm_secret', registry: 'https://registry.npmjs.org/' },
        repo: { token: 'gh_secret', repo: 'owner/name' },
        social: { slack: { credentials: { token: 'xoxb-secret' }, webhookUrl: 'https://hooks.slack.com/services/T/B/X' } },
        ai: { providers: { 'claude-code': { oauthToken: 'oauth-secret', apiKey: 'ai-key' } } },
      })

      expect(result.publish.token).toBe('[redacted]')
      expect(result.repo.token).toBe('[redacted]')
      expect(result.social.slack.credentials.token).toBe('[redacted]')
      expect(result.social.slack.webhookUrl).toBe('[redacted]')
      expect(result.ai.providers['claude-code'].oauthToken).toBe('[redacted]')
      expect(result.ai.providers['claude-code'].apiKey).toBe('[redacted]')
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
