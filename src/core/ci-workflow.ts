import type { PackageManager } from '../types'
import type { InitAnswers, ProjectDetection } from './init'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tryGitSync } from './git-exec'
import { getExecCommand } from './npm-registry'

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
  /** The merge preview job: what the merge of each pull request releases (`relizy merge-preview`) */
  mergePreview: boolean
  twitter: boolean
  slack: boolean
  teams: boolean
  ai: boolean
  /** Header of the release commit, to skip it on GitLab: `chore(release): ` */
  releaseCommitPrefix: string
  /** The repository is on gitlab.com, which can include the component of the CI/CD catalog */
  gitlabCom?: boolean
}

export interface WorkflowFile {
  /** Relative to the root of the project */
  path: string
  content: string
  /** The `include:` to add to an existing `.gitlab-ci.yml` */
  include?: string
}

/** Above the npm update of the publishing jobs */
const TRUSTED_PUBLISHING_COMMENT = 'npm trusted publishing (OIDC) needs npm 11.5.1 or later: https://relizy.dev/guide/trusted-publishing'

/** Sets up the project and runs `relizy release`: https://github.com/relizy/action */
const GITHUB_ACTION = 'relizy/action@v2'

/** The `release` job of the CI/CD catalog: https://gitlab.com/relizy/relizy */
const GITLAB_COMPONENT = 'gitlab.com/relizy/relizy/release@2'

/** The `merge-preview` job of the CI/CD catalog */
const GITLAB_MERGE_PREVIEW_COMPONENT = 'gitlab.com/relizy/relizy/merge-preview@2'

const DEFAULT_RELEASE_COMMIT_PREFIX = 'chore(release): '

const GITLAB_TOKEN_COMMENT = '# GITLAB_TOKEN: an access token with the api and write_repository scopes, to push the release commit and the tags'

/** The release types of the manual trigger, `auto` follows the commits */
const RELEASE_TYPES = ['auto', 'patch', 'minor', 'major']

function getDefaultBranch(cwd: string): string {
  const remoteHead = (tryGitSync(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd }) ?? '').replace(/^origin\//, '')
  const current = tryGitSync(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
  return remoteHead || (current && current !== 'HEAD'
    ? current
    : 'main')
}

function getNodeVersion(cwd: string): Pick<WorkflowOptions, 'nodeVersionFile' | 'nodeVersion'> {
  const file = ['.nvmrc', '.node-version'].find(name => existsSync(join(cwd, name)))
  if (!file) {
    return {}
  }

  const major = /^v?(\d+)/.exec(readFileSync(join(cwd, file), 'utf8').trim())?.[1]
  return {
    nodeVersionFile: file,
    ...(major && { nodeVersion: major }),
  }
}

/**
 * The header of the release commit before its first variable, from the
 * template of the config or the default one
 */
function getReleaseCommitPrefix(template: string | undefined): string {
  return (template ?? DEFAULT_RELEASE_COMMIT_PREFIX).split('{{')[0]!
}

export function getWorkflowOptions({ detection, answers, trigger, commitMessage, mergePreview = false }: {
  detection: ProjectDetection
  answers: InitAnswers
  trigger: WorkflowTrigger
  /** `templates.commitMessage` of the config, when set */
  commitMessage?: string
  /** Add the merge preview job */
  mergePreview?: boolean
}): WorkflowOptions {
  const { cwd } = detection

  return {
    provider: detection.provider === 'gitlab'
      ? 'gitlab'
      : 'github',
    trigger,
    packageManager: detection.packageManager,
    branch: getDefaultBranch(cwd),
    ...getNodeVersion(cwd),
    yarnBerry: existsSync(join(cwd, '.yarnrc.yml')),
    publish: answers.goal === 'publish',
    prComment: detection.provider === 'github' || detection.provider === 'gitlab',
    mergePreview,
    twitter: answers.twitter,
    slack: answers.slack,
    teams: answers.teams,
    ai: answers.ai.length > 0,
    releaseCommitPrefix: getReleaseCommitPrefix(commitMessage),
    gitlabCom: (tryGitSync(['remote', 'get-url', 'origin'], { cwd }) ?? '').includes('gitlab.com'),
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
  return getExecCommand(packageManager, 'relizy')
}

/**
 * The secrets of the release, by environment variable: the provider token
 * aside, as GitHub gives one to each run
 */
function getSecrets(options: WorkflowOptions): [variable: string, secret: string][] {
  return [
    ...(options.publish
      ? [
          ['RELIZY_NPM_TOKEN', 'NPM_TOKEN'] as [string, string],
        ]
      : []),
    ...(options.twitter
      ? ([
          'API_KEY',
          'API_KEY_SECRET',
          'ACCESS_TOKEN',
          'ACCESS_TOKEN_SECRET',
        ].map(name => [`RELIZY_TWITTER_${name}`, `TWITTER_${name}`]) as [string, string][])
      : []),
    ...(options.slack
      ? [
          ['RELIZY_SLACK_TOKEN', 'SLACK_TOKEN'] as [string, string],
        ]
      : []),
    // A masked GitLab variable refuses the characters of the URL: its base64
    ...(options.teams
      ? [
          (options.provider === 'gitlab'
            ? ['RELIZY_TEAMS_WEBHOOK_URL_B64', 'TEAMS_WEBHOOK_URL_B64']
            : ['RELIZY_TEAMS_WEBHOOK_URL', 'TEAMS_WEBHOOK_URL']) as [string, string],
        ]
      : []),
    ...(options.ai
      ? [
          ['RELIZY_CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'] as [string, string],
        ]
      : []),
  ]
}

/**
 * The names of the secrets (GitHub) or CI/CD variables (GitLab) to create
 */
export function getWorkflowSecrets(options: WorkflowOptions): string[] {
  return [
    ...(options.provider === 'gitlab'
      ? ['GITLAB_TOKEN']
      : []),
    ...getSecrets(options).map(([, secret]) => secret),
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
  // The inputs of the action take the name of the variables: RELIZY_NPM_TOKEN is npm-token
  const inputs = [
    ...(options.trigger === 'manual'
      ? [`          release-type: ${expression('inputs.release')}`]
      : []),
    ...getSecrets(options).map(([variable, secret]) => `          ${variable.replace(/^RELIZY_/, '').toLowerCase().replaceAll('_', '-')}: ${secretExpression(secret)}`),
  ]

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
    ...(options.prComment
      ? ['      # The comment of the pull request of the release', '      pull-requests: write', '      issues: write']
      : []),
    ...(options.publish
      ? ['      # npm trusted publishing (OIDC): publishes without NPM_TOKEN once set up on npmjs.com', '      id-token: write']
      : []),
    '    steps:',
    '      - uses: actions/checkout@v7',
    '        with:',
    '          # The changelogs need the history since the last release',
    '          fetch-depth: 0',
    '      # Sets up Node.js and the package manager, installs the dependencies and runs relizy release',
    '      - id: release',
    `        uses: ${GITHUB_ACTION}`,
    ...(inputs.length > 0
      ? ['        with:', ...inputs]
      : []),
    '      # The outputs of the release, for the next steps',
    `      - if: steps.release.outputs.released == 'true'`,
    `        run: echo "Released ${expression('steps.release.outputs.version')} (${expression('steps.release.outputs.tags')})"`,
    '',
  ].join('\n')
}

/**
 * The workflow of the merge preview: on each pull request into the default
 * branch, what its merge releases (a comment and the commit status
 * `relizy/merge-preview`), with the release type of the release workflow
 */
function renderGithubMergePreviewWorkflow(options: WorkflowOptions): string {
  const inputs = [
    '          merge-preview: true',
    // The registry tells whether a version is already published
    ...(options.publish
      ? [`          npm-token: ${secretExpression('NPM_TOKEN')}`]
      : []),
  ]

  return [
    '# Generated by relizy init: https://relizy.dev/guide/merge-preview',
    'name: Merge preview',
    '',
    '# What the merge of the pull request releases: a comment and the commit status relizy/merge-preview',
    'on:',
    '  pull_request:',
    `    branches: [${options.branch}]`,
    '',
    '# The last push of the pull request wins',
    'concurrency:',
    `  group: merge-preview-${expression('github.event.pull_request.number')}`,
    '  cancel-in-progress: true',
    '',
    'jobs:',
    '  merge-preview:',
    '    runs-on: ubuntu-latest',
    '    permissions:',
    '      contents: read',
    '      # The comment of the pull request',
    '      pull-requests: write',
    '      issues: write',
    '      # The commit status relizy/merge-preview, to require in the protection of the branch',
    '      statuses: write',
    '    steps:',
    '      - uses: actions/checkout@v7',
    '        with:',
    '          # The versions need the history since the last release',
    '          fetch-depth: 0',
    '      # Computes the release of the merge, writes nothing, fails when the release would fail',
    `      - uses: ${GITHUB_ACTION}`,
    '        with:',
    ...inputs,
    '',
  ].join('\n')
}

function getGitlabSetup(options: WorkflowOptions): string[] {
  return [
    // Node 25+ no longer ships corepack: installed first, it pins the version of the `packageManager` field
    ...(options.packageManager === 'pnpm' || options.packageManager === 'yarn'
      ? ['    - npm install -g corepack && corepack enable']
      : []),
    ...(options.packageManager === 'bun'
      ? ['    - npm install -g bun']
      : []),
    `    - ${getInstallDependenciesCommand(options)}`,
    ...(options.publish
      ? [`    # ${TRUSTED_PUBLISHING_COMMENT}`, '    - npm install -g npm@latest']
      : []),
    ...(options.ai
      ? ['    # The claude-code provider of the AI rewrites runs the claude CLI', '    - npm install -g @anthropic-ai/claude-code']
      : []),
  ]
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

function getGitlabHeader(options: WorkflowOptions): string[] {
  return [
    '# Generated by relizy init: https://relizy.dev/guide/gitlab-ci',
    `# Add these masked CI/CD variables (Settings > CI/CD > Variables): ${getWorkflowSecrets(options).join(', ')}`,
    GITLAB_TOKEN_COMMENT,
    '',
    ...(options.trigger === 'manual'
      ? [
          'variables:',
          '  RELEASE_TYPE:',
          '    value: auto',
          `    options: [${RELEASE_TYPES.join(', ')}]`,
          '    description: Release type (auto follows the commits)',
          '',
        ]
      : []),
  ]
}

/**
 * A single-quoted YAML string
 */
function quote(value: string): string {
  return `'${value.replaceAll('\'', '\'\'')}'`
}

/**
 * The component of the CI/CD catalog, with the inputs that differ from its
 * defaults
 */
function renderGitlabComponent(options: WorkflowOptions): string {
  const prefix = options.releaseCommitPrefix
  // An empty message never matches: an empty regular expression would match every commit
  const skipCommit = prefix
    ? `^${escapeRegExp(prefix)}`
    : '^$'
  const inputs = [
    ...(options.trigger === 'push'
      ? ['      when: on_success']
      : []),
    ...(options.nodeVersion
      ? [`      image: node:${options.nodeVersion}`]
      : []),
    ...(prefix === DEFAULT_RELEASE_COMMIT_PREFIX
      ? []
      : [`      skip-commit: ${quote(skipCommit)}`]),
  ]

  return [
    ...getGitlabHeader(options),
    'include:',
    '  # The release job, its outputs (RELIZY_RELEASED, RELIZY_VERSION, RELIZY_TAGS...) go to the next jobs: https://gitlab.com/relizy/relizy',
    `  - component: ${GITLAB_COMPONENT}`,
    ...(inputs.length > 0
      ? ['    inputs:', ...inputs]
      : []),
    ...(options.mergePreview
      ? [
          '  # What the merge of each merge request releases: a comment and the commit status relizy/merge-preview',
          `  - component: ${GITLAB_MERGE_PREVIEW_COMPONENT}`,
          ...(options.nodeVersion
            ? ['    inputs:', `      image: node:${options.nodeVersion}`]
            : []),
        ]
      : []),
    '',
  ].join('\n')
}

/**
 * The merge preview job written out: on each merge request into the default
 * branch, what its merge releases (a comment and the commit status
 * `relizy/merge-preview`)
 */
function renderGitlabMergePreviewJob(options: WorkflowOptions): string[] {
  return [
    '# What the merge of the merge request releases: a comment and the commit status relizy/merge-preview',
    'merge-preview:',
    '  stage: test',
    `  image: node:${options.nodeVersion ?? 'lts'}`,
    '  variables:',
    '    # The versions need the history since the last release',
    '    GIT_DEPTH: 0',
    '  rules:',
    '    - if: \'$CI_PIPELINE_SOURCE == "merge_request_event" && $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == $CI_DEFAULT_BRANCH\'',
    '  before_script:',
    ...getGitlabSetup({ ...options, publish: false, ai: false }),
    '  script:',
    '    # Computes the release of the merge, writes nothing, fails when the release would fail',
    `    - ${getRelizyCommand(options.packageManager)} merge-preview`,
  ]
}

/**
 * The job written out, for the GitLab instances which cannot include the
 * components of gitlab.com
 */
function renderGitlabJob(options: WorkflowOptions): string {
  const manual = options.trigger === 'manual'
  const skipRelease = options.releaseCommitPrefix
    ? ` && $CI_COMMIT_MESSAGE !~ /^${escapeRegExp(options.releaseCommitPrefix)}/`
    : ''
  // Quoted: the regular expression may contain ": "
  const rule = `$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH${skipRelease}`.replaceAll('\'', '\'\'')

  return [
    ...getGitlabHeader(options),
    'release:',
    '  stage: deploy',
    `  image: node:${options.nodeVersion ?? 'lts'}`,
    '  variables:',
    '    # The changelogs need the history since the last release',
    '    GIT_DEPTH: 0',
    ...(options.publish
      ? [
          '  # npm trusted publishing (OIDC): publishes without NPM_TOKEN once set up on npmjs.com',
          '  id_tokens:',
          '    NPM_ID_TOKEN:',
          '      aud: npm:registry.npmjs.org',
        ]
      : []),
    '  rules:',
    '    # On the default branch, not on the release commit it pushes',
    `    - if: '${rule}'`,
    ...(manual
      ? ['      when: manual']
      : []),
    '  before_script:',
    ...getGitlabSetup(options),
    '  script:',
    ...(manual
      ? ['    - if [ "$RELEASE_TYPE" != "auto" ]; then RELEASE_FLAG="--$RELEASE_TYPE"; fi']
      : []),
    `    - ${getRelizyCommand(options.packageManager)} release --yes${manual ? ' $RELEASE_FLAG' : ''} --report-dotenv relizy.env`,
    '  artifacts:',
    '    # The outputs of the release (RELIZY_RELEASED, RELIZY_VERSION, RELIZY_TAGS...), for the next jobs',
    '    reports:',
    '      dotenv: relizy.env',
    ...(options.mergePreview
      ? [
          '',
          ...renderGitlabMergePreviewJob(options),
        ]
      : []),
    '',
  ].join('\n')
}

/**
 * The workflow of the merge preview, in its own file on GitHub: on GitLab, its
 * job is in the file of the release
 */
export function getMergePreviewWorkflowFile(options: WorkflowOptions): WorkflowFile | undefined {
  return options.mergePreview && options.provider === 'github'
    ? {
        path: '.github/workflows/merge-preview.yml',
        content: renderGithubMergePreviewWorkflow(options),
      }
    : undefined
}

/**
 * The file of the workflow: on GitLab, an existing `.gitlab-ci.yml` is not
 * changed, the job goes in its own file to include
 */
export function getWorkflowFile(options: WorkflowOptions, cwd: string): WorkflowFile {
  if (options.provider === 'github') {
    return {
      path: '.github/workflows/release.yml',
      content: renderGithubWorkflow(options),
    }
  }

  const content = options.gitlabCom
    ? renderGitlabComponent(options)
    : renderGitlabJob(options)
  if (!existsSync(join(cwd, '.gitlab-ci.yml'))) {
    return { path: '.gitlab-ci.yml', content }
  }

  return { path: '.gitlab/ci/relizy.yml', content, include: 'include:\n  - local: .gitlab/ci/relizy.yml' }
}
