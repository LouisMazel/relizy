import type { PackageManager } from '../types'
import type { InitAnswers, ProjectDetection } from './init'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The release workflow written by `relizy init`: a GitHub Actions workflow
 * or a GitLab CI job, from what the init detected and asked.
 */

/**
 * - `manual`: run on demand, choosing the release type
 * - `push`: run at each push on the default branch
 */
export type WorkflowTrigger = 'manual' | 'push'

export type WorkflowProvider = 'github' | 'gitlab'

export interface WorkflowOptions {
  provider: WorkflowProvider
  trigger: WorkflowTrigger
  packageManager: PackageManager
  /** Default branch of the repository */
  branch: string
  /** `.nvmrc` or `.node-version`, when the project has one */
  nodeVersionFile?: string
  /** Major version of Node, read from the node version file */
  nodeVersion?: string
  /** Yarn 2 and later (`.yarnrc.yml`) */
  yarnBerry: boolean
  publish: boolean
  prComment: boolean
  twitter: boolean
  slack: boolean
  ai: boolean
  /** Header of the release commit, to skip it on GitLab: `chore(release): ` */
  releaseCommitPrefix: string
}

export interface WorkflowFile {
  /** Relative to the root of the project */
  path: string
  content: string
  /** The `include:` to add to an existing `.gitlab-ci.yml` */
  include?: string
}

/** The release types of the manual trigger, `auto` follows the commits */
const RELEASE_TYPES = ['auto', 'patch', 'minor', 'major']

function getDefaultBranch(cwd: string): string {
  const git = (...args: string[]) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    }
    catch {
      return ''
    }
  }

  const remoteHead = git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '')
  const current = git('rev-parse', '--abbrev-ref', 'HEAD')
  return remoteHead || (current && current !== 'HEAD' ? current : 'main')
}

function getNodeVersion(cwd: string): Pick<WorkflowOptions, 'nodeVersionFile' | 'nodeVersion'> {
  const file = ['.nvmrc', '.node-version'].find(name => existsSync(join(cwd, name)))
  if (!file) {
    return {}
  }

  const major = /^v?(\d+)/.exec(readFileSync(join(cwd, file), 'utf8').trim())?.[1]
  return { nodeVersionFile: file, ...(major && { nodeVersion: major }) }
}

/**
 * The header of the release commit before its first variable, from the
 * template of the config or the default one
 */
function getReleaseCommitPrefix(template: string | undefined): string {
  return (template ?? 'chore(release): ').split('{{')[0]!
}

export function getWorkflowOptions({ detection, answers, trigger, commitMessage }: {
  detection: ProjectDetection
  answers: InitAnswers
  trigger: WorkflowTrigger
  /** `templates.commitMessage` of the config, when set */
  commitMessage?: string
}): WorkflowOptions {
  const { cwd } = detection

  return {
    provider: detection.provider === 'gitlab' ? 'gitlab' : 'github',
    trigger,
    packageManager: detection.packageManager,
    branch: getDefaultBranch(cwd),
    ...getNodeVersion(cwd),
    yarnBerry: existsSync(join(cwd, '.yarnrc.yml')),
    publish: answers.goal === 'publish',
    prComment: detection.provider === 'github' || detection.provider === 'gitlab',
    twitter: answers.twitter,
    slack: answers.slack,
    ai: answers.ai.length > 0,
    releaseCommitPrefix: getReleaseCommitPrefix(commitMessage),
  }
}

export function getInstallDependenciesCommand(options: Pick<WorkflowOptions, 'packageManager' | 'yarnBerry'>): string {
  switch (options.packageManager) {
    case 'pnpm':
      return 'pnpm install --frozen-lockfile'
    case 'yarn':
      return options.yarnBerry ? 'yarn install --immutable' : 'yarn install --frozen-lockfile'
    case 'bun':
      return 'bun install --frozen-lockfile'
    default:
      return 'npm ci'
  }
}

export function getRelizyCommand(packageManager: PackageManager): string {
  switch (packageManager) {
    case 'pnpm':
      return 'pnpm exec relizy'
    case 'yarn':
      return 'yarn relizy'
    case 'bun':
      return 'bunx relizy'
    default:
      return 'npx relizy'
  }
}

/**
 * The secrets of the release, by environment variable: the provider token
 * aside, as GitHub gives one to each run
 */
function getSecrets(options: WorkflowOptions): [variable: string, secret: string][] {
  return [
    ...(options.publish ? [['RELIZY_NPM_TOKEN', 'NPM_TOKEN'] as [string, string]] : []),
    ...(options.twitter
      ? (['API_KEY', 'API_KEY_SECRET', 'ACCESS_TOKEN', 'ACCESS_TOKEN_SECRET'].map(name => [`RELIZY_TWITTER_${name}`, `TWITTER_${name}`]) as [string, string][])
      : []),
    ...(options.slack ? [['RELIZY_SLACK_TOKEN', 'SLACK_TOKEN'] as [string, string]] : []),
    ...(options.ai ? [['RELIZY_CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'] as [string, string]] : []),
  ]
}

/**
 * The names of the secrets (GitHub) or CI/CD variables (GitLab) to create
 */
export function getWorkflowSecrets(options: WorkflowOptions): string[] {
  return [
    ...(options.provider === 'gitlab' ? ['GITLAB_TOKEN'] : []),
    ...getSecrets(options).map(([, secret]) => secret),
  ]
}

function getGithubSetupSteps(options: WorkflowOptions): string[] {
  const node = options.nodeVersionFile ? `node-version-file: ${options.nodeVersionFile}` : 'node-version: lts/*'
  const cache = options.packageManager === 'bun' ? '' : `\n          cache: ${options.packageManager}`

  return [
    ...(options.packageManager === 'pnpm' ? ['      - uses: pnpm/action-setup@v6'] : []),
    ...(options.packageManager === 'bun' ? ['      - uses: oven-sh/setup-bun@v2'] : []),
    `      - uses: actions/setup-node@v7\n        with:\n          ${node}${cache}`,
    `      - run: ${getInstallDependenciesCommand(options)}`,
    ...(options.ai ? ['      # The claude-code provider of the AI rewrites runs the claude CLI\n      - run: npm install -g @anthropic-ai/claude-code'] : []),
  ]
}

/**
 * An expression of GitHub Actions: `${{ inputs.release }}`
 */
function expression(value: string): string {
  return `\${{ ${value} }}`
}

function secretExpression(secret: string): string {
  return expression(`secrets.${secret}`)
}

function renderGithubWorkflow(options: WorkflowOptions): string {
  const on = options.trigger === 'manual'
    ? [
        'on:',
        '  workflow_dispatch:',
        '    inputs:',
        '      release:',
        '        description: Release type (auto follows the commits)',
        '        type: choice',
        '        default: auto',
        `        options: [${RELEASE_TYPES.join(', ')}]`,
      ]
    : ['on:', '  push:', `    branches: [${options.branch}]`]
  const releaseFlag = options.trigger === 'manual' ? ` ${expression('inputs.release != \'auto\' && format(\'--{0}\', inputs.release) || \'\'')}` : ''
  const env = [['GITHUB_TOKEN', 'GITHUB_TOKEN'], ...getSecrets(options)].map(([variable, secret]) => `          ${variable}: ${secretExpression(secret)}`)

  return [
    '# Generated by relizy init: https://relizy.dev/guide/github-actions',
    'name: Release',
    '',
    ...on,
    '',
    '# One release at a time',
    'concurrency: release',
    '',
    'jobs:',
    '  release:',
    '    runs-on: ubuntu-latest',
    '    permissions:',
    '      # The release commit, the tags and the GitHub release',
    '      contents: write',
    ...(options.prComment ? ['      # The comment of the pull request of the release', '      pull-requests: write', '      issues: write'] : []),
    '    steps:',
    '      - uses: actions/checkout@v7',
    '        with:',
    '          # The changelogs need the history since the last release',
    '          fetch-depth: 0',
    ...getGithubSetupSteps(options),
    '      - id: release',
    `        run: ${getRelizyCommand(options.packageManager)} release --yes${releaseFlag}`,
    '        env:',
    ...env,
    '      # The outputs of the release, for the next steps',
    `      - if: steps.release.outputs.released == 'true'`,
    `        run: echo "Released ${expression('steps.release.outputs.version')} (${expression('steps.release.outputs.tags')})"`,
    '',
  ].join('\n')
}

function getGitlabSetup(options: WorkflowOptions): string[] {
  return [
    ...(options.packageManager === 'pnpm' || options.packageManager === 'yarn' ? ['    - corepack enable'] : []),
    ...(options.packageManager === 'bun' ? ['    - npm install -g bun'] : []),
    `    - ${getInstallDependenciesCommand(options)}`,
    ...(options.ai ? ['    # The claude-code provider of the AI rewrites runs the claude CLI', '    - npm install -g @anthropic-ai/claude-code'] : []),
  ]
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

function renderGitlabJob(options: WorkflowOptions): string {
  const manual = options.trigger === 'manual'
  const secrets = getWorkflowSecrets(options)
  const skipRelease = options.releaseCommitPrefix ? ` && $CI_COMMIT_MESSAGE !~ /^${escapeRegExp(options.releaseCommitPrefix)}/` : ''
  // Quoted: the regular expression may contain ": "
  const rule = `$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH${skipRelease}`.replaceAll('\'', '\'\'')

  return [
    '# Generated by relizy init: https://relizy.dev/guide/gitlab-ci',
    `# Add these masked CI/CD variables (Settings > CI/CD > Variables): ${secrets.join(', ')}`,
    '# GITLAB_TOKEN: a project access token with the api and write_repository scopes, to push the release commit and the tags',
    '',
    ...(manual
      ? [
          'variables:',
          '  RELEASE_TYPE:',
          '    value: auto',
          `    options: [${RELEASE_TYPES.join(', ')}]`,
          '    description: Release type (auto follows the commits)',
          '',
        ]
      : []),
    'release:',
    '  stage: deploy',
    `  image: node:${options.nodeVersion ?? 'lts'}`,
    '  variables:',
    '    # The changelogs need the history since the last release',
    '    GIT_DEPTH: 0',
    '  rules:',
    '    # On the default branch, not on the release commit it pushes',
    `    - if: '${rule}'`,
    ...(manual ? ['      when: manual'] : []),
    '  before_script:',
    ...getGitlabSetup(options),
    '  script:',
    ...(manual ? ['    - if [ "$RELEASE_TYPE" != "auto" ]; then RELEASE_FLAG="--$RELEASE_TYPE"; fi'] : []),
    `    - ${getRelizyCommand(options.packageManager)} release --yes${manual ? ' $RELEASE_FLAG' : ''} --report-dotenv relizy.env`,
    '  artifacts:',
    '    # The outputs of the release (RELIZY_RELEASED, RELIZY_VERSION, RELIZY_TAGS...), for the next jobs',
    '    reports:',
    '      dotenv: relizy.env',
    '',
  ].join('\n')
}

/**
 * The file of the workflow: on GitLab, an existing `.gitlab-ci.yml` is not
 * changed, the job goes in its own file to include
 */
export function getWorkflowFile(options: WorkflowOptions, cwd: string): WorkflowFile {
  if (options.provider === 'github') {
    return { path: '.github/workflows/release.yml', content: renderGithubWorkflow(options) }
  }

  const content = renderGitlabJob(options)
  if (!existsSync(join(cwd, '.gitlab-ci.yml'))) {
    return { path: '.gitlab-ci.yml', content }
  }

  return { path: '.gitlab/ci/relizy.yml', content, include: 'include:\n  - local: .gitlab/ci/relizy.yml' }
}
