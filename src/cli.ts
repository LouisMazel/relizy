#!/usr/bin/env node

import type { BumpOptions } from './types'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { logger, printBanner } from '@maz-ui/node'
import { Command, Option } from 'commander'
import { bump, changelog, commitlint, init, mergePreview, prComment, providerRelease, publish, release, social } from './commands'
import { getCIName, isInCI } from './core/ci-env'
import { isErrorReported, isRelizyCancelError } from './core/errors'
import { setDryRunOptions } from './core/progress'
import { enableCliUi } from './core/release-ui'

const hasSilentFlag = process.argv.includes('--log-level') && process.argv.includes('silent')
// The other commands start with their own title line
const isInit = process.argv[2] === 'init'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8'),
)

const version = packageJson.version

if (!hasSilentFlag && isInit) {
  printBanner({
    name: 'Relizy',
    version: `v${version}`,
    options: {
      horizontalLayout: 'full',
      verticalLayout: 'full',
      font: 'ANSI Shadow',
      breakAfter: false,
      breakBefore: false,
      clear: false,
    },
  })
}

logger.debug(isInCI()
  ? `Running in CI: ${getCIName()}`
  : 'Running locally')

const program = new Command()

function hasCliFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

program.hook('preAction', () => {
  enableCliUi()
  setDryRunOptions({
    preview: !hasCliFlag('--no-preview'),
    ai: hasCliFlag('--ai-preview'),
  })
})

function getReleaseType(options: any) {
  let type: BumpOptions['type'] = 'release'

  if (options.major)
    type = 'major'
  else if (options.minor)
    type = 'minor'
  else if (options.patch)
    type = 'patch'
  else if (options.premajor)
    type = 'premajor'
  else if (options.prerelease)
    type = 'prerelease'
  else if (options.preminor)
    type = 'preminor'
  else if (options.prepatch)
    type = 'prepatch'

  return type
}

function parseGroupNames(value: string): string[] {
  return value.split(',').map(name => name.trim()).filter(Boolean)
}

/** The files of the report given on the command line, if any */
function getReportOverride(options: { reportJson?: string, reportDotenv?: string, reportMarkdown?: string }) {
  const report = { json: options.reportJson, dotenv: options.reportDotenv, markdown: options.reportMarkdown }
  return Object.values(report).some(Boolean)
    ? report
    : undefined
}

function privatePackagesOption() {
  return new Option('--private-packages <mode>', 'What to do with the private packages, overrides monorepo.privatePackages (release: version them, never publish them)').choices(['ignore', 'release'])
}

function slackFormatOption() {
  return new Option('--slack-format <format>', 'Changelog of the Slack message, overrides social.slack.changelog').choices(['full', 'summary', 'none'])
}

/**
 * Exit after a failed command: with code 0 when the user refused or cancelled
 * a prompt (nothing was written), with code 1 otherwise.
 */
function exitWithError(message: string, error: unknown): never {
  if (isRelizyCancelError(error)) {
    if (!isErrorReported(error)) {
      logger.log('')
      logger.fail(error.message)
    }
    process.exit(0)
  }

  // Already shown by the output of the command
  if (!isErrorReported(error)) {
    logger.error(message, error)
  }
  process.exit(1)
}

program
  .name('relizy')
  .description('Release management tool for monorepos and standalone packages')
  .version(version)
  .option('--config <name>', 'Config file name (without .config.ts - e.g. changelog-test)')
  .option('--no-safety-check', 'Skip safety check')
  .option('--log-level <level>', 'Set log level (silent, error, warning, normal, default, debug, trace, verbose), instead of the logLevel of the config')
  .option('--dry-run', 'Preview changes without writing files, creating tags, commits or publishing')
  .option('--no-preview', 'In dry-run, do not show what would be generated (changelogs, release notes, posts, PR comment)')
  .option('--ai-preview', 'In dry-run, call the AI to preview its rewrites (it costs), instead of simulating them')
  .option('--pr-number <number>', 'Override PR/MR number for PR comment features', Number)
  .option('--group <names>', 'Only release these version groups of monorepo.groups (comma-separated names)', parseGroupNames)

program
  .command('bump')
  .description('Bump package versions')
  .option('--major', 'Bump major version')
  .option('--minor', 'Bump minor version')
  .option('--patch', 'Bump patch version')
  .option('--prerelease', 'Bump prerelease version')
  .option('--premajor', 'Bump premajor version')
  .option('--preminor', 'Bump preminor version')
  .option('--prepatch', 'Bump prepatch version')
  .option('--preid <id>', 'Prerelease identifier (alpha, beta, rc, etc.)')
  .option('--suffix <suffix>', 'Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)')
  .option('--no-clean', 'Skip check if the working directory is clean')
  .option('--force', 'Bump even if there are no commits')
  .option('--yes', 'Skip confirmation prompt about bumping packages')
  .option('--canary', 'Publish a canary release from the current commit')
  .addOption(privatePackagesOption())
  .action(async (options) => {
    try {
      await bump({
        type: getReleaseType(options),
        preid: options.preid,
        clean: hasCliFlag('--no-clean')
          ? false
          : undefined,
        dryRun: program.opts().dryRun,
        logLevel: program.opts().logLevel,
        force: options.force,
        yes: options.yes,
        suffix: options.suffix,
        configName: program.opts().config,
        groups: program.opts().group,
        canary: options.canary,
        privatePackages: options.privatePackages,
      })
    }
    catch (error) {
      exitWithError('Failed to bump packages -', error)
    }
  })

program
  .command('changelog')
  .description('Generate changelogs for all packages')
  .option('--from <ref>', 'Start commit reference')
  .option('--to <ref>', 'End commit reference')
  .option('--format-cmd <cmd>', 'Command formatting the changelogs once written, {{files}} replaced by their paths (e.g. "eslint --fix {{files}}")')
  .option('--no-format-cmd', 'Do not format the changelogs (no formatter detected)')
  .option('--no-root-changelog', 'Skip generation of root changelog file')
  .addOption(privatePackagesOption())
  .action(async (options) => {
    try {
      await changelog({
        from: options.from,
        to: options.to,
        formatCmd: options.formatCmd,
        rootChangelog: hasCliFlag('--no-root-changelog')
          ? false
          : undefined,
        dryRun: program.opts().dryRun,
        logLevel: program.opts().logLevel,
        configName: program.opts().config,
        groups: program.opts().group,
        privatePackages: options.privatePackages,
      })
    }
    catch (error) {
      exitWithError('Failed to generate changelog -', error)
    }
  })

program
  .command('publish')
  .description('Publish packages to registry')
  .option('--registry <url>', 'Custom registry URL')
  .option('--tag <tag>', 'Publish with specific tag (default: latest for stable, next for prerelease)')
  .option('--access <type>', 'Package access level (public or restricted)')
  .option('--otp <code>', 'One-time password for 2FA')
  .option('--build-cmd <cmd>', 'Command to build packages before publish (e.g. "pnpm build")')
  .option('--publish-token <token>', 'Registry token, instead of tokens.registry (npm, pnpm and bun)')
  .option('--skip-existing-versions', 'Skip packages whose version already exists on the registry instead of failing')
  .action(async (options) => {
    try {
      await publish({
        registry: options.registry,
        tag: options.tag,
        access: options.access,
        otp: options.otp,
        buildCmd: options.buildCmd,
        token: options.publishToken,
        skipExistingVersions: options.skipExistingVersions,
        dryRun: program.opts().dryRun,
        logLevel: program.opts().logLevel,
        configName: program.opts().config,
        groups: program.opts().group,
        safetyCheck: hasCliFlag('--no-safety-check')
          ? false
          : undefined,
      })
    }
    catch (error) {
      exitWithError('Failed to publish packages -', error)
    }
  })

program
  .command('provider-release')
  .description('Publish release to git provider (github or gitlab)')
  .option('--from <ref>', 'Start commit reference')
  .option('--to <ref>', 'End commit reference')
  .option('--token <token>', 'Provider token')
  .option('--provider <provider>', 'Git provider (github or gitlab)')
  .option('--ai', 'Force-enable AI for release notes')
  .option('--no-ai', 'Force-disable AI for release notes')
  .action(async (options) => {
    try {
      const result = await providerRelease({
        token: options.token,
        from: options.from,
        to: options.to,
        provider: options.provider,
        dryRun: program.opts().dryRun,
        logLevel: program.opts().logLevel,
        configName: program.opts().config,
        groups: program.opts().group,
        safetyCheck: hasCliFlag('--no-safety-check')
          ? false
          : undefined,
        ai: hasCliFlag('--ai')
          ? true
          : hasCliFlag('--no-ai')
            ? false
            : undefined,
      })

      // The error is already shown by the output of the command
      if (result.error) {
        process.exitCode = 1
      }
    }
    catch (error) {
      exitWithError('Failed to publish release -', error)
    }
  })

program
  .command('social')
  .description('Post release announcements to social media platforms')
  .option('--from <ref>', 'Start commit reference')
  .option('--to <ref>', 'End commit reference')
  .option('--ai', 'Force-enable AI for social posts')
  .option('--no-ai', 'Force-disable AI for social posts')
  .addOption(slackFormatOption())
  .action(async (options) => {
    try {
      const result = await social({
        from: options.from,
        to: options.to,
        dryRun: program.opts().dryRun,
        logLevel: program.opts().logLevel,
        configName: program.opts().config,
        groups: program.opts().group,
        safetyCheck: hasCliFlag('--no-safety-check')
          ? false
          : undefined,
        ai: hasCliFlag('--ai')
          ? true
          : hasCliFlag('--no-ai')
            ? false
            : undefined,
        slackFormat: options.slackFormat,
      })

      // The errors are already shown by the output of the command
      if (result.hasErrors) {
        process.exitCode = 1
      }
    }
    catch (error) {
      exitWithError('Failed to post the release on social media -', error)
    }
  })

program
  .command('commitlint')
  .description('Lint commit messages with the relizy config (types, scopes, changelog rendering)')
  .option('--edit [file]', 'Lint the message of the commit being created (the file given to the commit-msg hook, .git/COMMIT_EDITMSG by default)')
  .option('--message <message>', 'Lint this message')
  .option('--from <ref>', 'Lint the commits after this ref (default: merge-base of the pull/merge request in CI, otherwise the last tag)')
  .option('--to <ref>', 'Last commit of the range (default: HEAD)')
  .option('--title', 'Also lint the title of the pull/merge request in CI (default: commitlint.title)')
  .option('--no-title', 'Do not lint the title of the pull/merge request in CI')
  .option('--preview', 'Print the changelog entry of each commit')
  .option('--quiet', 'Only print the commits with problems, and the summary')
  .addOption(new Option('--format <format>', 'Output format: text for people, json for programs and AI agents').choices(['text', 'json']).default('text'))
  .option('--install', 'Write the commit-msg hook running relizy commitlint (in .husky/ when husky is set up)')
  .option('--force', 'Replace an existing commit-msg hook with --install')
  .action(async (options) => {
    try {
      const { errorCount } = await commitlint({
        edit: options.edit,
        message: options.message,
        from: options.from,
        to: options.to,
        title: options.title,
        preview: options.preview,
        format: options.format,
        quiet: options.quiet,
        install: options.install,
        force: options.force,
        configName: program.opts().config,
        logLevel: program.opts().logLevel,
      })
      if (errorCount > 0) {
        process.exit(1)
      }
    }
    catch (error) {
      // Expected errors (missing ref, existing hook...): the message is enough in a hook or a CI log
      const message = error instanceof Error
        ? error.message
        : String(error)
      if (options.format === 'json') {
        process.stdout.write(`${JSON.stringify({ valid: false, error: message }, null, 2)}\n`)
      }
      else {
        logger.error('Failed to lint the commits -', message)
      }
      process.exit(1)
    }
  })

program
  .command('init')
  .description('Create the relizy config of the project: detect the packages, ask the rest, set up commitlint')
  .option('--yes', 'Accept the detected values without asking')
  .option('--force', 'Replace an existing config file (kept by default, the other steps still run)')
  .option('--no-workflow', 'Do not offer the release workflow of the CI (GitHub Actions, GitLab CI)')
  .action(async (options) => {
    try {
      await init({
        yes: options.yes,
        force: options.force,
        workflow: options.workflow,
        dryRun: program.opts().dryRun,
        configName: program.opts().config,
        logLevel: program.opts().logLevel,
      })
    }
    catch (error) {
      logger.error('Failed to init relizy -', error instanceof Error
        ? error.message
        : error)
      process.exit(1)
    }
  })

const mcp = program
  .command('mcp')
  .description('MCP server for the AI coding agents (Claude Code, Cursor, Copilot, Codex...): release preview, commit linting, config reference and docs of this relizy version')

mcp
  .command('serve', { isDefault: true })
  .description('Start the MCP server on stdio (default command of relizy mcp)')
  .option('--cwd <dir>', 'Root of the project (default: current directory)')
  .action(async (options) => {
    try {
      if (options.cwd) {
        process.chdir(options.cwd)
      }

      const { startStdioServer } = await import('./mcp')
      await startStdioServer({
        cwd: process.cwd(),
      })
    }
    catch (error) {
      process.stderr.write(`Failed to start the relizy MCP server - ${error instanceof Error
        ? error.message
        : error}\n`)
      process.exit(1)
    }
  })

mcp
  .command('init')
  .description('Configure the AI agents of the project for relizy: rules (Claude Code, AGENTS.md) and MCP server (.mcp.json, Cursor, VS Code)')
  .option('--targets <agents>', 'Comma-separated agents: claude, agents-md, cursor, vscode (default: the detected ones, else claude,agents-md)', parseGroupNames)
  .option('--no-rules', 'Only register the MCP server, without the rules')
  .option('--no-mcp', 'Only write the rules, without the MCP server')
  .option('--remove', 'Remove what relizy mcp init added')
  .action(async (options) => {
    try {
      const { mcpInit } = await import('./mcp')

      mcpInit({
        targets: options.targets,
        rules: options.rules,
        mcp: options.mcp,
        remove: options.remove,
        dryRun: program.opts().dryRun,
      })
    }
    catch (error) {
      logger.error('Failed to set up the AI agents -', error instanceof Error
        ? error.message
        : error)
      process.exit(1)
    }
  })

program
  .command('pr-comment')
  .description('Post or re-post a PR comment with release information')
  .action(async () => {
    try {
      await prComment({
        prNumber: program.opts().prNumber,
        dryRun: program.opts().dryRun,
        logLevel: program.opts().logLevel,
        configName: program.opts().config,
      })
    }
    catch (error) {
      exitWithError('Failed to post PR comment -', error)
    }
  })

program
  .command('merge-preview')
  .description('Preview what the merge of the pull request releases, with the options of the release job, without writing anything: comment and commit status on the pull request, fails when the release of the merge would fail')
  .option('--major', 'Bump major version')
  .option('--minor', 'Bump minor version')
  .option('--patch', 'Bump patch version')
  .option('--prerelease', 'Bump prerelease version')
  .option('--premajor', 'Bump premajor version')
  .option('--preminor', 'Bump preminor version')
  .option('--prepatch', 'Bump prepatch version')
  .option('--preid <id>', 'Prerelease identifier (alpha, beta, rc, etc.)')
  .option('--suffix <suffix>', 'Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)')
  .option('--from <ref>', 'Start commit reference')
  .option('--to <ref>', 'End commit reference')
  .option('--force', 'Bump even if there are no commits')
  .option('--no-publish', 'The release job does not publish')
  .option('--no-commit', 'The release job does not commit nor tag')
  .option('--no-git-tag', 'The release job does not create tags')
  .option('--registry <url>', 'Custom npm registry URL')
  .option('--tag <tag>', 'Publish with specific tag (default: latest for stable, next for prerelease)')
  .option('--token <token>', 'Git token (github or gitlab)')
  .option('--publish-token <token>', 'Registry token, instead of tokens.registry (npm, pnpm and bun)')
  .addOption(privatePackagesOption())
  .option('--no-comment', 'Do not comment the pull request')
  .option('--no-check', 'Do not set the commit status')
  .option('--report-json <file>', 'Write the report of the preview to this JSON file')
  .option('--report-markdown <file>', 'Write the preview to this markdown file, e.g. for an artifact of GitLab CI')
  .action(async (options) => {
    try {
      await mergePreview({
        type: getReleaseType(options),
        preid: options.preid,
        suffix: options.suffix,
        from: options.from,
        to: options.to,
        force: options.force,
        publish: hasCliFlag('--no-publish')
          ? false
          : undefined,
        commit: hasCliFlag('--no-commit')
          ? false
          : undefined,
        gitTag: hasCliFlag('--no-git-tag')
          ? false
          : undefined,
        registry: options.registry,
        tag: options.tag,
        token: options.token,
        publishToken: options.publishToken,
        privatePackages: options.privatePackages,
        comment: hasCliFlag('--no-comment')
          ? false
          : undefined,
        check: hasCliFlag('--no-check')
          ? false
          : undefined,
        prNumber: program.opts().prNumber,
        logLevel: program.opts().logLevel,
        configName: program.opts().config,
        groups: program.opts().group,
        report: getReportOverride(options),
      })
    }
    catch (error) {
      exitWithError('Failed to preview the merge -', error)
    }
  })

program
  .command('release')
  .description('Complete release workflow (bump + changelog + commit + tag + push to remote + publish release)')
  .option('--major', 'Bump major version')
  .option('--minor', 'Bump minor version')
  .option('--patch', 'Bump patch version')
  .option('--prerelease', 'Bump prerelease version')
  .option('--premajor', 'Bump premajor version')
  .option('--preminor', 'Bump preminor version')
  .option('--prepatch', 'Bump prepatch version')
  .option('--preid <id>', 'Prerelease identifier (alpha, beta, rc, etc.)')
  .option('--suffix <suffix>', 'Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)')
  .option('--from <ref>', 'Start commit reference')
  .option('--to <ref>', 'End commit reference')
  .option('--no-push', 'Skip push changes and tags to remote')
  .option('--no-provider-release', 'Skip release creation (GitHub/GitLab)')
  .option('--no-publish', 'Skip npm publish')
  .option('--registry <url>', 'Custom npm registry URL')
  .option('--tag <tag>', 'Publish with specific tag (default: latest for stable, next for prerelease)')
  .option('--access <type>', 'Package access level (public or restricted)')
  .option('--otp <code>', 'One-time password for 2FA')
  .option('--no-verify', 'Skip git hooks during commit')
  .option('--format-cmd <cmd>', 'Command formatting the changelogs once written, {{files}} replaced by their paths (e.g. "eslint --fix {{files}}")')
  .option('--no-format-cmd', 'Do not format the changelogs (no formatter detected)')
  .option('--build-cmd <cmd>', 'Command to build packages before publish (e.g. "pnpm build")')
  .option('--no-root-changelog', 'Skip generation of root changelog file')
  .option('--token <token>', 'Git token (github or gitlab)')
  .option('--force', 'Bump even if there are no commits')
  .option('--no-clean', 'Skip check if the working directory is clean')
  .option('--no-commit', 'Skip commit and tag')
  .option('--no-git-tag', 'Skip tag creation')
  .option('--no-changelog', 'Skip changelog generation files')
  .option('--provider <provider>', 'Git provider (github or gitlab)')
  .option('--no-social', 'Skip social media posting')
  .option('--no-pr-comment', 'Skip PR comment posting')
  .option('--yes', 'Skip confirmation prompt about bumping packages')
  .option('--publish-token <token>', 'Registry token, instead of tokens.registry (npm, pnpm and bun)')
  .option('--skip-existing-versions', 'Skip packages whose version already exists on the registry instead of failing')
  .option('--canary', 'Publish a canary release from the current commit')
  .addOption(privatePackagesOption())
  .option('--ai', 'Force-enable AI for release notes and social posts')
  .option('--no-ai', 'Force-disable AI for release notes and social posts')
  .option('--report-json <file>', 'Write the report of the release to this JSON file')
  .option('--report-dotenv <file>', 'Write the outputs of the release to this dotenv file (RELIZY_RELEASED=true...), for the artifacts:reports:dotenv of GitLab CI')
  .option('--report-markdown <file>', 'Write the summary of the release to this markdown file, e.g. for an artifact of GitLab CI')
  .addOption(slackFormatOption())
  .action(async (options) => {
    try {
      await release({
        type: getReleaseType(options),
        preid: options.preid,
        suffix: options.suffix,
        canary: options.canary,
        privatePackages: options.privatePackages,
        from: options.from,
        to: options.to,
        changelog: hasCliFlag('--no-changelog')
          ? false
          : undefined,
        commit: hasCliFlag('--no-commit')
          ? false
          : undefined,
        push: hasCliFlag('--no-push') || hasCliFlag('--no-commit')
          ? false
          : undefined,
        publish: hasCliFlag('--no-publish')
          ? false
          : undefined,
        providerRelease: hasCliFlag('--no-provider-release')
          ? false
          : undefined,
        gitTag: hasCliFlag('--no-git-tag')
          ? false
          : undefined,
        noVerify: hasCliFlag('--no-verify')
          ? true
          : undefined,
        clean: hasCliFlag('--no-clean')
          ? false
          : undefined,
        registry: options.registry,
        tag: options.tag,
        access: options.access,
        otp: options.otp,
        dryRun: program.opts().dryRun,
        formatCmd: options.formatCmd,
        buildCmd: options.buildCmd,
        rootChangelog: hasCliFlag('--no-root-changelog')
          ? false
          : undefined,
        token: options.token,
        publishToken: options.publishToken,
        skipExistingVersions: options.skipExistingVersions,
        logLevel: program.opts().logLevel,
        force: options.force,
        yes: options.yes,
        configName: program.opts().config,
        groups: program.opts().group,
        safetyCheck: hasCliFlag('--no-safety-check')
          ? false
          : undefined,
        social: hasCliFlag('--no-social')
          ? false
          : undefined,
        prComment: hasCliFlag('--no-pr-comment')
          ? false
          : undefined,
        prNumber: program.opts().prNumber,
        ai: hasCliFlag('--ai')
          ? true
          : hasCliFlag('--no-ai')
            ? false
            : undefined,
        slackFormat: options.slackFormat,
        report: getReportOverride(options),
      })
    }
    catch (error) {
      exitWithError('Failed to release -', error)
    }
  })

program.parse()
