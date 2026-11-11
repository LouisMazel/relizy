import process from 'node:process'
import { getCIName, isInCI } from '../ci-env'

vi.mock('node:process', async importActual => ({
  ...(await importActual()),
  env: {},
}))

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
    it('Then returns true for CI=1, and false for CI=false or CI=0', () => {
      expect(isInCI({ CI: '1' })).toBe(true)
      expect(isInCI({ CI: 'false' })).toBe(false)
      expect(isInCI({ CI: '0' })).toBe(false)
    })

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
