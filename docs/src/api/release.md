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
- **Publish**: `publish`, `registry`, `registries`, `tag` (the dist-tag), `access`, `otp`, `buildCmd`, `publishToken`, `skipExistingVersions`, `checkWorkspaceDependencies`, `args`, `packageManager`, `safetyCheckTimeout`
- **Git**: `commit`, `gitTag` (the git tags), `noVerify`, `push`
- **Provider release**: `providerRelease`, `provider`, `token` (the token of the git provider), `ai` (also for the social posts)
- **Social and PR comment**: `social`, `slackFormat`, `prComment`, `prNumber`
- **Run**: `report`, `safetyCheck`, `configName` (a name or a path), `profile`, `config`, `overrides`, `onProgress`, `dryRun`, `logLevel`, `groups`
- **Application**: `onConfirm` (validates the versions instead of the prompt, see [`bump()`](./bump.md#confirm-from-an-application)), `onOtp` (gives the one-time password of the registry, see [`publish()`](./publish.md))

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

## See Also

- [`relizy release`](./../cli/release.md)
- [Programmatic API](./usage.md)
- [Release config](./../config/release.md)
