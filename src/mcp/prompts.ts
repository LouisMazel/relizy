import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { z } from 'zod'

function userMessage(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] }
}

function prepareReleaseMessage(type: string | undefined) {
  const asType = type ? ` as a ${type}` : ''
  const args = type ? `{ type: "${type}" }` : '{}'

  return userMessage(`Prepare the next release of this project${asType}, without releasing anything.

1. Call \`get_project()\` for the version mode, the groups and the steps of \`relizy release\`.
2. Call \`lint_commit({})\` on the commits since the last tag and report the problems: they change the bumps and the changelogs.
3. Call \`preview_release(${args})\` and \`preview_changelog(${args})\`, then summarize: the version of each package and why, the tags, and the changelog entries.
4. Point out anything surprising (a package released only as a dependent, a major bump, a package not released).
5. Give the command to run (\`relizy release --dry-run\`, then \`relizy release\`, or the CI workflow) and run nothing without the approval of the user.`)
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt('write-commit', {
    title: 'Write a relizy commit',
    description: 'Write the Conventional Commit message of the staged changes, checked with the relizy commitlint rules of the project',
    argsSchema: {
      intent: z.string().optional().describe('What the change does, when the diff does not say it'),
    },
  }, ({ intent }) => userMessage(`Write the commit message of the staged changes${intent ? ' ('.concat(intent, ')') : ''}.

1. Read the staged diff (\`git diff --cached\`) and the files it touches. If it mixes several concerns or packages, propose to split it first.
2. Write a Conventional Commit: \`type(scope): subject\`, the type matching the effect on the users (it decides the bump), a body for the users of the package when the change needs it, \`BREAKING CHANGE:\` only for a real breaking change.
3. Call \`lint_commit({ message })\` and fix every error and warning, using the suggested header and fixes.
4. Show the message with the bump and the changelog entry returned by \`lint_commit\`, and commit only once the user agrees.`))

  server.registerPrompt('prepare-release', {
    title: 'Prepare a relizy release',
    description: 'Preview the next release (versions, reasons, changelogs) and give the command to run, without releasing anything',
    argsSchema: {
      type: z.string().optional().describe('Release type when forced: major, minor, patch, prerelease...'),
    },
  }, ({ type }) => prepareReleaseMessage(type))

  server.registerPrompt('setup-relizy', {
    title: 'Set up relizy',
    description: 'Install and configure relizy in this project, and connect the AI agents to it',
  }, () => userMessage(`Set up relizy in this project.

1. Read the project: package.json, the workspaces (monorepo or not), the existing release tooling (changesets, lerna, semantic-release, release-it...) and the CI.
2. Read \`get_doc({ id: "guide/getting-started" })\` and \`get_doc({ id: "guide/version-modes" })\`, then propose a version mode (or version groups) and what to release (npm, GitHub/GitLab releases, changelogs).
3. Once the user agrees, install relizy as a devDependency and run \`relizy init --yes\` (or \`relizy init\` for the questions), then adjust \`relizy.config.ts\` with \`get_config_option\`.
4. Run \`relizy mcp init\` to give the rules and this MCP server to the AI agents of the project.
5. Check the setup with \`preview_release()\` and \`relizy release --dry-run\`.`))

  server.registerPrompt('setup-ci', {
    title: 'Release from the CI',
    description: 'Add a CI workflow that releases with relizy (GitHub Actions or GitLab CI)',
    argsSchema: {
      provider: z.enum(['github', 'gitlab']).describe('CI of the project'),
    },
  }, ({ provider }) => userMessage(`Add a CI workflow that releases this project with relizy on ${provider === 'github' ? 'GitHub Actions' : 'GitLab CI'}.

1. Call \`get_project()\` for the config and the steps of the release.
2. Read \`get_doc({ id: "${provider === 'github' ? 'guide/github-actions' : 'guide/gitlab-ci'}" })\` and \`get_doc({ id: "guide/ci-cd" })\`.
3. Write the workflow: full git history and tags, the tokens (npm, ${provider === 'github' ? 'GITHUB_TOKEN' : 'GitLab token'}) from the CI secrets, \`relizy release --yes\`. Never write a token in a file.
4. List the secrets the user must create, and validate the workflow with \`relizy release --dry-run\`.`))
}
