import type { WorkflowOptions } from '../ci-workflow'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { findCiSetup, getInstallDependenciesCommand, getMergePreviewWorkflowFile, getRelizyCommand, getWorkflowFile, getWorkflowSecrets, isGeneratedWorkflow } from '../ci-workflow'

const options: WorkflowOptions = {
  provider: 'github',
  trigger: 'manual',
  packageManager: 'pnpm',
  branch: 'main',
  yarnBerry: false,
  publish: false,
  prComment: false,
  mergePreview: false,
  twitter: false,
  slack: false,
  teams: false,
  ai: false,
  releaseCommitPrefix: 'chore(release): ',
  integration: true,
  pnpmPinned: true,
  registryNeedsToken: false,
}

describe('Given the release workflow of GitHub Actions', () => {
  it('When released on demand, Then runs the relizy action with the chosen release type', () => {
    const { content } = getWorkflowFile(options, '/nonexistent')

    // eslint-disable-next-line no-template-curly-in-string -- an expression of GitHub Actions
    expect(content).toContain('      - id: release\n        uses: relizy/action@v2\n        with:\n          release-type: ${{ inputs.release }}\n')
  })

  it('When released at each push, Then runs on the default branch, without input', () => {
    const { content } = getWorkflowFile({ ...options, trigger: 'push', branch: 'develop' }, '/nonexistent')

    expect(content).toContain('on:\n  push:\n    branches: [develop]\n')
    expect(content).not.toContain('workflow_dispatch')
    expect(content).toContain('        uses: relizy/action@v2\n      # The outputs')
  })

  it('When the config needs no secret nor PR comment, Then only asks the permission to push, the action takes the token of the run', () => {
    const { content } = getWorkflowFile(options, '/nonexistent')

    expect(content).toContain('      contents: write\n    steps:')
    expect(content).not.toContain('pull-requests')
    expect(content).not.toContain('GITHUB_TOKEN')
    expect(getWorkflowSecrets(options)).toEqual([])
  })

  it('Then leaves the setup of Node.js, the package manager and the dependencies to the action', () => {
    const { content } = getWorkflowFile({
      ...options,
      packageManager: 'bun',
      nodeVersionFile: '.nvmrc',
      publish: true,
      ai: true,
    }, '/nonexistent')

    expect(content).not.toContain('setup-node')
    expect(content).not.toContain('setup-bun')
    expect(content).not.toContain('npm install')
  })

  it('When the release needs secrets, Then gives each one to its input, named after its variable', () => {
    const { content } = getWorkflowFile({
      ...options,
      publish: true,
      twitter: true,
      slack: true,
      teams: true,
      ai: true,
    }, '/nonexistent')

    /* eslint-disable no-template-curly-in-string -- expressions of GitHub Actions */
    expect(content).toContain('          npm-token: ${{ secrets.NPM_TOKEN }}\n')
    expect(content).toContain('          twitter-access-token-secret: ${{ secrets.TWITTER_ACCESS_TOKEN_SECRET }}\n')
    expect(content).toContain('          slack-token: ${{ secrets.SLACK_TOKEN }}\n')
    expect(content).toContain('          teams-webhook-url: ${{ secrets.TEAMS_WEBHOOK_URL }}\n')
    expect(content).toContain('          claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}\n')
    /* eslint-enable no-template-curly-in-string */
  })
})

describe('Given the release job of a project on gitlab.com', () => {
  const gitlab: WorkflowOptions = { ...options, provider: 'gitlab', gitlabCom: true }

  it('When released on demand, Then includes the component with the release type of the pipeline form', () => {
    const { content } = getWorkflowFile(gitlab, '/nonexistent')

    expect(content).toContain('variables:\n  RELEASE_TYPE:\n    value: auto\n')
    expect(content).toMatch(/include:\n {2}# .+\n {2}- component: gitlab\.com\/relizy\/relizy\/release@2\n$/)
    expect(content).not.toContain('release:\n  stage')
  })

  it('When released at each push, Then runs the component at each push, with the Node version of the project', () => {
    const { content } = getWorkflowFile({ ...gitlab, trigger: 'push', nodeVersion: '22' }, '/nonexistent')

    expect(content).not.toContain('RELEASE_TYPE')
    expect(content).toContain('  - component: gitlab.com/relizy/relizy/release@2\n    inputs:\n      when: on_success\n      image: node:22\n')
  })

  it('When the release commit has a custom message, Then skips it with an escaped regular expression', () => {
    expect(getWorkflowFile({ ...gitlab, releaseCommitPrefix: 'release(\'s): v' }, '/nonexistent').content).toContain('      skip-commit: \'^release\\(\'\'s\\): v\'\n')
    expect(getWorkflowFile({ ...gitlab, releaseCommitPrefix: '' }, '/nonexistent').content).toContain('      skip-commit: \'^$\'\n')
  })

  it('Then lists the CI/CD variables to create, read by the component under the same names', () => {
    expect(getWorkflowFile({ ...gitlab, publish: true }, '/nonexistent').content).toContain('Settings > CI/CD > Variables): GITLAB_TOKEN, NPM_TOKEN\n')
  })
})

describe('Given a workflow that publishes to npm', () => {
  it('Then gives the OIDC permission of trusted publishing on GitHub Actions, the action updates npm', () => {
    const { content } = getWorkflowFile({ ...options, publish: true }, '/nonexistent')

    expect(content).toContain('      contents: write\n      # npm trusted publishing (OIDC): publishes without NPM_TOKEN once set up on npmjs.com\n      id-token: write\n')
  })

  it('Then gives the NPM_ID_TOKEN id token and a recent npm on GitLab CI', () => {
    const { content } = getWorkflowFile({ ...options, provider: 'gitlab', publish: true }, '/nonexistent')

    expect(content).toContain('  id_tokens:\n    NPM_ID_TOKEN:\n      aud: npm:registry.npmjs.org\n')
    expect(content).toContain('    - npm install -g npm@latest\n')
  })

  it('Then gives neither without publishing', () => {
    expect(getWorkflowFile(options, '/nonexistent').content).not.toContain('id-token')
    expect(getWorkflowFile({ ...options, provider: 'gitlab' }, '/nonexistent').content).not.toContain('id_tokens')
  })
})

describe('Given the release job of a self-managed GitLab', () => {
  it('Then skips the release commit, escaping a custom commit message for the regular expression and the YAML quotes', () => {
    const { content, path } = getWorkflowFile({ ...options, provider: 'gitlab', releaseCommitPrefix: 'release(\'s): v' }, '/nonexistent')

    expect(path).toBe('.gitlab-ci.yml')
    expect(content).toContain('    - if: \'$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH && $CI_COMMIT_MESSAGE !~ /^release\\(\'\'s\\): v/\'\n      when: manual\n')
  })

  it('Then lists the CI/CD variables to create, with the token able to push', () => {
    expect(getWorkflowSecrets({
      ...options,
      provider: 'gitlab',
      publish: true,
      slack: true,
    })).toEqual(['GITLAB_TOKEN', 'NPM_TOKEN', 'SLACK_TOKEN'])
  })

  it('Then asks the URL of the Teams workflow in base64, as a masked variable refuses its characters', () => {
    expect(getWorkflowSecrets({ ...options, provider: 'gitlab', teams: true })).toEqual(['GITLAB_TOKEN', 'TEAMS_WEBHOOK_URL_B64'])
    expect(getWorkflowSecrets({ ...options, teams: true })).toEqual(['TEAMS_WEBHOOK_URL'])
    // eslint-disable-next-line no-template-curly-in-string -- an expression of GitHub Actions
    expect(getWorkflowFile({ ...options, teams: true }, '/nonexistent').content).toContain('teams-webhook-url: ${{ secrets.TEAMS_WEBHOOK_URL }}')
  })
})

describe('Given the commands of a package manager', () => {
  it('Then installs corepack before enabling it, as Node 25+ no longer ships it', () => {
    expect(getWorkflowFile({ ...options, provider: 'gitlab' }, '/nonexistent').content).toContain('    - npm install -g corepack && corepack enable\n    - pnpm install --frozen-lockfile\n')
    expect(getWorkflowFile({ ...options, provider: 'gitlab', packageManager: 'npm' }, '/nonexistent').content).not.toContain('corepack')
  })

  it('Then installs from the lockfile and runs the relizy of the project', () => {
    expect(['npm', 'pnpm', 'yarn', 'bun'].map(packageManager => getInstallDependenciesCommand({ packageManager: packageManager as WorkflowOptions['packageManager'], yarnBerry: false })))
      .toEqual([
        'npm ci',
        'pnpm install --frozen-lockfile',
        'yarn install --frozen-lockfile',
        'bun install --frozen-lockfile',
      ])
    expect(getInstallDependenciesCommand({ packageManager: 'yarn', yarnBerry: true })).toBe('yarn install --immutable')
    expect(['npm', 'pnpm', 'yarn', 'bun'].map(packageManager => getRelizyCommand(packageManager as WorkflowOptions['packageManager'])))
      .toEqual([
        'npx relizy',
        'pnpm exec relizy',
        'yarn relizy',
        'bunx relizy',
      ])
  })
})

describe('Given the merge preview of the release workflow', () => {
  it('When it is not wanted, Then there is no merge preview workflow', () => {
    expect(getMergePreviewWorkflowFile(options, '/nonexistent')).toBeUndefined()
    expect(getWorkflowFile({ ...options, provider: 'gitlab', gitlabCom: true }, '/nonexistent').content).not.toContain('merge-preview')
  })

  it('When it is wanted on GitHub, Then runs the action with merge-preview on the pull requests into the default branch', () => {
    const file = getMergePreviewWorkflowFile({ ...options, mergePreview: true, publish: true }, '/nonexistent')!

    expect(file.path).toBe('.github/workflows/merge-preview.yml')
    expect(file.content).toContain('on:\n  pull_request:\n    branches: [main]\n    # edited: a new title (the commit of a squash merge) or a new base\n    types: [opened, synchronize, reopened, edited]\n')
    expect(file.content).toContain('      statuses: write\n')
    // A public package is checked on npmjs.com without token
    expect(file.content.endsWith('      - uses: relizy/action@v2\n        with:\n          merge-preview: true\n')).toBe(true)
    expect(file.content).not.toContain('NPM_TOKEN')
  })

  it('When the registry needs a token, Then gives it to the merge preview', () => {
    const file = getMergePreviewWorkflowFile({
      ...options,
      mergePreview: true,
      publish: true,
      registryNeedsToken: true,
    }, '/nonexistent')!

    // eslint-disable-next-line no-template-curly-in-string -- an expression of GitHub Actions
    expect(file.content).toContain('          merge-preview: true\n          npm-token: ${{ secrets.NPM_TOKEN }}\n')
  })

  it('When the GitLab release job is kept, Then writes the merge preview in its own file: the include of the component on gitlab.com, else the job', () => {
    const gitlab = { ...options, provider: 'gitlab' as const, mergePreview: true }
    const component = getMergePreviewWorkflowFile({ ...gitlab, gitlabCom: true }, '/nonexistent')!

    // Without .gitlab-ci.yml, it is .gitlab-ci.yml
    expect(component.path).toBe('.gitlab-ci.yml')
    expect(component.include).toBeUndefined()
    expect(isGeneratedWorkflow(component.content)).toBe(true)
    expect(component.content).toContain('include:\n  # What the merge')
    expect(component.content).toContain('  - component: gitlab.com/relizy/relizy/merge-preview@2\n')
    for (const file of [
      getMergePreviewWorkflowFile(gitlab, '/nonexistent')!,
      getMergePreviewWorkflowFile({ ...gitlab, gitlabCom: true, integration: false }, '/nonexistent')!,
    ]) {
      expect(file.content).not.toContain('component:')
      expect(file.content).toContain('merge-preview:\n  stage: test\n')
      expect(file.content).toContain('    - pnpm exec relizy merge-preview\n')
    }
  })

  it('When it is wanted on gitlab.com, Then includes the merge-preview component', () => {
    const { content } = getWorkflowFile({
      ...options,
      provider: 'gitlab',
      gitlabCom: true,
      mergePreview: true,
      nodeVersion: '22',
    }, '/nonexistent')

    expect(content).toContain('  - component: gitlab.com/relizy/relizy/merge-preview@2\n    inputs:\n      image: node:22\n')
  })

  it('When it is wanted on a GitLab instance, Then writes the merge-preview job on the merge requests into the default branch', () => {
    const { content } = getWorkflowFile({
      ...options,
      provider: 'gitlab',
      gitlabCom: false,
      mergePreview: true,
      publish: true,
      ai: true,
    }, '/nonexistent')
    const job = content.slice(content.indexOf('merge-preview:'))

    expect(job).toContain('    - if: \'$CI_PIPELINE_SOURCE == "merge_request_event" && $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == $CI_DEFAULT_BRANCH\'\n')
    expect(job).toContain('    - pnpm exec relizy merge-preview\n')
    expect(job).not.toContain('npm install -g npm@latest')
    expect(job).not.toContain('claude-code')
  })
})

describe('Given the workflows run with the relizy CLI', () => {
  const cli = { ...options, integration: false }

  it('When released on demand on GitHub, Then sets up the project and runs relizy release with the chosen release type', () => {
    const { content } = getWorkflowFile({ ...cli, publish: true, nodeVersionFile: '.nvmrc' }, '/nonexistent')

    expect(content).not.toContain('relizy/action')
    expect(content).toContain('      - uses: pnpm/action-setup@v6\n      - uses: actions/setup-node@v7\n        with:\n          node-version-file: .nvmrc\n          cache: pnpm\n      - run: pnpm install --frozen-lockfile\n')
    expect(content).toContain('      - run: npm install -g npm@latest\n')
    // eslint-disable-next-line no-template-curly-in-string -- expressions of GitHub Actions
    expect(content).toContain('      - id: release\n        env:\n          GITHUB_TOKEN: ${{ github.token }}\n          RELIZY_NPM_TOKEN: ${{ secrets.NPM_TOKEN }}\n          RELEASE_TYPE: ${{ inputs.release }}\n        run: |\n')
    expect(content).toContain('          pnpm exec relizy release --yes $flag\n')
  })

  it('When released at each push with yarn and an unpinned pnpm, Then sets up the package manager it needs', () => {
    expect(getWorkflowFile({
      ...cli,
      trigger: 'push',
      packageManager: 'yarn',
      yarnBerry: true,
    }, '/nonexistent').content)
      .toContain('          node-version: lts/*\n      - run: npm install -g corepack && corepack enable\n      - run: yarn install --immutable\n')
    expect(getWorkflowFile({ ...cli, trigger: 'push', pnpmPinned: false }, '/nonexistent').content)
      .toContain('      - uses: pnpm/action-setup@v6\n        with:\n          version: latest\n')
    expect(getWorkflowFile({ ...cli, trigger: 'push' }, '/nonexistent').content)
      .toContain('        run: pnpm exec relizy release --yes\n')
  })

  it('When the merge preview is wanted on GitHub, Then runs relizy merge-preview', () => {
    const file = getMergePreviewWorkflowFile({ ...cli, mergePreview: true }, '/nonexistent')

    expect(file?.content).not.toContain('relizy/action')
    expect(file?.content).toContain('        run: pnpm exec relizy merge-preview\n')
  })

  it('When the repository is on gitlab.com, Then writes out the job instead of the component', () => {
    const { content } = getWorkflowFile({
      ...cli,
      provider: 'gitlab',
      gitlabCom: true,
      mergePreview: true,
    }, '/nonexistent')

    expect(content).not.toContain('component:')
    expect(content).toContain('    - pnpm exec relizy release --yes $RELEASE_FLAG --report-dotenv relizy.env\n')
    expect(content).toContain('    - pnpm exec relizy merge-preview\n')
  })
})

describe('Given the CI files of a project', () => {
  let cwd: string

  function write(path: string, content: string) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-ci-setup-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('When a GitLab file runs relizy, Then finds the release and the merge preview, skipping the comments', () => {
    write('.gitlab-ci.yml', 'include:\n  - local: .gitlab/ci/release.yml\n')
    write('.gitlab/ci/release.yml', 'release:\n  script:\n    - pnpm relizy release --yes\n')
    write('.gitlab/ci/test.yml', '# relizy merge-preview later\ntest:\n  script: [pnpm test]\n')

    expect(findCiSetup(cwd, 'gitlab')).toEqual({ release: '.gitlab/ci/release.yml' })

    write('.gitlab/ci/relizy-merge-preview.yml', 'include:\n  - component: gitlab.com/relizy/relizy/merge-preview@2\n')

    expect(findCiSetup(cwd, 'gitlab')).toEqual({ release: '.gitlab/ci/release.yml', mergePreview: '.gitlab/ci/relizy-merge-preview.yml' })
  })

  it('When the GitHub workflows use the relizy action, Then tells the release from the merge preview', () => {
    write('.github/workflows/merge-preview.yml', getMergePreviewWorkflowFile({ ...options, mergePreview: true }, cwd)!.content)
    write('.github/workflows/release.yml', getWorkflowFile(options, cwd).content)
    write('.github/workflows/ci.yml', 'jobs:\n  test:\n    steps:\n      - run: pnpm test\n')

    expect(findCiSetup(cwd, 'github')).toEqual({ release: '.github/workflows/release.yml', mergePreview: '.github/workflows/merge-preview.yml' })
    expect(findCiSetup(cwd, 'gitlab')).toEqual({})
  })

  it('When .gitlab-ci.yml exists, Then puts the job in its own file, with the include unless .gitlab-ci.yml has it', () => {
    write('.gitlab-ci.yml', 'test:\n  script: [pnpm test]\n')
    const gitlab = { ...options, provider: 'gitlab' as const, mergePreview: true }

    expect(getMergePreviewWorkflowFile(gitlab, cwd)).toEqual(expect.objectContaining({
      path: '.gitlab/ci/relizy-merge-preview.yml',
      include: 'include:\n  - local: .gitlab/ci/relizy-merge-preview.yml',
    }))

    write('.gitlab-ci.yml', 'include:\n  - local: .gitlab/ci/relizy-merge-preview.yml\n')

    expect(getMergePreviewWorkflowFile(gitlab, cwd)!.include).toBeUndefined()
    expect(getWorkflowFile(gitlab, cwd, '.gitlab-ci.yml')).toEqual(expect.objectContaining({ path: '.gitlab-ci.yml' }))
  })
})
