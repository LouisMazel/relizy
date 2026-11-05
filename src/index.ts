// The public API of relizy: a new export is a decision, guarded by `index.spec.ts`
export {
  bump,
  changelog,
  commitlint,
  prComment,
  providerRelease,
  publish,
  release,
  social,
} from './commands'
export type { CommitlintOptions, CommitlintRunResult } from './commands/commitlint'
export type { PrCommentOptions } from './commands/pr-comment'

export type {
  CommitlintProblem,
  CommitlintReport,
  CommitlintResult,
  CommitlintSuggestion,
  CommitlintSummary,
  InstalledHook,
  LintCommitMessageOptions,
  ReportEntry,
  WorkspacePackage,
} from './core/commitlint'
export { lintCommitMessage } from './core/commitlint'
export type { LoadRelizyConfigOptions, RelizyConfigOverrides, ResolvedConfig, ResolvedRelizyConfig } from './core/config'
export { defineConfig, loadRelizyConfig } from './core/config'
export { isRelizyCancelError, RelizyCancelError } from './core/errors'
export type { ReleaseLine, ReleaseOverview, ReleaseOverviewGroup, ReleaseOverviewPackage } from './core/release-overview'
export type {
  ReleaseAI,
  ReleaseContent,
  ReleaseGit,
  ReleasePublish,
  ReleaseReport,
  ReleaseStepName,
  ReleaseStepReport,
} from './core/release-report'
export type { RootPackage } from './core/repo'

export type * from './types'
