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
export type { ConfigOptionNode, GetConfigOptionsOptions } from './core/config-options'
export { getConfigOptions } from './core/config-options'
export { isRelizyCancelError, RelizyCancelError } from './core/errors'
export type {
  BumpStepData,
  ChangelogStepData,
  ChecksStepData,
  CommandCompleteEvent,
  CommandErrorEvent,
  CommandStartEvent,
  CommitAndTagStepData,
  LinkEvent,
  LogEvent,
  NoteEvent,
  PrCommentStepData,
  PreviewEvent,
  ProgressMessageEvent,
  ProgressStep,
  ProviderReleaseStepData,
  PublishStepData,
  PublishStepPackage,
  PushStepData,
  ReleaseFinishEvent,
  RelizyEvent,
  RelizyEventListener,
  SocialStepData,
  SocialStepPost,
  StepCheck,
  StepData,
  StepDataMap,
  StepDoneEvent,
  StepFailedEvent,
  StepItem,
  StepItemEvent,
  StepSkippedEvent,
  StepStartEvent,
  WithStepData,
} from './core/events'
export type { MergePreviewProblem, MergePreviewSquashMode } from './core/merge-preview'
export type { CheckMigrationOptions, MigrationFinding, MigrationReport } from './core/migration'
export { checkMigration } from './core/migration'
export type { ProfileInfo, ProfileOptions, ProfileSection, ProfileSetting } from './core/profiles'
export { listProfiles, UnknownProfileError } from './core/profiles'
export type { ReleaseLine, ReleaseOverview, ReleaseOverviewGroup, ReleaseOverviewPackage } from './core/release-overview'
export type { PreviewBumpType, PreviewChangelog, PreviewChangelogOptions, PreviewCommit, PreviewPackage, PreviewReleaseOptions, PreviewSet, PreviewStep, ReleasePreview } from './core/release-preview'
export { previewChangelog, previewRelease } from './core/release-preview'
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
