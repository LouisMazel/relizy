import type { CommitlintResult, WorkspacePackage } from '@relizy/core'
import type { ResolvedRelizyConfig } from '../config'
import { logger } from '@maz-ui/node'
import { determineSemverChange, getWorkspacePackages as findWorkspacePackages, isAllowedCommit, lintCommitMessage as lintMessage } from '@relizy/core'
import { DEFAULT_RELEASE_COMMIT_MESSAGES } from '../format'
import { getChangelogLinter, renderChangelogEntry } from './changelog-entry'

export interface LintCommitMessageOptions {
  config: ResolvedRelizyConfig
  /** Changed files of the commit, relative to the repository root */
  files?: string[]
  hash?: string
  /** Workspace packages, read from the config when not given */
  packages?: WorkspacePackage[]
  /**
   * Suggest a fixed header
   * @default true
   */
  suggest?: boolean
}

/**
 * Titles of the release commits created by relizy, from `templates.commitMessage`.
 * With version groups and without template, the title depends on the groups
 * that bumped: both default titles.
 */
function getReleaseCommitMessages(config: ResolvedRelizyConfig): string[] {
  const template = config.templates?.commitMessage
  return template
    ? [template]
    : config.monorepo?.groups
      ? Object.values(DEFAULT_RELEASE_COMMIT_MESSAGES)
      : []
}

/**
 * Packages of the monorepo, private ones included, as scopes: the ones relizy releases (`monorepo.packages`,
 * the packages of the groups), the workspace of the package manager and
 * `commitlint.packages`. `monorepo.ignored` is not applied: an ignored package
 * is released by another config, it is still a valid scope.
 */
export function getWorkspacePackages(config: ResolvedRelizyConfig): WorkspacePackage[] {
  return findWorkspacePackages({
    cwd: config.cwd,
    patterns: [
      ...(config.monorepo?.packages ?? []),
      ...(config.monorepo?.groups ?? []).flatMap(group => group.packages),
      ...(config.commitlint?.packages ?? []),
    ],
  })
}

/**
 * Lint a commit message with the relizy config: the same parser and types as the
 * release, the workspace packages for the scopes, the changelog rendering for the body.
 */
export function lintCommitMessage(message: string, options: LintCommitMessageOptions): Promise<CommitlintResult> {
  const { config, files, hash, suggest } = options

  return lintMessage(message, {
    types: config.types,
    scopeMap: config.scopeMap,
    scopes: config.commitlint?.scopes,
    rules: config.commitlint?.rules,
    customRules: config.commitlint?.customRules,
    ignores: config.commitlint?.ignores,
    defaultIgnores: config.commitlint?.defaultIgnores,
    releaseCommitMessages: getReleaseCommitMessages(config),
    config,
    packages: options.packages ?? getWorkspacePackages(config),
    changelog: {
      includeCommitBody: config.changelog?.includeCommitBody,
      renderEntry: commit => renderChangelogEntry(commit, config),
      getLinter: () => getChangelogLinter(config.cwd, config.commitlint?.changelogLinter),
    },
    getBump: (gitCommit) => {
      const type = config.types?.[gitCommit.type]
      if (!isAllowedCommit({
        commit: gitCommit,
        type: type === undefined
          ? undefined
          : type,
        changelog: false,
      })) {
        return undefined
      }
      return determineSemverChange([gitCommit], config.types)
    },
    files,
    hash,
    suggest,
    logger,
  })
}
