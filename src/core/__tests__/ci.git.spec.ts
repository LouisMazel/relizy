import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { createMockConfig } from '../../../tests/mocks'
import { applyCiGitIdentity, attachCiBranch, ensureFullHistory, ensurePushAccess, getCiBranch, getCiGitIdentity, RELIZY_BOT_IDENTITY, resetCiState } from '../ci'

// The setup file mocks this module and execPromise: these tests run the real git commands on temporary repositories
vi.unmock('../ci')
vi.mock('@maz-ui/node', importActual => importActual())

/** The variables telling relizy it runs in a CI, cleared so the tests run the same locally and in CI */
const CI_VARIABLES = ['CI', 'CONTINUOUS_INTEGRATION', 'GITHUB_ACTIONS', 'GITHUB_WORKFLOW', 'GITLAB_CI', 'BUILD_ID', 'JENKINS_URL', 'JENKINS_HOME', 'GIT_AUTHOR_NAME', 'GIT_COMMITTER_NAME', 'GIT_CONFIG_COUNT']

const dirs: string[] = []

function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-ci-')))
  dirs.push(dir)
  return dir
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** A repository with 3 commits and the tag v1.0.0 on the first one */
function createOrigin(): string {
  const cwd = tempDir()
  git(cwd, 'init', '--quiet', '--initial-branch=main')
  for (const name of ['a', 'b', 'c']) {
    writeFileSync(join(cwd, name), name)
    git(cwd, 'add', name)
    git(cwd, '-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', 'commit', '--quiet', '-m', `feat: add ${name}`)
    if (name === 'a') {
      git(cwd, 'tag', 'v1.0.0')
    }
  }
  return cwd
}

function clone(origin: string, ...args: string[]): string {
  const cwd = join(tempDir(), 'clone')
  execFileSync('git', ['clone', '--quiet', ...args, `file://${origin}`, cwd])
  return cwd
}

function inCI(env: Record<string, string> = {}) {
  for (const [name, value] of Object.entries({ CI: 'true', ...env })) {
    vi.stubEnv(name, value)
  }
}

beforeEach(() => {
  for (const name of CI_VARIABLES) {
    vi.stubEnv(name, undefined)
  }
  // No identity from the git config of the machine
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null')
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
  resetCiState()
  vi.spyOn(logger, 'info').mockImplementation(() => undefined)
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('Given the person who started the release in a CI', () => {
  it('When on GitHub Actions, Then is the actor with their noreply email', () => {
    expect(getCiGitIdentity({ GITHUB_ACTIONS: 'true', GITHUB_ACTOR: 'LouisMazel', GITHUB_ACTOR_ID: '12446546' }))
      .toEqual({ name: 'LouisMazel', email: '12446546+LouisMazel@users.noreply.github.com' })
    // GitHub Enterprise Server
    expect(getCiGitIdentity({ GITHUB_ACTIONS: 'true', GITHUB_ACTOR: 'jane', GITHUB_ACTOR_ID: '7', GITHUB_SERVER_URL: 'https://github.acme.com' }).email)
      .toBe('7+jane@users.noreply.github.acme.com')
  })

  it('When the actor is a bot, Then is relizy[bot]', () => {
    expect(getCiGitIdentity({ GITHUB_ACTIONS: 'true', GITHUB_ACTOR: 'dependabot[bot]', GITHUB_ACTOR_ID: '49699333' })).toEqual(RELIZY_BOT_IDENTITY)
    expect(getCiGitIdentity({ GITLAB_CI: 'true', GITLAB_USER_LOGIN: 'project_42_bot_1a2b', GITLAB_USER_ID: '99' })).toEqual(RELIZY_BOT_IDENTITY)
  })

  it('When on GitLab CI, Then is the user with the noreply email of the instance, not their own email', () => {
    expect(getCiGitIdentity({ GITLAB_CI: 'true', GITLAB_USER_LOGIN: 'lmazel', GITLAB_USER_ID: '42', GITLAB_USER_NAME: 'Louis Mazel', GITLAB_USER_EMAIL: 'louis@acme.com', CI_SERVER_HOST: 'gitlab.acme.com' }))
      .toEqual({ name: 'Louis Mazel', email: '42-lmazel@users.noreply.gitlab.acme.com' })
  })

  it('When the CI does not tell, Then is relizy[bot]', () => {
    expect(getCiGitIdentity({ CI: 'true', BITBUCKET_BUILD_NUMBER: '12' })).toEqual(RELIZY_BOT_IDENTITY)
  })
})

describe('Given the branch of a CI job', () => {
  it('Then is read from the variables of the CI, none for the pull requests and the tags', () => {
    expect(getCiBranch({ GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' })).toBe('main')
    expect(getCiBranch({ GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.0.0' })).toBeUndefined()
    // A pull request: its branch, not `<number>/merge`
    expect(getCiBranch({ GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: '123/merge', GITHUB_HEAD_REF: 'feat/parser' })).toBe('feat/parser')
    expect(getCiBranch({ GITLAB_CI: 'true', CI_COMMIT_BRANCH: 'develop' })).toBe('develop')
    expect(getCiBranch({ GITLAB_CI: 'true', CI_MERGE_REQUEST_IID: '12' })).toBeUndefined()
    expect(getCiBranch({ TF_BUILD: 'True', BUILD_SOURCEBRANCH: 'refs/heads/release' })).toBe('release')
    expect(getCiBranch({ JENKINS_URL: 'https://ci', GIT_BRANCH: 'origin/main' })).toBe('main')
  })
})

describe('Given a shallow clone', () => {
  it('When in a CI, Then fetches the full history and the tags', () => {
    const cwd = clone(createOrigin(), '--depth', '1', '--no-tags')
    inCI()

    ensureFullHistory(cwd)

    expect(git(cwd, 'rev-parse', '--is-shallow-repository')).toBe('false')
    expect(git(cwd, 'rev-list', '--count', 'HEAD')).toBe('3')
    expect(git(cwd, 'tag')).toBe('v1.0.0')
  })

  it('When outside a CI, Then only warns with the command to run', () => {
    const cwd = clone(createOrigin(), '--depth', '1')

    ensureFullHistory(cwd)

    expect(git(cwd, 'rev-parse', '--is-shallow-repository')).toBe('true')
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('git fetch --unshallow --tags'))
  })
})

describe('Given a detached HEAD in a CI job', () => {
  it('When the CI tells the branch, Then checks it out, tracking the remote one', () => {
    const cwd = clone(createOrigin())
    git(cwd, 'checkout', '--quiet', '--detach')
    inCI({ GITLAB_CI: 'true', CI_COMMIT_BRANCH: 'main' })

    attachCiBranch(cwd)

    expect(git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(git(cwd, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/main')
  })

  it('When the CI does not tell the branch (merge request pipeline), Then leaves it detached', () => {
    const cwd = clone(createOrigin())
    git(cwd, 'checkout', '--quiet', '--detach')
    inCI({ GITLAB_CI: 'true', CI_MERGE_REQUEST_IID: '12' })

    attachCiBranch(cwd)

    expect(git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD')
  })
})

describe('Given the identity of the release commit', () => {
  it('When the CI job has none, Then commits as the person who started the release, without changing the git config', () => {
    const cwd = clone(createOrigin())
    inCI({ GITHUB_ACTIONS: 'true', GITHUB_ACTOR: 'LouisMazel', GITHUB_ACTOR_ID: '12446546' })
    const env = { ...process.env }

    expect(applyCiGitIdentity(cwd, env)).toEqual({ name: 'LouisMazel', email: '12446546+LouisMazel@users.noreply.github.com' })

    writeFileSync(join(cwd, 'd'), 'd')
    git(cwd, 'add', 'd')
    execFileSync('git', ['commit', '--quiet', '-m', 'chore(release): v1.1.0'], { cwd, env })
    expect(git(cwd, 'log', '-1', '--format=%an <%ae> / %cn <%ce>')).toBe('LouisMazel <12446546+LouisMazel@users.noreply.github.com> / LouisMazel <12446546+LouisMazel@users.noreply.github.com>')
    // Still no user.name in the git config
    expect(() => execFileSync('git', ['config', 'user.name'], { cwd, stdio: 'pipe' })).toThrow()
  })

  it('When the job sets one, Then keeps it', () => {
    const cwd = clone(createOrigin())
    git(cwd, 'config', 'user.name', 'Release Bot')
    git(cwd, 'config', 'user.email', 'bot@acme.com')
    inCI({ GITHUB_ACTIONS: 'true', GITHUB_ACTOR: 'LouisMazel', GITHUB_ACTOR_ID: '12446546' })

    expect(applyCiGitIdentity(cwd, { ...process.env })).toBeUndefined()
    expect(applyCiGitIdentity(cwd, { ...process.env, GIT_AUTHOR_NAME: 'Release Bot' })).toBeUndefined()
  })
})

describe('Given the push of the release', () => {
  it('When the remote accepts it, Then lets the release go on', async () => {
    const origin = createOrigin()
    const cwd = clone(origin)
    // A pushed branch cannot be the checked out branch of a non-bare repository
    git(origin, 'checkout', '--quiet', '--detach')

    await expect(ensurePushAccess({ config: createMockConfig({ cwd }) })).resolves.toBeUndefined()
  })

  it('When the job token of GitLab cannot push, Then pushes with the GitLab token through the environment, and fails before publishing when it cannot either', async () => {
    const cwd = clone(createOrigin())
    // Refused at once: nothing listens on the port 9
    const remoteUrl = 'http://gitlab-ci-token:job-token@127.0.0.1:9/acme/lib.git'
    git(cwd, 'remote', 'set-url', 'origin', remoteUrl)
    inCI({ GITLAB_CI: 'true', CI_JOB_TOKEN: 'job-token', CI_SERVER_URL: 'http://127.0.0.1:9', CI_PROJECT_PATH: 'acme/lib' })
    const env: NodeJS.ProcessEnv = { ...process.env }
    const config = createMockConfig({ cwd, tokens: { gitlab: 'project-token' } })

    await expect(ensurePushAccess({ config, env })).rejects.toThrow('The release commit and the tags cannot be pushed to "origin" from GitLab CI.\nSet a GITLAB_TOKEN variable')

    expect(env.GIT_CONFIG_COUNT).toBe('1')
    expect(env.GIT_CONFIG_KEY_0).toBe('url.http://oauth2:project-token@127.0.0.1:9/acme/lib.git.pushInsteadOf')
    expect(env.GIT_CONFIG_VALUE_0).toBe(remoteUrl)
  })

  it('When the token is the job token itself, Then does not retry with it', async () => {
    const cwd = clone(createOrigin())
    git(cwd, 'remote', 'set-url', 'origin', 'http://gitlab-ci-token:job-token@127.0.0.1:9/acme/lib.git')
    inCI({ GITLAB_CI: 'true', CI_JOB_TOKEN: 'job-token', CI_SERVER_URL: 'http://127.0.0.1:9', CI_PROJECT_PATH: 'acme/lib' })
    const env: NodeJS.ProcessEnv = { ...process.env }

    await expect(ensurePushAccess({ config: createMockConfig({ cwd, tokens: { gitlab: 'job-token' } }), env })).rejects.toThrow('cannot be pushed')
    expect(env.GIT_CONFIG_COUNT).toBeUndefined()
  })
})
