import process from 'node:process'
import { execPromise, logger } from '@maz-ui/node'
import { vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { executeBuildCmd, executeFormatCmd, executeHook, getCIName, getPackagesOrBumpedPackages, isBumpedPackage, isInCI } from '../utils'

vi.mock('../repo', () => ({
  getPackages: vi.fn().mockResolvedValue([
    { name: 'pkg-a', version: '1.0.0' },
    { name: 'pkg-b', version: '2.0.0' },
  ]),
}))

vi.mock('node:process', async importActual => ({
  ...(await importActual()),
  env: {},
}))

describe('Given executeHook function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When hook is not found', () => {
    it('Then returns undefined and logs debug message', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })

      const result = await executeHook('before:bump', config, false)

      expect(result).toBeUndefined()
      expect(logger.debug).toHaveBeenCalledWith('Hook before:bump not found')
    })
  })

  describe('When hook is a function', () => {
    it('Then executes function hook and returns result', async () => {
      const hookFn = vi.fn().mockResolvedValue('hook-result')
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.hooks = { 'before:bump': hookFn }

      const result = await executeHook('before:bump', config, false)

      expect(hookFn).toHaveBeenCalledWith(config, false, undefined)
      expect(logger.info).toHaveBeenCalledWith('Executing hook before:bump')
      expect(logger.debug).toHaveBeenCalledWith('Hook before:bump returned: hook-result')
      expect(logger.info).toHaveBeenCalledWith('Hook before:bump executed')
      expect(result).toBe('hook-result')
    })

    it('Then executes function hook with params', async () => {
      const hookFn = vi.fn().mockResolvedValue(null)
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.hooks = { 'success:bump': hookFn }
      const params = { version: '1.0.1' }

      await executeHook('success:bump', config, true, params)

      expect(hookFn).toHaveBeenCalledWith(config, true, params)
    })

    it('Then does not log debug when hook returns falsy value', async () => {
      const hookFn = vi.fn().mockResolvedValue(null)
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.hooks = { 'before:changelog': hookFn }

      await executeHook('before:changelog', config, false)

      expect(logger.debug).not.toHaveBeenCalledWith(expect.stringContaining('returned'))
    })
  })

  describe('When hook is a string command', () => {
    it('Then executes string command and returns result', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: 'command-output', stderr: '' })
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.hooks = { 'before:publish': 'echo "test"' }

      const result = await executeHook('before:publish', config, false)

      expect(execPromise).toHaveBeenCalledWith('echo "test"', {
        logLevel: config.logLevel,
        cwd: config.cwd,
        noStderr: true,
        noStdout: true,
      })
      expect(logger.info).toHaveBeenCalledWith('Executing hook before:publish')
      expect(logger.debug).toHaveBeenCalledWith('Hook before:publish returned: {"stdout":"command-output","stderr":""}')
      expect(logger.info).toHaveBeenCalledWith('Hook before:publish executed')
      expect(result).toEqual({ stdout: 'command-output', stderr: '' })
    })

    it('Then executes string command in dry run mode', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.hooks = { 'success:release': 'npm run deploy' }

      await executeHook('success:release', config, false)

      expect(execPromise).toHaveBeenCalled()
    })

    it('Then logs debug when command returns empty string', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.hooks = { 'before:changelog': 'ls' }

      await executeHook('before:changelog', config, false)

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('returned'))
    })
  })
})

describe('Given isInCI function', () => {
  const originalEnv = process.env

  // List of all CI-related environment variables that need to be cleared
  const ciEnvVars = [
    'CI',
    'CONTINUOUS_INTEGRATION',
    'GITHUB_ACTIONS',
    'GITHUB_WORKFLOW',
    'GITLAB_CI',
    'CIRCLECI',
    'TRAVIS',
    'JENKINS_HOME',
    'JENKINS_URL',
    'BUILD_ID',
    'TF_BUILD',
    'AZURE_PIPELINES',
    'TEAMCITY_VERSION',
    'BITBUCKET_BUILD_NUMBER',
    'DRONE',
    'APPVEYOR',
    'BUILDKITE',
    'CODEBUILD_BUILD_ID',
    'NETLIFY',
    'VERCEL',
    'HEROKU_TEST_RUN_ID',
    'BUDDY',
    'SEMAPHORE',
    'CF_BUILD_ID',
    'bamboo_buildKey',
    'PROJECT_ID',
    'SCREWDRIVER',
    'STRIDER',
  ]

  beforeEach(() => {
    // Clear all CI-related environment variables
    ciEnvVars.forEach((key) => {
      delete process.env[key]
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('When CI environment variables are set', () => {
    it('Then returns true for CI=true', () => {
      process.env.CI = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for CONTINUOUS_INTEGRATION=true', () => {
      process.env.CONTINUOUS_INTEGRATION = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for GITHUB_ACTIONS=true', () => {
      process.env.GITHUB_ACTIONS = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for GITHUB_WORKFLOW', () => {
      process.env.GITHUB_WORKFLOW = 'ci.yml'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for GITLAB_CI=true', () => {
      process.env.GITLAB_CI = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for CIRCLECI=true', () => {
      process.env.CIRCLECI = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for TRAVIS=true', () => {
      process.env.TRAVIS = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for JENKINS_HOME', () => {
      process.env.JENKINS_HOME = '/var/jenkins'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for JENKINS_URL', () => {
      process.env.JENKINS_URL = 'https://jenkins.local'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for BUILD_ID', () => {
      process.env.BUILD_ID = '12345'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for TF_BUILD=True', () => {
      process.env.TF_BUILD = 'True'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for AZURE_PIPELINES=true', () => {
      process.env.AZURE_PIPELINES = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for TEAMCITY_VERSION', () => {
      process.env.TEAMCITY_VERSION = '2021.1'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for BITBUCKET_BUILD_NUMBER', () => {
      process.env.BITBUCKET_BUILD_NUMBER = '123'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for DRONE=true', () => {
      process.env.DRONE = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for APPVEYOR=True', () => {
      process.env.APPVEYOR = 'True'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for APPVEYOR=true', () => {
      process.env.APPVEYOR = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for BUILDKITE=true', () => {
      process.env.BUILDKITE = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for CODEBUILD_BUILD_ID', () => {
      process.env.CODEBUILD_BUILD_ID = 'build-123'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for NETLIFY=true', () => {
      process.env.NETLIFY = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for VERCEL=1', () => {
      process.env.VERCEL = '1'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for HEROKU_TEST_RUN_ID', () => {
      process.env.HEROKU_TEST_RUN_ID = 'test-123'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for BUDDY=true', () => {
      process.env.BUDDY = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for SEMAPHORE=true', () => {
      process.env.SEMAPHORE = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for CF_BUILD_ID', () => {
      process.env.CF_BUILD_ID = 'cf-123'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for bamboo_buildKey', () => {
      process.env.bamboo_buildKey = 'PROJ-PLAN-123'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for BUILD_ID and PROJECT_ID', () => {
      process.env.BUILD_ID = '123'
      process.env.PROJECT_ID = 'my-project'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for SCREWDRIVER=true', () => {
      process.env.SCREWDRIVER = 'true'

      expect(isInCI()).toBe(true)
    })

    it('Then returns true for STRIDER=true', () => {
      process.env.STRIDER = 'true'

      expect(isInCI()).toBe(true)
    })
  })

  describe('When no CI environment variables are set', () => {
    it('Then returns false', () => {
      delete process.env.CI
      delete process.env.GITHUB_ACTIONS

      expect(isInCI()).toBe(false)
    })
  })

  describe('When CI variables are set to false', () => {
    it('Then returns false for CI=false', () => {
      process.env.CI = 'false'

      expect(isInCI()).toBe(false)
    })

    it('Then returns false for GITHUB_ACTIONS=false', () => {
      process.env.GITHUB_ACTIONS = 'false'

      expect(isInCI()).toBe(false)
    })
  })
})

describe('Given getCIName function', () => {
  const originalEnv = process.env

  // List of all CI-related environment variables that need to be cleared
  const ciEnvVars = [
    'CI',
    'CONTINUOUS_INTEGRATION',
    'GITHUB_ACTIONS',
    'GITHUB_WORKFLOW',
    'GITLAB_CI',
    'CIRCLECI',
    'TRAVIS',
    'JENKINS_HOME',
    'JENKINS_URL',
    'BUILD_ID',
    'TF_BUILD',
    'AZURE_PIPELINES',
    'TEAMCITY_VERSION',
    'BITBUCKET_BUILD_NUMBER',
    'DRONE',
    'APPVEYOR',
    'BUILDKITE',
    'CODEBUILD_BUILD_ID',
    'NETLIFY',
    'VERCEL',
    'HEROKU_TEST_RUN_ID',
    'BUDDY',
    'SEMAPHORE',
    'CF_BUILD_ID',
    'bamboo_buildKey',
    'PROJECT_ID',
    'SCREWDRIVER',
    'STRIDER',
  ]

  beforeEach(() => {
    // Clear all CI-related environment variables
    ciEnvVars.forEach((key) => {
      delete process.env[key]
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('When specific CI environment is detected', () => {
    it('Then returns GitHub Actions for GITHUB_ACTIONS=true', () => {
      process.env.GITHUB_ACTIONS = 'true'

      expect(getCIName()).toBe('GitHub Actions')
    })

    it('Then returns GitLab CI for GITLAB_CI=true', () => {
      process.env.GITLAB_CI = 'true'

      expect(getCIName()).toBe('GitLab CI')
    })

    it('Then returns CircleCI for CIRCLECI=true', () => {
      process.env.CIRCLECI = 'true'

      expect(getCIName()).toBe('CircleCI')
    })

    it('Then returns Travis CI for TRAVIS=true', () => {
      process.env.TRAVIS = 'true'

      expect(getCIName()).toBe('Travis CI')
    })

    it('Then returns Jenkins for JENKINS_HOME', () => {
      process.env.JENKINS_HOME = '/var/jenkins'

      expect(getCIName()).toBe('Jenkins')
    })

    it('Then returns Jenkins for JENKINS_URL', () => {
      process.env.JENKINS_URL = 'https://jenkins.local'

      expect(getCIName()).toBe('Jenkins')
    })

    it('Then returns Azure Pipelines for TF_BUILD=True', () => {
      process.env.TF_BUILD = 'True'

      expect(getCIName()).toBe('Azure Pipelines')
    })

    it('Then returns TeamCity for TEAMCITY_VERSION', () => {
      process.env.TEAMCITY_VERSION = '2021.1'

      expect(getCIName()).toBe('TeamCity')
    })

    it('Then returns Bitbucket Pipelines for BITBUCKET_BUILD_NUMBER', () => {
      process.env.BITBUCKET_BUILD_NUMBER = '123'

      expect(getCIName()).toBe('Bitbucket Pipelines')
    })

    it('Then returns Drone for DRONE=true', () => {
      process.env.DRONE = 'true'

      expect(getCIName()).toBe('Drone')
    })

    it('Then returns AppVeyor for APPVEYOR', () => {
      process.env.APPVEYOR = 'True'

      expect(getCIName()).toBe('AppVeyor')
    })

    it('Then returns Buildkite for BUILDKITE=true', () => {
      process.env.BUILDKITE = 'true'

      expect(getCIName()).toBe('Buildkite')
    })

    it('Then returns AWS CodeBuild for CODEBUILD_BUILD_ID', () => {
      process.env.CODEBUILD_BUILD_ID = 'build-123'

      expect(getCIName()).toBe('AWS CodeBuild')
    })

    it('Then returns Netlify for NETLIFY=true', () => {
      process.env.NETLIFY = 'true'

      expect(getCIName()).toBe('Netlify')
    })

    it('Then returns Vercel for VERCEL=1', () => {
      process.env.VERCEL = '1'

      expect(getCIName()).toBe('Vercel')
    })

    it('Then returns Heroku CI for HEROKU_TEST_RUN_ID', () => {
      process.env.HEROKU_TEST_RUN_ID = 'test-123'

      expect(getCIName()).toBe('Heroku CI')
    })

    it('Then returns Buddy for BUDDY=true', () => {
      process.env.BUDDY = 'true'

      expect(getCIName()).toBe('Buddy')
    })

    it('Then returns Semaphore for SEMAPHORE=true', () => {
      process.env.SEMAPHORE = 'true'

      expect(getCIName()).toBe('Semaphore')
    })

    it('Then returns Codefresh for CF_BUILD_ID', () => {
      process.env.CF_BUILD_ID = 'cf-123'

      expect(getCIName()).toBe('Codefresh')
    })

    it('Then returns Bamboo for bamboo_buildKey', () => {
      process.env.bamboo_buildKey = 'PROJ-PLAN-123'

      expect(getCIName()).toBe('Bamboo')
    })

    it('Then returns Google Cloud Build for BUILD_ID and PROJECT_ID', () => {
      process.env.BUILD_ID = '123'
      process.env.PROJECT_ID = 'my-project'

      expect(getCIName()).toBe('Google Cloud Build')
    })

    it('Then returns Screwdriver for SCREWDRIVER=true', () => {
      process.env.SCREWDRIVER = 'true'

      expect(getCIName()).toBe('Screwdriver')
    })

    it('Then returns Strider for STRIDER=true', () => {
      process.env.STRIDER = 'true'

      expect(getCIName()).toBe('Strider')
    })

    it('Then returns Unknown CI for CI=true without specific provider', () => {
      process.env.CI = 'true'

      expect(getCIName()).toBe('Unknown CI')
    })
  })

  describe('When no CI environment is detected', () => {
    it('Then returns null', () => {
      expect(getCIName()).toBeNull()
    })
  })
})

describe('Given executeFormatCmd function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When formatCmd is configured', () => {
    it('Then executes format command successfully', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.changelog = { formatCmd: 'prettier --write *.md', rootChangelog: true, includeCommitBody: false }

      await executeFormatCmd({ config, dryRun: false })

      expect(logger.info).toHaveBeenCalledWith('Running format command')
      expect(logger.debug).toHaveBeenCalledWith('Running format command: prettier --write *.md')
      expect(execPromise).toHaveBeenCalledWith('prettier --write *.md', {
        noStderr: true,
        noStdout: true,
        logLevel: config.logLevel,
        cwd: config.cwd,
      })
      expect(logger.info).toHaveBeenCalledWith('Format completed')
    })

    it('Then skips execution in dry run mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.changelog = { formatCmd: 'prettier --write *.md', rootChangelog: true, includeCommitBody: false }

      await executeFormatCmd({ config, dryRun: true })

      expect(logger.log).toHaveBeenCalledWith('[dry-run] exec format command: ', 'prettier --write *.md')
      expect(execPromise).not.toHaveBeenCalled()
    })

    it('Then throws error when format command fails', async () => {
      vi.mocked(execPromise).mockRejectedValue(new Error('Command failed'))
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.changelog = { formatCmd: 'invalid-command', rootChangelog: true, includeCommitBody: false }

      await expect(executeFormatCmd({ config, dryRun: false })).rejects.toThrow('Format command failed')
    })
  })

  describe('When formatCmd is not configured', () => {
    it('Then logs debug message and returns', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.changelog = { rootChangelog: true, includeCommitBody: false, formatCmd: '' }

      await executeFormatCmd({ config, dryRun: false })

      expect(logger.debug).toHaveBeenCalledWith('No format command specified')
      expect(execPromise).not.toHaveBeenCalled()
    })

    it('Then does nothing in dry run mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })

      await executeFormatCmd({ config, dryRun: true })

      expect(execPromise).not.toHaveBeenCalled()
    })
  })
})

describe('Given executeBuildCmd function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When buildCmd is configured', () => {
    it('Then executes build command successfully', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
      const config = createMockConfig({ bump: { type: 'patch' }, publish: { buildCmd: 'npm run build', private: false, args: [], safetyCheck: false } })

      await executeBuildCmd({ config, dryRun: false })

      expect(logger.info).toHaveBeenCalledWith('Running build command')
      expect(logger.debug).toHaveBeenCalledWith('Running build command: npm run build')
      expect(execPromise).toHaveBeenCalledWith('npm run build', {
        noStderr: true,
        noStdout: true,
        logLevel: config.logLevel,
        cwd: config.cwd,
      })
      expect(logger.info).toHaveBeenCalledWith('Build completed')
    })

    it('Then skips execution in dry run mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' }, publish: { buildCmd: 'pnpm build', private: false, args: [], safetyCheck: false } })

      await executeBuildCmd({ config, dryRun: true })

      expect(logger.info).toHaveBeenCalledWith('[dry-run] exec build command: ', 'pnpm build')
      expect(execPromise).not.toHaveBeenCalled()
    })

    it('Then throws error when build command fails', async () => {
      vi.mocked(execPromise).mockRejectedValue(new Error('Build failed'))
      const config = createMockConfig({ bump: { type: 'patch' }, publish: { buildCmd: 'npm run build', private: false, args: [], safetyCheck: false } })

      await expect(executeBuildCmd({ config, dryRun: false })).rejects.toThrow()
    })
  })

  describe('When buildCmd is not configured', () => {
    it('Then logs debug message and returns', async () => {
      const config = createMockConfig({ bump: { type: 'patch' }, publish: { buildCmd: '', private: false, args: [], safetyCheck: false } })

      await executeBuildCmd({ config, dryRun: false })

      expect(logger.debug).toHaveBeenCalledWith('No build command specified')
      expect(execPromise).not.toHaveBeenCalled()
    })
  })
})

describe('Given isBumpedPackage function', () => {
  describe('When package has oldVersion property', () => {
    it('Then returns true for package with oldVersion', () => {
      const pkg = { ...createMockPackageInfo(), oldVersion: '1.0.0' }

      expect(isBumpedPackage(pkg)).toBe(true)
    })

    it('Then returns true for package with empty string oldVersion', () => {
      const pkg = { ...createMockPackageInfo(), oldVersion: '' }

      expect(isBumpedPackage(pkg)).toBe(false)
    })
  })

  describe('When package does not have oldVersion property', () => {
    it('Then returns false', () => {
      const pkg = createMockPackageInfo()
      delete (pkg as any).oldVersion

      expect(isBumpedPackage(pkg)).toBe(false)
    })
  })
})

describe('Given getPackagesOrBumpedPackages function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When bumpResult has bumpedPackages', () => {
    it('Then returns bumped packages from bumpResult', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      const bumpedPackages = [
        { ...createMockPackageInfo({ name: 'pkg-a', newVersion: '1.0.1' }), oldVersion: '1.0.0' },
        { ...createMockPackageInfo({ name: 'pkg-b', newVersion: '2.0.1' }), oldVersion: '2.0.0' },
      ]
      const bumpResult = {
        bumpedPackages,
        detectedReleaseType: 'patch' as const,
        oldVersion: '1.0.0',
        newVersion: '1.0.1',
        bumped: true as const,
      }

      const result = await getPackagesOrBumpedPackages({
        config,
        bumpResult,
        suffix: undefined,
        force: false,
      })

      expect(result).toEqual(bumpedPackages)
    })

    it('Then does not call getPackages when bumpResult has packages', async () => {
      const { getPackages } = await import('../repo')
      const config = createMockConfig({ bump: { type: 'patch' } })
      const bumpedPackages = [{ ...createMockPackageInfo(), oldVersion: '1.0.0' }]
      const bumpResult = {
        bumpedPackages,
        detectedReleaseType: 'patch' as const,
        oldVersion: '1.0.0',
        newVersion: '1.0.1',
        bumped: true as const,
      }

      await getPackagesOrBumpedPackages({
        config,
        bumpResult,
        suffix: undefined,
        force: false,
      })

      expect(getPackages).not.toHaveBeenCalled()
    })
  })

  describe('When bumpResult is undefined', () => {
    it('Then calls getPackages and returns all packages', async () => {
      const { getPackages } = await import('../repo')
      const config = createMockConfig({ bump: { type: 'patch' } })

      const result = await getPackagesOrBumpedPackages({
        config,
        bumpResult: undefined,
        suffix: undefined,
        force: false,
      })

      expect(getPackages).toHaveBeenCalledWith({
        config,
        patterns: config.monorepo?.packages,
        suffix: undefined,
        force: false,
      })
      expect(result).toEqual([
        { name: 'pkg-a', version: '1.0.0' },
        { name: 'pkg-b', version: '2.0.0' },
      ])
    })

    it('Then calls getPackages with suffix parameter', async () => {
      const { getPackages } = await import('../repo')
      const config = createMockConfig({ bump: { type: 'patch' } })

      await getPackagesOrBumpedPackages({
        config,
        bumpResult: undefined,
        suffix: 'beta',
        force: true,
      })

      expect(getPackages).toHaveBeenCalledWith({
        config,
        patterns: config.monorepo?.packages,
        suffix: 'beta',
        force: true,
      })
    })
  })

  describe('When bumpResult has empty bumpedPackages array', () => {
    it('Then calls getPackages instead', async () => {
      const { getPackages } = await import('../repo')
      const config = createMockConfig({ bump: { type: 'patch' } })
      const bumpResult = {
        bumpedPackages: [],
        detectedReleaseType: 'patch' as const,
        oldVersion: '1.0.0',
        newVersion: '1.0.1',
        bumped: true as const,
      }

      await getPackagesOrBumpedPackages({
        config,
        bumpResult,
        suffix: undefined,
        force: false,
      })

      expect(getPackages).toHaveBeenCalled()
    })
  })
})
