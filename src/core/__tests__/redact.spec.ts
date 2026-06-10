import { describe, expect, it } from 'vitest'
import { maskTokens, redactSecrets } from '../redact'

describe('Given maskTokens function', () => {
  describe('When the string contains an npm token inside an _authToken assignment', () => {
    it('Then masks the assigned value', () => {
      const result = maskTokens('npm whoami --//registry.npmjs.org/:_authToken=npm_ZJLIEE5NB9oDZIqNrHqAbST62Hwk')

      expect(result).not.toContain('ZJLIEE5NB9oDZIqNrHqAbST62Hwk')
      expect(result).toContain('_authToken=[redacted]')
    })
  })

  describe('When the string contains a standalone npm token', () => {
    it('Then masks it while keeping the prefix', () => {
      const result = maskTokens('published with npm_ZJLIEE5NB9oDZIqNrHqAbST62Hwk')

      expect(result).not.toContain('ZJLIEE5NB9oDZIqNrHqAbST62Hwk')
      expect(result).toContain('npm_[redacted]')
    })
  })

  describe('When the string contains a GitHub PAT', () => {
    it('Then masks it while keeping the prefix', () => {
      const result = maskTokens('token github_pat_11ACYEURI0Az3sxaTxp0Ia_tP3Y5nkgNIbET91bPjdEk')

      expect(result).not.toContain('11ACYEURI0Az3sxaTxp0Ia')
      expect(result).toContain('github_pat_[redacted]')
    })
  })

  describe('When the string contains a GitLab token or a Slack token', () => {
    it('Then masks both', () => {
      const result = maskTokens('glpat-ABCDEFGHIJKLMNOPQRST and xoxb-1234567890-abcdEFGH')

      expect(result).not.toContain('ABCDEFGHIJKLMNOPQRST')
      expect(result).not.toContain('1234567890-abcdEFGH')
      expect(result).toContain('glpat-[redacted]')
      expect(result).toContain('xoxb-[redacted]')
    })
  })

  describe('When the string contains a generic _authToken assignment', () => {
    it('Then masks the assigned value', () => {
      const result = maskTokens('--//my-registry.com/:_authToken=abcdef123456GHIJKL')

      expect(result).not.toContain('abcdef123456GHIJKL')
      expect(result).toContain('_authToken=[redacted]')
    })
  })

  describe('When the string contains no secret', () => {
    it('Then returns it unchanged', () => {
      const input = 'pnpm whoami --registry https://registry.npmjs.org/'

      expect(maskTokens(input)).toBe(input)
    })
  })
})

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
