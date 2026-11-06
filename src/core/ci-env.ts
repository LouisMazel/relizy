import process from 'node:process'

/**
 * Detection of the CI from the environment. Leaf module (only node
 * built-ins): the output of the CLI reads it too.
 */
type Env = NodeJS.ProcessEnv

/** A flag variable: set, and neither `false` nor `0` (`CI=true`, `CI=1`, `TF_BUILD=True`) */
function isFlagSet(env: Env, name: string): boolean {
  const value = env[name]
  return Boolean(value) && value !== 'false' && value !== '0'
}

/** The CI providers, the first matching one names the CI */
const CI_PROVIDERS: { name: string, detect: (env: Env) => boolean }[] = [
  { name: 'GitHub Actions', detect: env => isFlagSet(env, 'GITHUB_ACTIONS') || Boolean(env.GITHUB_WORKFLOW) },
  { name: 'GitLab CI', detect: env => isFlagSet(env, 'GITLAB_CI') },
  { name: 'CircleCI', detect: env => isFlagSet(env, 'CIRCLECI') },
  { name: 'Travis CI', detect: env => isFlagSet(env, 'TRAVIS') },
  { name: 'Jenkins', detect: env => Boolean(env.JENKINS_HOME || env.JENKINS_URL) },
  { name: 'Azure Pipelines', detect: env => isFlagSet(env, 'TF_BUILD') || isFlagSet(env, 'AZURE_PIPELINES') },
  { name: 'TeamCity', detect: env => Boolean(env.TEAMCITY_VERSION) },
  { name: 'Bitbucket Pipelines', detect: env => Boolean(env.BITBUCKET_BUILD_NUMBER) },
  { name: 'Drone', detect: env => isFlagSet(env, 'DRONE') },
  { name: 'AppVeyor', detect: env => isFlagSet(env, 'APPVEYOR') },
  { name: 'Buildkite', detect: env => isFlagSet(env, 'BUILDKITE') },
  { name: 'AWS CodeBuild', detect: env => Boolean(env.CODEBUILD_BUILD_ID) },
  { name: 'Netlify', detect: env => isFlagSet(env, 'NETLIFY') },
  { name: 'Vercel', detect: env => isFlagSet(env, 'VERCEL') },
  { name: 'Heroku CI', detect: env => Boolean(env.HEROKU_TEST_RUN_ID) },
  { name: 'Buddy', detect: env => isFlagSet(env, 'BUDDY') },
  { name: 'Semaphore', detect: env => isFlagSet(env, 'SEMAPHORE') },
  { name: 'Codefresh', detect: env => Boolean(env.CF_BUILD_ID) },
  { name: 'Bamboo', detect: env => Boolean(env.bamboo_buildKey) },
  { name: 'Google Cloud Build', detect: env => Boolean(env.BUILD_ID && env.PROJECT_ID) },
  { name: 'Screwdriver', detect: env => isFlagSet(env, 'SCREWDRIVER') },
  { name: 'Strider', detect: env => isFlagSet(env, 'STRIDER') },
]

/**
 * The name of the CI relizy runs in, `Unknown CI` for a CI only telling it
 * runs in one (`CI`, `CONTINUOUS_INTEGRATION`, `BUILD_ID`), or null outside a CI
 */
export function getCIName(env: Env = process.env): string | null {
  const provider = CI_PROVIDERS.find(({ detect }) => detect(env))

  if (provider) {
    return provider.name
  }

  return isFlagSet(env, 'CI') || isFlagSet(env, 'CONTINUOUS_INTEGRATION') || env.BUILD_ID ? 'Unknown CI' : null
}

/**
 * Whether relizy runs in a CI: it then never prompts, prepares the clone of
 * the job and shows the `ci` output
 */
export function isInCI(env: Env = process.env): boolean {
  return getCIName(env) !== null
}
