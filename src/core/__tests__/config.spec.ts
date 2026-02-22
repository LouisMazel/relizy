import type { LogLevel } from '@maz-ui/node'
import type { RelizyConfig } from '../../types'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { formatJson } from '@maz-ui/utils'
import { loadConfig, setupDotenv } from 'c12'
import { getRepoConfig, resolveRepoConfig } from 'changelogen'
import { defu } from 'defu'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineConfig, getDefaultConfig, loadRelizyConfig } from '../config'

vi.mock('node:process', () => ({
  default: {
    cwd: vi.fn(),
    env: {},
    exit: vi.fn(),
  },
}))
vi.mock('@maz-ui/utils', async () => {
  const actual = await vi.importActual('@maz-ui/utils')
  return {
    ...actual,
    formatJson: vi.fn(obj => JSON.stringify(obj)),
  }
})
vi.mock('c12')
vi.mock('changelogen')
vi.mock('defu')

describe('Given getDefaultConfig function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {}
  })

  describe('When getting default configuration', () => {
    it('Then returns config with cwd from process.cwd()', () => {
      vi.mocked(process.cwd).mockReturnValue('/project/path')

      const config = getDefaultConfig()

      expect(config.cwd).toBe('/project/path')
    })

    it('Then includes default commit types with semver mappings', () => {
      const config = getDefaultConfig()

      expect(config.types.feat).toEqual({ title: '🚀 Enhancements', semver: 'minor' })
      expect(config.types.fix).toEqual({ title: '🩹 Fixes', semver: 'patch' })
      expect(config.types.perf).toEqual({ title: '🔥 Performance', semver: 'patch' })
    })

    it('Then includes types without semver mappings', () => {
      const config = getDefaultConfig()

      expect(config.types.chore).toEqual({ title: '🏡 Chore' })
      expect(config.types.test).toEqual({ title: '✅ Tests' })
      expect(config.types.ci).toEqual({ title: '🤖 CI' })
    })

    it('Then includes all standard commit types', () => {
      const config = getDefaultConfig()

      expect(config.types).toHaveProperty('feat')
      expect(config.types).toHaveProperty('fix')
      expect(config.types).toHaveProperty('docs')
      expect(config.types).toHaveProperty('refactor')
      expect(config.types).toHaveProperty('perf')
      expect(config.types).toHaveProperty('test')
      expect(config.types).toHaveProperty('build')
      expect(config.types).toHaveProperty('ci')
      expect(config.types).toHaveProperty('style')
      expect(config.types).toHaveProperty('chore')
      expect(config.types).toHaveProperty('types')
      expect(config.types).toHaveProperty('examples')
    })
  })

  describe('When checking template defaults', () => {
    it('Then includes default commit message template', () => {
      const config = getDefaultConfig()

      expect(config.templates.commitMessage).toBe('chore(release): bump version to {{newVersion}}')
    })

    it('Then includes default tag message template', () => {
      const config = getDefaultConfig()

      expect(config.templates.tagMessage).toBe('Bump version to {{newVersion}}')
    })

    it('Then includes default tag body template', () => {
      const config = getDefaultConfig()

      expect(config.templates.tagBody).toBe('v{{newVersion}}')
    })

    it('Then includes empty changelog content template', () => {
      const config = getDefaultConfig()

      expect(config.templates.emptyChangelogContent).toBe('No relevant changes for this release')
    })

    it('Then includes default Twitter message template', () => {
      const config = getDefaultConfig()

      expect(config.templates.twitterMessage).toBe(
        '🚀 {{projectName}} {{newVersion}} is out!\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}',
      )
    })

    it('Then sets Slack message template to undefined for rich blocks', () => {
      const config = getDefaultConfig()

      expect(config.templates.slackMessage).toBeUndefined()
    })
  })

  describe('When checking bump defaults', () => {
    it('Then sets default bump type to release', () => {
      const config = getDefaultConfig()

      expect(config.bump.type).toBe('release')
    })

    it('Then enables clean by default', () => {
      const config = getDefaultConfig()

      expect(config.bump.clean).toBe(true)
    })

    it('Then sets dependency types to dependencies only', () => {
      const config = getDefaultConfig()

      expect(config.bump.dependencyTypes).toEqual(['dependencies'])
    })

    it('Then disables auto-yes by default', () => {
      const config = getDefaultConfig()

      expect(config.bump.yes).toBe(false)
    })
  })

  describe('When checking changelog defaults', () => {
    it('Then enables root changelog by default', () => {
      const config = getDefaultConfig()

      expect(config.changelog.rootChangelog).toBe(true)
    })

    it('Then includes commit body by default', () => {
      const config = getDefaultConfig()

      expect(config.changelog.includeCommitBody).toBe(true)
    })
  })

  describe('When checking publish defaults', () => {
    it('Then does not publish private packages by default', () => {
      const config = getDefaultConfig()

      expect(config.publish.private).toBe(false)
    })

    it('Then has empty publish args by default', () => {
      const config = getDefaultConfig()

      expect(config.publish.args).toEqual([])
    })

    it('Then disables safety check by default', () => {
      const config = getDefaultConfig()

      expect(config.publish.safetyCheck).toBe(true)
    })
  })

  describe('When checking release defaults', () => {
    it('Then enables all release steps by default', () => {
      const config = getDefaultConfig()

      expect(config.release.commit).toBe(true)
      expect(config.release.publish).toBe(true)
      expect(config.release.changelog).toBe(true)
      expect(config.release.push).toBe(true)
      expect(config.release.providerRelease).toBe(true)
      expect(config.release.gitTag).toBe(true)
      expect(config.release.social).toBe(true)
    })

    it('Then enables clean by default', () => {
      const config = getDefaultConfig()

      expect(config.release.clean).toBe(true)
    })

    it('Then disables noVerify by default', () => {
      const config = getDefaultConfig()

      expect(config.release.noVerify).toBe(false)
    })
  })

  describe('When checking social media defaults', () => {
    it('Then disables Twitter by default', () => {
      const config = getDefaultConfig()

      expect(config.social.twitter.enabled).toBe(false)
    })

    it('Then sets Twitter to only stable releases by default', () => {
      const config = getDefaultConfig()

      expect(config.social.twitter.onlyStable).toBe(true)
    })

    it('Then disables Slack by default', () => {
      const config = getDefaultConfig()

      expect(config.social.slack.enabled).toBe(false)
    })

    it('Then sets Slack to only stable releases by default', () => {
      const config = getDefaultConfig()

      expect(config.social.slack.onlyStable).toBe(true)
    })
  })

  describe('When checking prComment defaults', () => {
    it('Then disables prComment by default', () => {
      const config = getDefaultConfig()

      expect(config.prComment.enabled).toBe(false)
    })

    it('Then sets prComment mode to append by default', () => {
      const config = getDefaultConfig()

      expect(config.prComment.mode).toBe('append')
    })
  })

  describe('When checking other defaults', () => {
    it('Then sets log level to default', () => {
      const config = getDefaultConfig()

      expect(config.logLevel).toBe('default')
    })

    it('Then enables safety check by default', () => {
      const config = getDefaultConfig()

      expect(config.safetyCheck).toBe(true)
    })

    it('Then has empty exclude authors list', () => {
      const config = getDefaultConfig()

      expect(config.excludeAuthors).toEqual([])
    })

    it('Then disables noAuthors by default', () => {
      const config = getDefaultConfig()

      expect(config.noAuthors).toBe(false)
    })

    it('Then has empty scopeMap', () => {
      const config = getDefaultConfig()

      expect(config.scopeMap).toEqual({})
    })
  })

  describe('When checking token resolution from environment', () => {
    it('Then resolves GitLab token from RELIZY_GITLAB_TOKEN', () => {
      process.env.RELIZY_GITLAB_TOKEN = 'relizy-token'

      const config = getDefaultConfig()

      expect(config.tokens.gitlab).toBe('relizy-token')
    })

    it('Then falls back to GITLAB_TOKEN', () => {
      process.env.GITLAB_TOKEN = 'gitlab-token'

      const config = getDefaultConfig()

      expect(config.tokens.gitlab).toBe('gitlab-token')
    })

    it('Then falls back to GITLAB_API_TOKEN', () => {
      process.env.GITLAB_API_TOKEN = 'api-token'

      const config = getDefaultConfig()

      expect(config.tokens.gitlab).toBe('api-token')
    })

    it('Then falls back to CI_JOB_TOKEN', () => {
      process.env.CI_JOB_TOKEN = 'job-token'

      const config = getDefaultConfig()

      expect(config.tokens.gitlab).toBe('job-token')
    })

    it('Then prioritizes RELIZY_GITLAB_TOKEN over others', () => {
      process.env.RELIZY_GITLAB_TOKEN = 'relizy-token'
      process.env.GITLAB_TOKEN = 'gitlab-token'
      process.env.CI_JOB_TOKEN = 'job-token'

      const config = getDefaultConfig()

      expect(config.tokens.gitlab).toBe('relizy-token')
    })
  })

  describe('When resolving GitHub tokens', () => {
    it('Then resolves from RELIZY_GITHUB_TOKEN', () => {
      process.env.RELIZY_GITHUB_TOKEN = 'relizy-gh-token'

      const config = getDefaultConfig()

      expect(config.tokens.github).toBe('relizy-gh-token')
    })

    it('Then falls back to GITHUB_TOKEN', () => {
      process.env.GITHUB_TOKEN = 'gh-token'

      const config = getDefaultConfig()

      expect(config.tokens.github).toBe('gh-token')
    })

    it('Then falls back to GH_TOKEN', () => {
      process.env.GH_TOKEN = 'gh-cli-token'

      const config = getDefaultConfig()

      expect(config.tokens.github).toBe('gh-cli-token')
    })

    it('Then prioritizes RELIZY_GITHUB_TOKEN', () => {
      process.env.RELIZY_GITHUB_TOKEN = 'relizy-token'
      process.env.GITHUB_TOKEN = 'github-token'
      process.env.GH_TOKEN = 'gh-token'

      const config = getDefaultConfig()

      expect(config.tokens.github).toBe('relizy-token')
    })
  })

  describe('When resolving Twitter tokens', () => {
    it('Then resolves API key from RELIZY_TWITTER_API_KEY', () => {
      process.env.RELIZY_TWITTER_API_KEY = 'relizy-key'

      const config = getDefaultConfig()

      expect(config.tokens.twitter.apiKey).toBe('relizy-key')
    })

    it('Then falls back to TWITTER_API_KEY', () => {
      process.env.TWITTER_API_KEY = 'twitter-key'

      const config = getDefaultConfig()

      expect(config.tokens.twitter.apiKey).toBe('twitter-key')
    })

    it('Then resolves all Twitter credentials', () => {
      process.env.TWITTER_API_KEY = 'api-key'
      process.env.TWITTER_API_KEY_SECRET = 'api-secret'
      process.env.TWITTER_ACCESS_TOKEN = 'access-token'
      process.env.TWITTER_ACCESS_TOKEN_SECRET = 'token-secret'

      const config = getDefaultConfig()

      expect(config.tokens.twitter).toEqual({
        apiKey: 'api-key',
        apiKeySecret: 'api-secret',
        accessToken: 'access-token',
        accessTokenSecret: 'token-secret',
      })
    })

    it('Then prioritizes RELIZY_ prefixed variables', () => {
      process.env.RELIZY_TWITTER_API_KEY = 'relizy-key'
      process.env.TWITTER_API_KEY = 'twitter-key'

      const config = getDefaultConfig()

      expect(config.tokens.twitter.apiKey).toBe('relizy-key')
    })
  })

  describe('When resolving Slack tokens', () => {
    it('Then resolves from RELIZY_SLACK_TOKEN', () => {
      process.env.RELIZY_SLACK_TOKEN = 'relizy-slack-token'

      const config = getDefaultConfig()

      expect(config.tokens.slack).toBe('relizy-slack-token')
    })

    it('Then falls back to SLACK_TOKEN', () => {
      process.env.SLACK_TOKEN = 'slack-token'

      const config = getDefaultConfig()

      expect(config.tokens.slack).toBe('slack-token')
    })

    it('Then prioritizes RELIZY_SLACK_TOKEN', () => {
      process.env.RELIZY_SLACK_TOKEN = 'relizy-token'
      process.env.SLACK_TOKEN = 'slack-token'

      const config = getDefaultConfig()

      expect(config.tokens.slack).toBe('relizy-token')
    })
  })
})

describe('Given loadRelizyConfig function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(process.cwd).mockReturnValue('/project')
    vi.mocked(setupDotenv).mockResolvedValue({} as any)
    vi.mocked(defu).mockImplementation((a, b) => ({ ...(b || {}), ...(a || {}) }))
    vi.mocked(formatJson).mockImplementation(obj => JSON.stringify(obj))
  })

  describe('When loading config without options', () => {
    it('Then uses default config name relizy', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project' },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig()

      expect(loadConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'relizy',
        }),
      )
    })

    it('Then uses process.cwd() as working directory', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project' },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig()

      expect(loadConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: '/project',
        }),
      )
    })

    it('Then sets up dotenv for environment variables', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project' },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig()

      expect(setupDotenv).toHaveBeenCalledWith({ cwd: '/project' })
    })

    it('Then enables packageJson loading', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project' },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig()

      expect(loadConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          packageJson: true,
        }),
      )
    })
  })

  describe('When loading config with custom config name', () => {
    it('Then uses provided config name', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project' },
        _configFile: 'custom.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig({ configFile: 'custom' })

      expect(loadConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'custom',
        }),
      )
    })

    it('Then exits if custom config not found', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project' },
        _configFile: undefined,
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig({ configFile: 'custom' })

      expect(logger.error).toHaveBeenCalledWith('No config file found with name "custom"')
      expect(process.exit).toHaveBeenCalledWith(1)
    })
  })

  describe('When no config file is found', () => {
    it('Then logs debug message for standalone mode', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project' },
        _configFile: undefined,
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig()

      expect(logger.debug).toHaveBeenCalledWith(
        'No config file found with name "relizy"',
      )
    })

    it('Then does not exit if no configName specified', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project' },
        _configFile: undefined,
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig()

      expect(process.exit).not.toHaveBeenCalled()
    })
  })

  describe('When setting log level', () => {
    it('Then sets logger level from overrides', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project', logLevel: 'info' as LogLevel },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig({ overrides: { logLevel: 'debug' } })

      expect(logger.setLevel).toHaveBeenCalledWith('debug')
    })

    it('Then falls back to config logLevel', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project', logLevel: 'verbose' as LogLevel },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig()

      expect(logger.setLevel).toHaveBeenCalledWith('verbose')
    })

    it('Then logs debug message after setting level', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project', logLevel: 'debug' as LogLevel },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig()

      expect(logger.debug).toHaveBeenCalledWith('Log level set to: debug')
    })
  })

  describe('When resolving repo config', () => {
    it('Then resolves repo from cwd when not in config', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project' },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      const result = await loadRelizyConfig()

      expect(resolveRepoConfig).toHaveBeenCalledWith('/project')
      expect(result.repo).toEqual({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })
    })

    it('Then resolves string repo config', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project', repo: 'github:user/repo' },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(getRepoConfig).mockReturnValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      const result = await loadRelizyConfig()

      expect(getRepoConfig).toHaveBeenCalledWith('github:user/repo')
      expect(result.repo).toEqual({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })
    })

    it('Then keeps existing repo config object', async () => {
      const repoConfig = {
        provider: 'gitlab' as const,
        domain: 'gitlab.com',
        repo: 'group/project',
      }
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project', repo: repoConfig },
        _configFile: 'relizy.config.ts',
      } as any)

      const result = await loadRelizyConfig()

      expect(resolveRepoConfig).not.toHaveBeenCalled()
      expect(result.repo).toEqual(repoConfig)
    })
  })

  describe('When using overrides', () => {
    it('Then merges overrides with config', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/custom', bump: { type: 'patch' } },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig({ overrides: { cwd: '/custom' } })

      expect(defu).toHaveBeenCalled()
      expect(loadConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: '/custom',
        }),
      )
    })

    it('Then uses override cwd for setupDotenv', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/override' },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig({ overrides: { cwd: '/override' } })

      expect(setupDotenv).toHaveBeenCalledWith({ cwd: '/override' })
    })
  })

  describe('When using baseConfig', () => {
    it('Then merges baseConfig with overrides', async () => {
      const baseConfig = { bump: { type: 'minor' as const } }
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project' },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig({ baseConfig: baseConfig as any })

      expect(defu).toHaveBeenCalled()
    })
  })

  describe('When logging config', () => {
    it('Then logs user config in verbose mode', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project', changelog: { rootChangelog: true } },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig()

      expect(logger.verbose).toHaveBeenCalledWith(
        'User config:',
        expect.any(String),
      )
    })

    it('Then logs resolved config in debug mode', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project' },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig()

      expect(logger.debug).toHaveBeenCalledWith(
        'Resolved config:',
        expect.any(String),
      )
    })

    it('Then formats config objects with formatJson', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        config: { cwd: '/project', changelog: { rootChangelog: true } },
        _configFile: 'relizy.config.ts',
      } as any)
      vi.mocked(resolveRepoConfig).mockResolvedValue({
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      })

      await loadRelizyConfig()

      expect(formatJson).toHaveBeenCalled()
    })
  })
})

describe('Given defineConfig function', () => {
  describe('When defining config', () => {
    it('Then returns the same config object', () => {
      const config: RelizyConfig = {
        types: {},
        bump: { type: 'patch' },
      }

      const result = defineConfig(config)

      expect(result).toBe(config)
    })

    it('Then preserves all config properties', () => {
      const config: RelizyConfig = {
        types: {},
        bump: { type: 'minor' },
        changelog: { rootChangelog: false },
        publish: { private: true },
      }

      const result = defineConfig(config)

      expect(result).toEqual(config)
    })

    it('Then works with empty config', () => {
      const config: RelizyConfig = {
        types: {},
      }

      const result = defineConfig(config)

      expect(result).toEqual({ types: {} })
    })

    it('Then works with full config', () => {
      const config: RelizyConfig = {
        types: {},
        cwd: '/project',
        bump: { type: 'major' },
        changelog: { rootChangelog: true },
        publish: { private: false },
        release: { commit: true },
        social: { twitter: { enabled: true } },
      }

      const result = defineConfig(config)

      expect(result).toEqual(config)
    })
  })
})
