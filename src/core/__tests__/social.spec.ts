import { createMockConfig } from '../../../tests/mocks'
import { extractChangelogSummary, getReleaseUrl } from '../social'

describe('Given extractChangelogSummary function', () => {
  describe('When changelog contains headers', () => {
    it('Then removes markdown headers from changelog', () => {
      const changelog = `# Version 1.0.0

## Features
- Add new feature

## Fixes
- Fix bug`

      const result = extractChangelogSummary(changelog, 200)

      expect(result).not.toContain('#')
      expect(result).toContain('Add new feature')
    })

    it('Then removes multiple levels of headers', () => {
      const changelog = `# Main Header
### Sub Header
Content here`

      const result = extractChangelogSummary(changelog, 200)

      expect(result).not.toContain('#')
      expect(result).toBe('Content here.')
    })
  })

  describe('When changelog has sentences', () => {
    it('Then extracts sentences within maxLength', () => {
      const changelog = 'First sentence. Second sentence. Third sentence. Fourth sentence.'

      const result = extractChangelogSummary(changelog, 50)

      expect(result.length).toBeLessThanOrEqual(52)
      expect(result).toContain('First sentence')
    })

    it('Then includes multiple sentences if they fit', () => {
      const changelog = 'Short. Also short. And this.'

      const result = extractChangelogSummary(changelog, 100)

      expect(result).toBe('Short. Also short. And this.')
    })

    it('Then stops at maxLength boundary', () => {
      const changelog = 'This is a short sentence. This is a much longer sentence that exceeds the maximum length allowed.'

      const result = extractChangelogSummary(changelog, 30)

      expect(result).toBe('This is a short sentence.')
    })

    it('Then handles exclamation marks as sentence endings', () => {
      const changelog = 'Great news! Amazing features! More updates!'

      const result = extractChangelogSummary(changelog, 50)

      expect(result).toBe('Great news. Amazing features. More updates.')
    })

    it('Then handles question marks as sentence endings', () => {
      const changelog = 'New features? Bug fixes?'

      const result = extractChangelogSummary(changelog, 50)

      expect(result).toBe('New features. Bug fixes.')
    })
  })

  describe('When changelog is longer than maxLength', () => {
    it('Then truncates at maxLength as fallback', () => {
      const changelog = 'This is a very long continuous text without any sentence endings or punctuation marks that goes on and on'

      const result = extractChangelogSummary(changelog, 47)

      expect(result.length).toBeLessThanOrEqual(47)
      expect(result).toBe('This is a very long continuous text without any')
    })

    it('Then returns substring when no sentence breaks', () => {
      const changelog = 'NoSpacesOrPunctuationHereJustOneLongStringOfText'

      const result = extractChangelogSummary(changelog, 20)

      expect(result).toBe('NoSpacesOrPunctuatio')
      expect(result.length).toBe(20)
    })
  })

  describe('When using default maxLength', () => {
    it('Then uses 150 as default maxLength', () => {
      const changelog = 'a'.repeat(200)

      const result = extractChangelogSummary(changelog)

      expect(result.length).toBeLessThanOrEqual(150)
    })

    it('Then extracts sentences within default 150 length', () => {
      const changelog = 'First sentence here. Second sentence goes here. Third sentence follows. Fourth continues. Fifth ends.'

      const result = extractChangelogSummary(changelog)

      expect(result.length).toBeLessThanOrEqual(150)
      expect(result).toContain('First sentence')
    })
  })

  describe('When changelog is empty or whitespace', () => {
    it('Then returns empty string for empty changelog', () => {
      const result = extractChangelogSummary('', 100)

      expect(result).toBe('')
    })

    it('Then returns empty string for whitespace only', () => {
      const result = extractChangelogSummary('   \n\n  ', 100)

      expect(result).toBe('')
    })

    it('Then returns empty string for headers only', () => {
      const changelog = `# Header
## Another Header
### Third Header`

      const result = extractChangelogSummary(changelog, 100)

      expect(result).toBe('')
    })
  })

  describe('When changelog has bullet points', () => {
    it('Then includes bullet point content', () => {
      const changelog = `- Add feature A
- Fix bug B
- Update docs`

      const result = extractChangelogSummary(changelog, 100)

      expect(result).toContain('Add feature A')
    })

    it('Then handles mixed content with bullets', () => {
      const changelog = `Release notes:
- Feature one
- Feature two`

      const result = extractChangelogSummary(changelog, 100)

      expect(result).toContain('Release notes')
      expect(result).toContain('Feature one')
    })
  })

  describe('When changelog has special characters', () => {
    it('Then preserves special characters in summary', () => {
      const changelog = 'Added @mentions & #tags support.'

      const result = extractChangelogSummary(changelog, 100)

      expect(result).toBe('Added @mentions & #tags support.')
    })

    it('Then handles URLs in changelog', () => {
      const changelog = 'See https://example.com for details'

      const result = extractChangelogSummary(changelog, 100)

      expect(result).toBe('See https://example.com for details.')
    })
  })

  describe('When changelog has multiple newlines', () => {
    it('Then collapses newlines appropriately', () => {
      const changelog = `First paragraph.


Second paragraph.`

      const result = extractChangelogSummary(changelog, 100)

      expect(result).toContain('First paragraph')
      expect(result).toContain('Second paragraph')
    })
  })
})

describe('Given getReleaseUrl function', () => {
  describe('When provider is GitHub', () => {
    it('Then returns GitHub release URL format', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }

      const result = getReleaseUrl(config, 'v1.0.0')

      expect(result).toBe('https://github.com/user/repo/releases/tag/v1.0.0')
    })

    it('Then works with custom GitHub domain', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.company.com',
        repo: 'org/project',
      }

      const result = getReleaseUrl(config, 'v2.5.0')

      expect(result).toBe('https://github.company.com/org/project/releases/tag/v2.5.0')
    })

    it('Then defaults to GitHub when no provider specified', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        domain: 'github.com',
        repo: 'username/repository',
      }

      const result = getReleaseUrl(config, 'v1.2.3')

      expect(result).toBe('https://github.com/username/repository/releases/tag/v1.2.3')
    })

    it('Then handles tags without v prefix', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }

      const result = getReleaseUrl(config, '1.0.0')

      expect(result).toBe('https://github.com/user/repo/releases/tag/1.0.0')
    })
  })

  describe('When provider is GitLab', () => {
    it('Then returns GitLab release URL format', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'group/project',
      }

      const result = getReleaseUrl(config, 'v1.0.0')

      expect(result).toBe('https://gitlab.com/group/project/-/releases/v1.0.0')
    })

    it('Then works with custom GitLab domain', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.company.com',
        repo: 'team/service',
      }

      const result = getReleaseUrl(config, 'v3.1.4')

      expect(result).toBe('https://gitlab.company.com/team/service/-/releases/v3.1.4')
    })

    it('Then handles nested GitLab groups', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'parent/child/project',
      }

      const result = getReleaseUrl(config, 'v2.0.0')

      expect(result).toBe('https://gitlab.com/parent/child/project/-/releases/v2.0.0')
    })
  })

  describe('When provider is Bitbucket', () => {
    it('Then returns Bitbucket tag URL format', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'bitbucket',
        domain: 'bitbucket.org',
        repo: 'workspace/repository',
      }

      const result = getReleaseUrl(config, 'v1.0.0')

      expect(result).toBe('https://bitbucket.org/workspace/repository/commits/tag/v1.0.0')
    })

    it('Then works with custom Bitbucket domain', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'bitbucket',
        domain: 'bitbucket.company.com',
        repo: 'team/repo',
      }

      const result = getReleaseUrl(config, 'v2.1.0')

      expect(result).toBe('https://bitbucket.company.com/team/repo/commits/tag/v2.1.0')
    })
  })

  describe('When repo config is incomplete', () => {
    it('Then returns undefined when domain is missing', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        repo: 'user/repo',
      }

      const result = getReleaseUrl(config, 'v1.0.0')

      expect(result).toBeUndefined()
    })

    it('Then returns undefined when repo is missing', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
      }

      const result = getReleaseUrl(config, 'v1.0.0')

      expect(result).toBeUndefined()
    })

    it('Then returns undefined when repo config is empty object', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {}

      const result = getReleaseUrl(config, 'v1.0.0')

      expect(result).toBeUndefined()
    })

    it('Then returns undefined when repo is undefined', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = undefined

      const result = getReleaseUrl(config, 'v1.0.0')

      expect(result).toBeUndefined()
    })
  })

  describe('When provider is unknown', () => {
    it('Then returns undefined for unsupported provider', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'unknown' as any,
        domain: 'example.com',
        repo: 'user/repo',
      }

      const result = getReleaseUrl(config, 'v1.0.0')

      expect(result).toBeUndefined()
    })
  })

  describe('When tag format varies', () => {
    it('Then handles prerelease tags', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }

      const result = getReleaseUrl(config, 'v1.0.0-beta.1')

      expect(result).toBe('https://github.com/user/repo/releases/tag/v1.0.0-beta.1')
    })

    it('Then handles custom tag formats', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }

      const result = getReleaseUrl(config, 'release-1.0.0')

      expect(result).toBe('https://github.com/user/repo/releases/tag/release-1.0.0')
    })

    it('Then handles package-specific tags', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/monorepo',
      }

      const result = getReleaseUrl(config, 'pkg-a@1.0.0')

      expect(result).toBe('https://github.com/user/monorepo/releases/tag/pkg-a@1.0.0')
    })
  })
})
