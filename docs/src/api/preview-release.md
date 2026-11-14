---
title: previewRelease() and previewChangelog()
description: Compute what the next release does as data, without writing anything - the versions, the bump type, the commits and the reason of each package, the tags, the steps and the changelog entries.
keywords: relizy preview api, previewRelease, previewChangelog, release preview, dry run data, structured preview, ReleasePreview, bump preview
category: API Reference
tags: [api, preview, release, changelog, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
function previewRelease(options?: PreviewReleaseOptions): Promise<ReleasePreview>
function previewChangelog(options?: PreviewChangelogOptions): Promise<PreviewChangelog[]>
```

They are the implementation of the `preview_release` and `preview_changelog` tools of the [MCP server](./../cli/mcp.md), for a program that shows the release before it runs (an app, a dashboard). They write nothing, run no hook, ask nothing, and only use the network when you ask: `fetchTags`, `checks`, `changelog.contributors`. The [profile](./../config/profiles.md), the config and the overrides apply as in [`release()`](./release.md).

They print nothing: the warnings of the computation are in `warnings` (with the `default` level of the logger, or the `logLevel` of `overrides`), and the level of the logger is back to the one of before once they end. Several previews can run at the same time (several projects of an application): each one gets its own warnings.

## Options

| Option                              | Description                                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                               | Root of the project, `process.cwd()` by default                                                                                                                |
| `configName`, `config`              | The config to load (a name or a path, see [Multiple configs](./../config/overview.md#multiple-configs)), or a config already resolved                          |
| `profile`, `overrides`              | A [profile](./../config/profiles.md), and options applied over the config (`{ release: { social: false } }`)                                                   |
| `type`, `preid`, `suffix`, `canary` | What `--minor`, `--preid`, `--suffix` and `--canary` do                                                                                                        |
| `from`, `to`, `force`, `groups`     | The range of the commits, `--force`, and the [version groups](./../guide/version-groups.md) to preview                                                         |
| `fetchTags`                         | Run `git fetch --tags` first, as the release does. Default: `false`, the local tags are used                                                                   |
| `checks`                            | Check what would make the release fail: a version already published, a tag already on the remote. Default: `false`, it uses the network                        |
| `changelog`                         | Add the changelog entries to the preview: `true` for all of them, `{ package: 'core', contributors: false }` for one (`contributors` may query the GitHub API) |

## ReleasePreview

```ts
interface ReleasePreview {
  profile?: string // the profile applied
  canary: boolean
  versionMode: 'unified' | 'selective' | 'independent' | 'standalone' | 'groups'
  released: boolean // at least one package is released
  sets: PreviewSet[] // the project, or one per version group
  tags: string[] // the git tags the release creates
  steps: PreviewStep[] // every step of release, in order, with whether it runs
  problems: { kind: string, message: string }[] // with `checks`: what would make the release fail
  warnings: string[]
  changelogs: PreviewChangelog[] // with `changelog`
}

interface PreviewSet {
  group?: string
  title: string
  versionMode: 'unified' | 'selective' | 'independent' | 'standalone'
  released: boolean
  oldVersion?: string // unified and selective: the root version
  newVersion?: string
  bump?: PreviewBumpType
  tag?: string
  fromTag?: string
  commits: PreviewCommit[]
  packages: PreviewPackage[]
  notReleased: string[] // no commit, no bumped dependency
}

interface PreviewPackage {
  name: string
  path: string // relative to the project
  private: boolean
  oldVersion: string
  newVersion: string
  bump: 'major' | 'minor' | 'patch' | 'premajor' | 'preminor' | 'prepatch' | 'prerelease' | 'graduation' | 'canary'
  tag?: string
  reason: 'commits' | 'dependency' | 'graduation' | 'forced' | 'unified'
  commits: PreviewCommit[]
  dependency?: { chain: string[], group?: string, outOfRange?: { name: string, field: string, range: string | null, newVersion: string } }
  breakingPeerDependency?: string
}

interface PreviewStep {
  name: 'bump' | 'changelog' | 'publish' | 'commit-and-tag' | 'push' | 'provider-release' | 'social' | 'pr-comment'
  label: string
  enabled: boolean
  disabledBy?: string // `release.social`, `release.canary`
}

interface PreviewCommit {
  hash?: string // the full hash (none for the squash commit simulated by a merge preview)
  shortHash: string
  type: string // `feat`, `fix`...
  scope: string // empty without scope
  description: string
  breaking: boolean
  author?: string
}

interface PreviewChangelog {
  label: string
  file: string // `packages/core/CHANGELOG.md`
  packageName: string
  content: string // the markdown added at the top of the file
}
```

`reason: 'dependency'` comes with `dependency`: the chain of dependencies leading to the package, the version group releasing the dependency when it is another one, and for a version out of the published range of the package (a peer dependency, a `workspace:*`...) the range, the field and the new version. `breakingPeerDependency` names a peer dependency making a breaking change that the published range of the package rejects. The step names are the ones of the [hooks](./../config/hooks.md) and of the [progress events](./progress-events.md).

## Examples

```ts
import { previewChangelog, previewRelease } from 'relizy'

const preview = await previewRelease({ profile: 'beta', checks: true })

if (!preview.released) {
  console.log('Nothing to release')
}

for (const set of preview.sets) {
  console.log(set.title, set.oldVersion, '->', set.newVersion)

  for (const pkg of set.packages) {
    console.log(`  ${pkg.name} ${pkg.oldVersion} -> ${pkg.newVersion} (${pkg.bump}, ${pkg.reason}, ${pkg.commits.length} commits)`)
  }
}

for (const problem of preview.problems) {
  console.error(problem.message)
}

const changelogs = await previewChangelog({ profile: 'beta', package: 'root' })
console.log(changelogs[0]?.content)
```

The same preview as the MCP tools: `previewRelease({ changelog: true })` for the versions and the changelogs in one computation. `previewChangelog({ package })` throws when the release does not release this package: the message lists the released ones.

## See Also

- [Profiles](./../config/profiles.md)
- [Progress events](./progress-events.md)
