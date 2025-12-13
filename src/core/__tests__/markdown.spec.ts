import type { GitCommit } from 'changelogen'
import { upperFirst } from '@maz-ui/utils'
import { formatCompareChanges, formatReference } from 'changelogen'
import { convert } from 'convert-gitmoji'
import { fetch } from 'node-fetch-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCommit, createMockConfig } from '../../../tests/mocks'
import { getFirstCommit } from '../git'
import { generateMarkDown, parseChangelogMarkdown } from '../markdown'

vi.mock('@maz-ui/utils', async () => {
  const actual = await vi.importActual('@maz-ui/utils')
  return {
    ...actual,
    upperFirst: vi.fn((str: string) => str.charAt(0).toUpperCase() + str.slice(1)),
  }
})
vi.mock('changelogen')
vi.mock('convert-gitmoji')
vi.mock('node-fetch-native')
vi.mock('../git')

describe('Given generateMarkDown function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(formatCompareChanges).mockReturnValue('[compare changes](https://github.com/user/repo/compare)')
    vi.mocked(formatReference).mockImplementation((ref: any) => `#${ref.value}`)
    vi.mocked(convert).mockImplementation((text: string) => text)
    vi.mocked(getFirstCommit).mockReturnValue('abc123')
    vi.mocked(fetch).mockResolvedValue({
      json: vi.fn().mockResolvedValue({ user: null }),
    } as any)
  })

  describe('When generating markdown with commits', () => {
    it('Then includes version title with from and to', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        createMockCommit('feat', 'add new feature'),
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).toContain('## v1.0.0...v1.1.0')
    })

    it('Then includes compare link when repo config exists', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }
      const commits: GitCommit[] = [
        createMockCommit('feat', 'add feature'),
      ]

      await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(formatCompareChanges).toHaveBeenCalledWith(
        'v1.1.0',
        expect.objectContaining({
          from: 'v1.0.0',
          to: 'v1.1.0',
        }),
      )
    })

    it('Then uses first commit hash when isFirstCommit is true', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }
      vi.mocked(getFirstCommit).mockReturnValue('initial123')
      const commits: GitCommit[] = [
        createMockCommit('feat', 'initial feature'),
      ]

      await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.0.0',
        isFirstCommit: true,
      })

      expect(getFirstCommit).toHaveBeenCalledWith(config.cwd)
      expect(formatCompareChanges).toHaveBeenCalledWith(
        'v1.0.0',
        expect.objectContaining({
          from: 'initial123',
        }),
      )
    })
  })

  describe('When grouping commits by type', () => {
    it('Then groups feat commits under Enhancements', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        { ...createMockCommit('feat', 'feature one'), type: 'feat' },
        { ...createMockCommit('feat', 'feature two'), type: 'feat' },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).toContain('### 🚀 Enhancements')
      expect(result).toContain('Feature one')
      expect(result).toContain('Feature two')
    })

    it('Then groups fix commits under Fixes', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        { ...createMockCommit('fix', 'bug fix one'), type: 'fix' },
        { ...createMockCommit('fix', 'bug fix two'), type: 'fix' },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.0.1',
        isFirstCommit: false,
      })

      expect(result).toContain('### 🩹 Fixes')
      expect(result).toContain('Bug fix one')
      expect(result).toContain('Bug fix two')
    })

    it('Then skips types with no commits', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        createMockCommit('feat', 'feature'),
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).not.toContain('### 🩹 Fixes')
      expect(result).not.toContain('### 📖 Documentation')
    })

    it('Then skips boolean type configurations', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.types = {
        ...config.types,
        feat: true as any,
      }
      const commits: GitCommit[] = [
        createMockCommit('feat', 'feature'),
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).not.toContain('feature')
    })
  })

  describe('When formatting commit messages', () => {
    it('Then capitalizes first letter of description', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        { ...createMockCommit('feat', 'add new feature'), description: 'add new feature' },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(upperFirst).toHaveBeenCalledWith('add new feature')
      expect(result).toContain('Add new feature')
    })

    it('Then includes scope in commit message', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        { ...createMockCommit('feat', 'new feature'), scope: 'core', type: 'feat' },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).toContain('**core:**')
    })

    it('Then marks breaking changes with warning emoji', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        { ...createMockCommit('feat', 'breaking change'), isBreaking: true, type: 'feat' },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v2.0.0',
        isFirstCommit: false,
      })

      expect(result).toContain('⚠️')
    })

    it('Then includes pull request references', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature with PR'),
          references: [{ type: 'pull-request', value: '123' }],
          type: 'feat',
        },
      ]
      vi.mocked(formatReference).mockReturnValue('#123')

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).toContain('(#123)')
    })

    it('Then includes issue references', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        {
          ...createMockCommit('fix', 'fix issue'),
          references: [{ type: 'issue', value: '456' }],
          type: 'fix',
        },
      ]
      vi.mocked(formatReference).mockReturnValue('#456')

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.0.1',
        isFirstCommit: false,
      })

      expect(result).toContain('(#456)')
    })

    it('Then includes multiple references', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          references: [
            { type: 'pull-request', value: '100' },
            { type: 'issue', value: '200' },
          ],
          type: 'feat',
        },
      ]
      vi.mocked(formatReference)
        .mockReturnValueOnce('#100')
        .mockReturnValueOnce('#200')

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).toContain('(#100, #200)')
    })
  })

  describe('When handling breaking changes', () => {
    it('Then creates separate breaking changes section', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        { ...createMockCommit('feat', 'breaking feature'), isBreaking: true, type: 'feat' },
        { ...createMockCommit('fix', 'breaking fix'), isBreaking: true, type: 'fix' },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v2.0.0',
        isFirstCommit: false,
      })

      expect(result).toContain('#### ⚠️ Breaking Changes')
      expect(result).toContain('Breaking feature')
      expect(result).toContain('Breaking fix')
    })

    it('Then does not include breaking section when no breaking changes', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        createMockCommit('feat', 'regular feature'),
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).not.toContain('⚠️ Breaking Changes')
    })
  })

  describe('When handling commit bodies', () => {
    it('Then includes commit body when includeCommitBody is true', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.changelog = { includeCommitBody: true, rootChangelog: true, formatCmd: '' }
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          body: 'This is the commit body\nWith multiple lines',
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).toContain('This is the commit body')
      expect(result).toContain('With multiple lines')
    })

    it('Then excludes commit body when includeCommitBody is false', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.changelog = { includeCommitBody: false, rootChangelog: true, formatCmd: '' }
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          body: 'This should not appear',
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).not.toContain('This should not appear')
    })

    it('Then filters out git diff status lines from body', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.changelog = { includeCommitBody: true, rootChangelog: true, formatCmd: '' }
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          body: 'Real content\nM src/file.ts\nA new-file.ts\nMore content',
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).toContain('Real content')
      expect(result).toContain('More content')
      expect(result).not.toContain('M src/file.ts')
      expect(result).not.toContain('A new-file.ts')
    })

    it('Then handles empty body', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.changelog = { includeCommitBody: true, rootChangelog: true, formatCmd: '' }
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          body: '',
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).toContain('Feature')
    })
  })

  describe('When handling authors', () => {
    it('Then includes contributors section', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: { name: 'john doe', email: 'john@example.com' },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).toContain('### ❤️ Contributors')
      expect(result).toContain('John Doe')
    })

    it('Then capitalizes author names', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: { name: 'jane smith', email: 'jane@example.com' },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).toContain('Jane Smith')
    })

    it('Then excludes bot authors', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: { name: 'dependabot[bot]', email: 'bot@users.noreply.github.com' },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).not.toContain('dependabot')
    })

    it('Then excludes authors in excludeAuthors list', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      ;(config as any).excludeAuthors = ['ignored']
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: { name: 'ignored user', email: 'ignored@example.com' },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).not.toContain('Ignored User')
    })

    it('Then excludes authors by email in excludeAuthors', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      ;(config as any).excludeAuthors = ['excluded@example.com']
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: { name: 'User Name', email: 'excluded@example.com' },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).not.toContain('User Name')
    })

    it('Then merges commits from same author', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature one'),
          author: { name: 'john doe', email: 'john@example.com' },
          type: 'feat',
        },
        {
          ...createMockCommit('feat', 'feature two'),
          author: { name: 'john doe', email: 'john@work.com' },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      const johnMatches = result.match(/John Doe/g)
      expect(johnMatches).toHaveLength(1)
    })

    it('Then includes author email by default', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: { name: 'john doe', email: 'john@example.com' },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).toContain('<john@example.com>')
    })

    it('Then hides author email when hideAuthorEmail is true', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.hideAuthorEmail = true
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: { name: 'john doe', email: 'john@example.com' },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).not.toContain('<john@example.com>')
    })

    it('Then excludes noreply.github.com emails', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: {
            name: 'john doe',
            email: '12345+user@users.noreply.github.com',
          },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).not.toContain('noreply.github.com')
    })

    it('Then skips contributors section when noAuthors is true', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.noAuthors = true
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: { name: 'john doe', email: 'john@example.com' },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).not.toContain('❤️ Contributors')
    })

    it('Then skips contributors section when no authors', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: { name: 'bot[bot]', email: 'bot@example.com' },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).not.toContain('❤️ Contributors')
    })
  })

  describe('When fetching GitHub usernames', () => {
    it('Then fetches GitHub username for authors', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ user: { username: 'johndoe' } }),
      } as any)
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: { name: 'john doe', email: 'john@example.com' },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(fetch).toHaveBeenCalledWith('https://ungh.cc/users/find/john@example.com')
      expect(result).toContain('[@johndoe](https://github.com/johndoe)')
    })

    it('Then handles fetch errors gracefully', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'))
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: { name: 'john doe', email: 'john@example.com' },
          type: 'feat',
        },
      ]

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(result).toContain('John Doe <john@example.com>')
    })

    it('Then skips GitHub fetch for non-GitHub providers', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      }
      const commits: GitCommit[] = [
        {
          ...createMockCommit('feat', 'feature'),
          author: { name: 'john doe', email: 'john@example.com' },
          type: 'feat',
        },
      ]

      await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('When converting to gitmoji', () => {
    it('Then converts markdown with gitmoji', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        createMockCommit('feat', 'feature'),
      ]
      vi.mocked(convert).mockReturnValue('converted markdown')

      const result = await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(convert).toHaveBeenCalled()
      expect(result).toBe('converted markdown')
    })

    it('Then passes commit mode to convert', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const commits: GitCommit[] = [
        createMockCommit('feat', 'feature'),
      ]

      await generateMarkDown({
        commits,
        config,
        from: 'v1.0.0',
        to: 'v1.1.0',
        isFirstCommit: false,
      })

      expect(convert).toHaveBeenCalledWith(expect.any(String), true)
    })
  })
})

describe('Given parseChangelogMarkdown function', () => {
  describe('When parsing changelog with version headers', () => {
    it('Then extracts single release', () => {
      const markdown = `# Changelog

## v1.0.0

- Feature one
- Feature two`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases).toHaveLength(1)
      expect(result.releases[0]?.version).toBe('1.0.0')
      expect(result.releases[0]?.body).toContain('Feature one')
      expect(result.releases[0]?.body).toContain('Feature two')
    })

    it('Then extracts multiple releases', () => {
      const markdown = `# Changelog

## v2.0.0

- Breaking change

## v1.0.0

- Initial release`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases).toHaveLength(2)
      expect(result.releases[0]?.version).toBe('2.0.0')
      expect(result.releases[1]?.version).toBe('1.0.0')
    })

    it('Then handles versions without v prefix', () => {
      const markdown = `## 1.5.0

- Feature`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases[0]?.version).toBe('1.5.0')
    })

    it('Then handles prerelease versions', () => {
      const markdown = `## v1.0.0-beta.1

- Beta feature`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases[0]?.version).toBe('1.0.0-beta.1')
    })

    it('Then handles versions with additional text', () => {
      const markdown = `## Version v1.2.3 (2024-01-01)

- Feature`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases[0]?.version).toBe('1.2.3')
    })
  })

  describe('When parsing release bodies', () => {
    it('Then extracts body content correctly', () => {
      const markdown = `## v1.0.0

### Features
- Feature A
- Feature B

### Fixes
- Bug fix`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases[0]?.body).toContain('### Features')
      expect(result.releases[0]?.body).toContain('Feature A')
      expect(result.releases[0]?.body).toContain('Bug fix')
    })

    it('Then separates multiple release bodies', () => {
      const markdown = `## v2.0.0

Content for v2

## v1.0.0

Content for v1`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases[0]?.body).toContain('Content for v2')
      expect(result.releases[0]?.body).not.toContain('Content for v1')
      expect(result.releases[1]?.body).toContain('Content for v1')
    })

    it('Then trims whitespace from bodies', () => {
      const markdown = `## v1.0.0


  Feature with spacing


## v0.9.0`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases[0]?.body).toBe('Feature with spacing')
    })
  })

  describe('When parsing headers with different levels', () => {
    it('Then matches h2 headers', () => {
      const markdown = `## v1.0.0

Content`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases).toHaveLength(1)
    })

    it('Then matches h3 headers', () => {
      const markdown = `### v1.0.0

Content`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases).toHaveLength(1)
    })

    it('Then matches h4 headers', () => {
      const markdown = `#### v1.0.0

Content`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases).toHaveLength(1)
    })

    it('Then ignores h1 headers', () => {
      const markdown = `# v1.0.0

Content`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases).toHaveLength(0)
    })
  })

  describe('When parsing headers without versions', () => {
    it('Then includes release with undefined version', () => {
      const markdown = `## Unreleased

- Feature`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases.length).toBe(0)
      expect(result.releases[0]?.version).toBeUndefined()
    })

    it('Then handles mixed releases with and without versions', () => {
      const markdown = `## Unreleased

- Work in progress

## v1.0.0

- Released feature`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases).toHaveLength(1)
      expect(result.releases[0]?.version).toBe('1.0.0')
    })
  })

  describe('When parsing empty changelog', () => {
    it('Then returns empty releases array', () => {
      const markdown = `# Changelog

No releases yet`

      const result = parseChangelogMarkdown(markdown)

      expect(result.releases).toHaveLength(0)
    })

    it('Then handles completely empty string', () => {
      const result = parseChangelogMarkdown('')

      expect(result.releases).toHaveLength(0)
    })
  })
})
