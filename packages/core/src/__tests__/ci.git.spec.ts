import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyCiGitIdentity, attachCiBranch, ensureFullHistory, ensurePushAccess, getCiBranch, getCiGitIdentity, getPullRequestOutdatedWarning, getPullRequestPushWarning, isPullRequestRun, prepareCiRepository, RELIZY_BOT_IDENTITY } from '../ci'
import { withGitCache } from '../git-cache'

// These tests run the real git commands on temporary repositories
const logger = {
  info: vi.fn(),
  warn: vi.fn(),
}

/** The variables telling relizy it runs in a CI, cleared so the tests run the same locally and in CI */
const CI_VARIABLES = [
  'CI',
  'CONTINUOUS_INTEGRATION',
  'GITHUB_ACTIONS',
  'GITHUB_WORKFLOW',
  'GITLAB_CI',
  'BUILD_ID',
  'JENKINS_URL',
  'JENKINS_HOME',
  'GIT_AUTHOR_NAME',
  'GIT_COMMITTER_NAME',
  'GIT_CONFIG_COUNT',
]

const dirs: string[] = []

function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-ci-')))
  dirs.push(dir)
  return dir
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
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
  execFileSync('git', [
    'clone',
    '--quiet',
    ...args,
    `file://${origin}`,
    cwd,
  ])
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
  logger.info.mockReset()
  logger.warn.mockReset()
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
    expect(getCiGitIdentity({
      GITHUB_ACTIONS: 'true',
      GITHUB_ACTOR: 'jane',
      GITHUB_ACTOR_ID: '7',
      GITHUB_SERVER_URL: 'https://github.acme.com',
    }).email)
      .toBe('7+jane@users.noreply.github.acme.com')
  })

  it('When the actor is a bot, Then is relizy[bot]', () => {
    expect(getCiGitIdentity({ GITHUB_ACTIONS: 'true', GITHUB_ACTOR: 'dependabot[bot]', GITHUB_ACTOR_ID: '49699333' })).toEqual(RELIZY_BOT_IDENTITY)
    expect(getCiGitIdentity({ GITLAB_CI: 'true', GITLAB_USER_LOGIN: 'project_42_bot_1a2b', GITLAB_USER_ID: '99' })).toEqual(RELIZY_BOT_IDENTITY)
  })

  it('When on GitLab CI, Then is the user with the noreply email of the instance, not their own email', () => {
    expect(getCiGitIdentity({
      GITLAB_CI: 'true',
      GITLAB_USER_LOGIN: 'lmazel',
      GITLAB_USER_ID: '42',
      GITLAB_USER_NAME: 'Louis Mazel',
      GITLAB_USER_EMAIL: 'louis@acme.com',
      CI_SERVER_HOST: 'gitlab.acme.com',
    }))
      .toEqual({ name: 'Louis Mazel', email: '42-lmazel@users.noreply.gitlab.acme.com' })
  })

  it('When the CI does not tell, Then is relizy[bot]', () => {
    expect(getCiGitIdentity({ CI: 'true', BITBUCKET_BUILD_NUMBER: '12' })).toEqual(RELIZY_BOT_IDENTITY)
  })
})

describe('Given the branch of a CI job', () => {
  it('Then is read from the variables of the CI, the head branch for the pull and merge requests, none for the tags', () => {
    expect(getCiBranch({ GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' })).toBe('main')
    expect(getCiBranch({ GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.0.0' })).toBeUndefined()
    // A pull request: its branch, not `<number>/merge`
    expect(getCiBranch({
      GITHUB_ACTIONS: 'true',
      GITHUB_REF_TYPE: 'branch',
      GITHUB_REF_NAME: '123/merge',
      GITHUB_HEAD_REF: 'feat/parser',
    })).toBe('feat/parser')
    expect(getCiBranch({ GITLAB_CI: 'true', CI_COMMIT_BRANCH: 'develop' })).toBe('develop')
    expect(getCiBranch({ GITLAB_CI: 'true', CI_MERGE_REQUEST_IID: '12', CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: 'feat/parser' })).toBe('feat/parser')
    expect(getCiBranch({ GITLAB_CI: 'true', CI_COMMIT_TAG: 'v1.0.0' })).toBeUndefined()
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

    ensureFullHistory(cwd, { logger })

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

  it('When a merge request pipeline, Then checks out the source branch of the merge request, tracking the remote one', () => {
    const cwd = clone(createOrigin())
    git(cwd, 'checkout', '--quiet', '--detach')
    inCI({ GITLAB_CI: 'true', CI_PIPELINE_SOURCE: 'merge_request_event', CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: 'main' })

    attachCiBranch(cwd)

    expect(git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(git(cwd, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/main')
  })

  it('When the source branch of the merge request is not on the remote (a fork), Then checks it out without upstream', () => {
    const cwd = clone(createOrigin())
    git(cwd, 'checkout', '--quiet', '--detach')
    inCI({ GITLAB_CI: 'true', CI_PIPELINE_SOURCE: 'merge_request_event', CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: 'fork/feat' })

    attachCiBranch(cwd)

    expect(git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('fork/feat')
    expect(() => git(cwd, 'rev-parse', '--abbrev-ref', '@{upstream}')).toThrow()
  })

  it('When the CI does not tell the branch (tag pipeline), Then leaves it detached', () => {
    const cwd = clone(createOrigin())
    git(cwd, 'checkout', '--quiet', '--detach')
    inCI({ GITLAB_CI: 'true', CI_COMMIT_TAG: 'v1.0.0' })

    attachCiBranch(cwd)

    expect(git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD')
  })
})

describe('Given the identity of the release commit', () => {
  it('When the CI job has none, Then commits as the person who started the release, without changing the git config', () => {
    const cwd = clone(createOrigin())
    inCI({ GITHUB_ACTIONS: 'true', GITHUB_ACTOR: 'LouisMazel', GITHUB_ACTOR_ID: '12446546' })
    const env = { ...process.env }

    expect(applyCiGitIdentity(cwd, { env })).toEqual({ name: 'LouisMazel', email: '12446546+LouisMazel@users.noreply.github.com' })

    writeFileSync(join(cwd, 'd'), 'd')
    git(cwd, 'add', 'd')
    execFileSync('git', [
      'commit',
      '--quiet',
      '-m',
      'chore(release): v1.1.0',
    ], { cwd, env })
    expect(git(cwd, 'log', '-1', '--format=%an <%ae> / %cn <%ce>')).toBe('LouisMazel <12446546+LouisMazel@users.noreply.github.com> / LouisMazel <12446546+LouisMazel@users.noreply.github.com>')
    // Still no user.name in the git config
    expect(() => execFileSync('git', ['config', 'user.name'], { cwd, stdio: 'pipe' })).toThrow()
  })

  it('When the job sets one, Then keeps it', () => {
    const cwd = clone(createOrigin())
    git(cwd, 'config', 'user.name', 'Release Bot')
    git(cwd, 'config', 'user.email', 'bot@acme.com')
    inCI({ GITHUB_ACTIONS: 'true', GITHUB_ACTOR: 'LouisMazel', GITHUB_ACTOR_ID: '12446546' })

    expect(applyCiGitIdentity(cwd, {
      env: { ...process.env },
    })).toBeUndefined()
    expect(applyCiGitIdentity(cwd, {
      env: { ...process.env, GIT_AUTHOR_NAME: 'Release Bot' },
    })).toBeUndefined()
  })
  it('When the command only reads the repository, Then sets no identity', () => {
    const cwd = clone(createOrigin())
    inCI({ GITHUB_ACTIONS: 'true', GITHUB_ACTOR: 'LouisMazel', GITHUB_ACTOR_ID: '12446546' })

    prepareCiRepository(cwd, { commit: false })
    expect(process.env.GIT_AUTHOR_NAME).toBeUndefined()

    prepareCiRepository(cwd)
    expect(process.env.GIT_AUTHOR_NAME).toBe('LouisMazel')
  })
})

describe('Given the push of the release', () => {
  it('When the remote accepts it, Then lets the release go on', async () => {
    const origin = createOrigin()
    const cwd = clone(origin)
    // A pushed branch cannot be the checked out branch of a non-bare repository
    git(origin, 'checkout', '--quiet', '--detach')

    await expect(ensurePushAccess({ cwd })).resolves.toBeUndefined()
  })

  it('When the branch is behind its remote, Then lets the check of the branch report it, not the credentials', async () => {
    const origin = createOrigin()
    const cwd = clone(origin)
    // The remote branch gets a commit the clone does not have: git refuses the push as non-fast-forward
    writeFileSync(join(origin, 'remote-only'), 'remote')
    git(origin, 'add', 'remote-only')
    git(origin, '-c', 'user.name=Remote', '-c', 'user.email=remote@acme.com', 'commit', '--quiet', '-m', 'feat: remote only')
    git(origin, 'checkout', '--quiet', '--detach')

    await expect(ensurePushAccess({ cwd })).resolves.toBeUndefined()
  })

  it('When the push is refused, Then checks it once per run, and again in the next run once the remote accepts it', async () => {
    const origin = createOrigin()
    const cwd = clone(origin)
    const config = { cwd }
    git(origin, 'checkout', '--quiet', '--detach')
    // Refused at once: nothing listens on the port 9
    git(cwd, 'remote', 'set-url', 'origin', 'http://127.0.0.1:9/acme/lib.git')

    await withGitCache(async () => {
      await expect(ensurePushAccess(config)).rejects.toThrow('cannot push')
      git(cwd, 'remote', 'set-url', 'origin', `file://${origin}`)
      await expect(ensurePushAccess(config)).rejects.toThrow('cannot push')
    })

    await expect(withGitCache(() => ensurePushAccess(config))).resolves.toBeUndefined()
  })

  it('When the job token of GitLab cannot push, Then pushes with the GitLab token through the environment, and fails before publishing when it cannot either', async () => {
    const cwd = clone(createOrigin())
    // Refused at once: nothing listens on the port 9
    const remoteUrl = 'http://gitlab-ci-token:job-token@127.0.0.1:9/acme/lib.git'
    git(cwd, 'remote', 'set-url', 'origin', remoteUrl)
    inCI({
      GITLAB_CI: 'true',
      CI_JOB_TOKEN: 'job-token',
      CI_SERVER_URL: 'http://127.0.0.1:9',
      CI_PROJECT_PATH: 'acme/lib',
    })
    const env: NodeJS.ProcessEnv = { ...process.env }

    await expect(ensurePushAccess({ cwd, gitlabToken: 'project-token', env })).rejects.toThrow(/^relizy cannot push the release commit and tags to "origin" from GitLab CI: the job token cannot push\.\nGit refused it with:\n {2}fatal: unable to access .+\nFix: add a GITLAB_TOKEN CI\/CD variable/)

    expect(env.GIT_CONFIG_COUNT).toBe('1')
    expect(env.GIT_CONFIG_KEY_0).toBe('url.http://oauth2:project-token@127.0.0.1:9/acme/lib.git.pushInsteadOf')
    expect(env.GIT_CONFIG_VALUE_0).toBe(remoteUrl)
  })

  it('When the token is the job token itself, Then does not retry with it', async () => {
    const cwd = clone(createOrigin())
    git(cwd, 'remote', 'set-url', 'origin', 'http://gitlab-ci-token:job-token@127.0.0.1:9/acme/lib.git')
    inCI({
      GITLAB_CI: 'true',
      CI_JOB_TOKEN: 'job-token',
      CI_SERVER_URL: 'http://127.0.0.1:9',
      CI_PROJECT_PATH: 'acme/lib',
    })
    const env: NodeJS.ProcessEnv = { ...process.env }

    await expect(ensurePushAccess({ cwd, gitlabToken: 'job-token', env })).rejects.toThrow('cannot push')
    expect(env.GIT_CONFIG_COUNT).toBeUndefined()
  })

  it('When outside a CI, Then fails with the remote, without its credentials, and the fix', async () => {
    const cwd = clone(createOrigin())
    git(cwd, 'remote', 'set-url', 'origin', 'http://dev:secret@127.0.0.1:9/acme/lib.git')

    const error = await ensurePushAccess({ cwd }).then(() => new Error('pushed'), (error: Error) => error)

    expect(error.message).toMatch(/^relizy cannot push the release commit and tags to "origin" \(http:\/\/127\.0\.0\.1:9\/acme\/lib\.git\): git push --dry-run was refused\.\n/)
    // Why git refused it, without the credentials of the remote
    expect(error.message).toContain('Git refused it with:\n  fatal: unable to access \'http://127.0.0.1:9/acme/lib.git/\'')
    expect(error.message).not.toContain('secret')
    expect(error.message).toMatch(/\nFix: check that your git credentials can push to this repository \(SSH key, or a token allowed to write\), or release without pushing with --no-push\.$/)
  })

  it('When on GitHub Actions, Then fails with the permissions to give to the workflow', async () => {
    const cwd = clone(createOrigin())
    git(cwd, 'remote', 'set-url', 'origin', 'http://127.0.0.1:9/acme/lib.git')
    inCI({ GITHUB_ACTIONS: 'true' })

    await expect(ensurePushAccess({ cwd })).rejects.toThrow(
      /from GitHub Actions: the token of the job cannot push\.\nGit refused it with:\n.+\nFix: give the release job write access in your workflow:\n\n {2}permissions:\n {4}contents: write\n\n/,
    )
  })
})

describe('Given a run of a pull request', () => {
  it('Then is detected on GitHub Actions and GitLab CI', () => {
    expect(isPullRequestRun({ GITHUB_EVENT_NAME: 'pull_request' })).toBe(true)
    expect(isPullRequestRun({ GITHUB_EVENT_NAME: 'pull_request_target' })).toBe(true)
    expect(isPullRequestRun({ CI_PIPELINE_SOURCE: 'merge_request_event' })).toBe(true)
    expect(isPullRequestRun({ GITHUB_EVENT_NAME: 'push' })).toBe(false)
    expect(isPullRequestRun({ CI_PIPELINE_SOURCE: 'push' })).toBe(false)
  })

  it('Then warns that the release job checks the push, with what it needs', () => {
    expect(getPullRequestPushWarning({ GITHUB_ACTIONS: 'true' })).toContain('"permissions: contents: write"')
    expect(getPullRequestPushWarning({ GITLAB_CI: 'true' })).toContain('GITLAB_TOKEN')
  })

  it('Then explains that an outdated run of a pull request needs no fix', () => {
    expect(getPullRequestOutdatedWarning({
      upstream: 'origin/feat',
      missingCommits: 2,
      env: { GITHUB_ACTIONS: 'true' },
    }))
      .toBe('This run is outdated: 2 new commit(s) were pushed to the pull request ("origin/feat") after it started.\n'
        + 'Nothing to fix: the run of the latest commit previews the release with them, and the release checks the branch again.')
    expect(getPullRequestOutdatedWarning({
      upstream: 'origin/feat',
      missingCommits: 1,
      env: { GITLAB_CI: 'true' },
    })).toContain('pushed to the merge request')
  })
})
