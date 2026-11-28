---
title: release()
description: Run the whole release from Node.js with release() - bump, changelog, publish, git tags and provider releases - and read the report of the release.
keywords: relizy release api, programmatic release, release report, canary release api, ReleaseOptions
category: API Reference
tags: [api, release, workflow, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
function release(options?: Partial<ReleaseOptions>): Promise<ReleaseReport>
```

`release()` runs the [steps of `relizy release`](./../cli/release.md#steps) and returns the [report of the release](./../config/release.md#report): its `status` (`released`, or `nothing` when no commit triggers a bump), `released` (`false` in dry-run), `version`, the packages and versions by version group (`release`), the `tags`, and what each step did (`steps`). It throws when the release fails, once the report is written and the failed PR comment posted.

## Options

The options are the flags of [`relizy release`](./../cli/release.md#options), camelCased, and override the [config](./../config/release.md):

- **Bump**: `type` (`BumpReleaseType`: `'release'`, the default, computes it from the commits), `preid`, `suffix`, `force`, `yes`, `clean`, `canary`, `privatePackages`, `dependencyTypes`, `capZeroMajor`, `outOfRangePeers`, `from`, `to`
- **Changelog**: `changelog`, `formatCmd`, `rootChangelog`, `includeCommitBody`
- **Publish**: `publish`, `registry`, `registries`, `tag` (the dist-tag), `access`, `otp`, `buildCmd`, `publishToken`, `skipExistingVersions`, `checkWorkspaceDependencies`, `args`, `packageManager`, `safetyCheckTimeout`, `staged` and `approve` ([staged publishing](#staged-versions))
- **Git**: `commit`, `gitTag` (the git tags), `noVerify`, `push`
- **Provider release**: `providerRelease`, `provider`, `token` (the token of the git provider), `ai` (also for the social posts)
- **Social and PR comment**: `social`, `slackFormat`, `prComment`, `prNumber`
- **Run**: `report`, `safetyCheck`, `configName` (a name or a path), `profile`, `config`, `overrides`, `onProgress`, `dryRun`, `logLevel`, `groups`
- **Application**: `onConfirm` (validates the versions instead of the prompt, see [`bump()`](./bump.md#confirm-from-an-application)), `onOtp` (gives the one-time password of the registry, see [`publish()`](./publish.md)), `onPrompt` (answers the approval of the staged versions, see [Staged Versions](#staged-versions)), `onWebAuth` (shows the web 2FA page of a security-key account for that approval)

`config` and `overrides` give a config already resolved, or a local overlay applied over the config file, without writing a file: see [Shared Options](./usage.md#shared-options). `onProgress` receives the [events](./progress-events.md) of the run, with what each step did as [data](./progress-events.md#step-data).

See [ReleaseOptions](./../typedoc/interfaces/ReleaseOptions.md) and [ReleaseReport](./../typedoc/interfaces/ReleaseReport.md) for the types.

## Examples

```ts
import { release } from 'relizy'

const report = await release({ yes: true, social: false })

if (report.released) {
  console.log(`Released ${report.version}: ${report.tags.join(', ')}`)
}
```

A canary version of a pull request:

```ts
await release({ canary: true, yes: true, prNumber: 42 })
```

With `canary`, the changelog, the commit, the git tags, the push, the provider release and the social posts are skipped. The version is `{nextVersion}-0.canary-{sha}` (`preid` replaces `canary`), published with the `canary` dist-tag unless `tag` is set. See [Canary Releases](./../guide/prereleases.md#canary-releases).

## Staged Versions

With [`staged`](./../config/publish.md#staged), `release()` stages the versions and, outside a CI, runs the `approve` step after the provider release and before the posts. What the application gives:

- `onPrompt({ kind: 'approve-staged', items })`: asked with `approve: 'prompt'` (the default). `approve: true` never asks. `onConfirm` keeps its meaning, the validation of the bump plan: answering `() => true` there never approves anything.
- `onOtp({ purpose: 'approve', count })`: the 2FA code, asked once for all the versions, and never mixed with the code of the publish. Without a terminal and without `onOtp`, the step is skipped (`not interactive`).

The release succeeds whatever the approval does: the report (`publish.staged`, each version with `approved`) and the `approve` step tell what still awaits approval, see [Progress events](./progress-events.md#staged-versions). A CI run skips the step (`ci`): approve later with [`stage()`](./stage.md).

```ts
import { release } from 'relizy'

const report = await release({
  yes: true,
  staged: { tags: ['latest'] },
  onPrompt: ({ kind, items }) => kind === 'approve-staged' && confirmInTheApp(items),
  onOtp: ({ purpose, count }) => askTheCodeInTheApp(purpose, count),
})

const awaiting = report.publish?.staged?.filter(version => !version.approved) ?? []
```

## See Also

- [`relizy release`](./../cli/release.md)
- [Programmatic API](./usage.md)
- [Release config](./../config/release.md)
