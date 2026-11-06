import type { WorkflowOptions } from '../ci-workflow'
import { getInstallDependenciesCommand, getRelizyCommand, getWorkflowFile, getWorkflowSecrets } from '../ci-workflow'

const options: WorkflowOptions = {
  provider: 'github',
  trigger: 'manual',
  packageManager: 'pnpm',
  branch: 'main',
  yarnBerry: false,
  publish: false,
  prComment: false,
  twitter: false,
  slack: false,
  ai: false,
  releaseCommitPrefix: 'chore(release): ',
}

describe('Given the release workflow of GitHub Actions', () => {
  it('When released at each push, Then runs on the default branch, without release type', () => {
    const { content } = getWorkflowFile({ ...options, trigger: 'push', branch: 'develop' }, '/nonexistent')

    expect(content).toContain('on:\n  push:\n    branches: [develop]\n')
    expect(content).not.toContain('workflow_dispatch')
    expect(content).toContain('        run: pnpm exec relizy release --yes\n')
  })

  it('When the config needs no secret nor PR comment, Then only gives the token of the run, with the permission to push', () => {
    const { content } = getWorkflowFile(options, '/nonexistent')

    expect(content).toContain('      contents: write\n    steps:')
    expect(content).not.toContain('pull-requests')
    // eslint-disable-next-line no-template-curly-in-string -- an expression of GitHub Actions
    expect(content).toContain('        env:\n          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n      # The outputs')
    expect(getWorkflowSecrets(options)).toEqual([])
  })

  it('When the project pins its Node version, Then sets it up from its file', () => {
    expect(getWorkflowFile({ ...options, nodeVersionFile: '.nvmrc' }, '/nonexistent').content).toContain('          node-version-file: .nvmrc\n')
    expect(getWorkflowFile(options, '/nonexistent').content).toContain('          node-version: lts/*\n')
  })

  it('When using bun, Then sets it up, without the cache of setup-node', () => {
    const { content } = getWorkflowFile({ ...options, packageManager: 'bun' }, '/nonexistent')

    expect(content).toContain('      - uses: oven-sh/setup-bun@v2\n')
    expect(content).not.toContain('cache:')
    expect(content).toContain('      - run: bun install --frozen-lockfile\n')
  })

  it('When the AI rewrites the notes, Then installs the claude CLI and passes its token', () => {
    const { content } = getWorkflowFile({ ...options, ai: true }, '/nonexistent')

    expect(content).toContain('      - run: npm install -g @anthropic-ai/claude-code\n')
    // eslint-disable-next-line no-template-curly-in-string -- an expression of GitHub Actions
    expect(content).toContain('          RELIZY_CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}\n')
  })
})

describe('Given the release job of GitLab CI', () => {
  it('Then skips the release commit, escaping a custom commit message for the regular expression and the YAML quotes', () => {
    const { content, path } = getWorkflowFile({ ...options, provider: 'gitlab', releaseCommitPrefix: 'release(\'s): v' }, '/nonexistent')

    expect(path).toBe('.gitlab-ci.yml')
    expect(content).toContain('    - if: \'$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH && $CI_COMMIT_MESSAGE !~ /^release\\(\'\'s\\): v/\'\n      when: manual\n')
  })

  it('Then lists the CI/CD variables to create, with the token able to push', () => {
    expect(getWorkflowSecrets({ ...options, provider: 'gitlab', publish: true, slack: true })).toEqual(['GITLAB_TOKEN', 'NPM_TOKEN', 'SLACK_TOKEN'])
  })
})

describe('Given the commands of a package manager', () => {
  it('Then installs corepack before enabling it, as Node 25+ no longer ships it', () => {
    expect(getWorkflowFile({ ...options, provider: 'gitlab' }, '/nonexistent').content).toContain('    - npm install -g corepack && corepack enable\n    - pnpm install --frozen-lockfile\n')
    expect(getWorkflowFile({ ...options, provider: 'gitlab', packageManager: 'npm' }, '/nonexistent').content).not.toContain('corepack')
  })

  it('Then installs from the lockfile and runs the relizy of the project', () => {
    expect(['npm', 'pnpm', 'yarn', 'bun'].map(packageManager => getInstallDependenciesCommand({ packageManager: packageManager as WorkflowOptions['packageManager'], yarnBerry: false })))
      .toEqual(['npm ci', 'pnpm install --frozen-lockfile', 'yarn install --frozen-lockfile', 'bun install --frozen-lockfile'])
    expect(getInstallDependenciesCommand({ packageManager: 'yarn', yarnBerry: true })).toBe('yarn install --immutable')
    expect(['npm', 'pnpm', 'yarn', 'bun'].map(packageManager => getRelizyCommand(packageManager as WorkflowOptions['packageManager'])))
      .toEqual(['npx relizy', 'pnpm exec relizy', 'yarn relizy', 'bunx relizy'])
  })
})
