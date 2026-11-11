// The public API of relizy: a new export is a decision, guarded by `index.spec.ts`
export {
  bump,
  changelog,
  commitlint,
  mergePreview,
  MergePreviewError,
  prComment,
  providerRelease,
  publish,
  release,
  social,
} from './commands'
export type { CommitlintOptions, CommitlintRunResult } from './commands/commitlint'
export type { MergePreviewOptions } from './commands/merge-preview'
export type { PrCommentOptions } from './commands/pr-comment'

export type {
  CommitlintReport,
  CommitlintSummary,
  InstalledHook,
  LintCommitMessageOptions,
  ReportEntry,
} from './core/commitlint'
export { lintCommitMessage } from './core/commitlint'
export type { LoadRelizyConfigOptions, RelizyConfigOverrides, ResolvedConfig, ResolvedRelizyConfig } from './core/config'
export { defineConfig, loadRelizyConfig } from './core/config'
export { isRelizyCancelError, RelizyCancelError } from './core/errors'
export type { MergePreviewProblem, MergePreviewSquashMode } from './core/merge-preview'
export type { ReleaseLine, ReleaseOverview, ReleaseOverviewGroup, ReleaseOverviewPackage } from './core/release-overview'
export type {
  ReleaseAI,
  ReleaseContent,
  ReleaseGit,
  ReleaseMergePreview,
  ReleasePublish,
  ReleaseReport,
  ReleaseStepName,
  ReleaseStepReport,
} from './core/release-report'
export type { RootPackage } from './core/repo'
export type * from './types'

export type { CommitlintProblem, CommitlintResult, CommitlintSuggestion, WorkspacePackage } from '@relizy/core'
