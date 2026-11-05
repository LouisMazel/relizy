---
title: providerRelease()
description: Create the GitHub or GitLab releases from Node.js.
keywords: relizy provider release api, github release api, gitlab release api, ProviderReleaseOptions, ProviderReleaseResult
category: API Reference
tags: [api, provider-release, github, gitlab, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
function providerRelease(options?: Partial<ProviderReleaseOptions>): Promise<ProviderReleaseResult>
```

`providerRelease()` runs [`relizy provider-release`](./../cli/provider-release.md). It returns the `detectedProvider` and the `postedReleases` (`name`, `tag`, `version`, `prerelease`). When the release fails, it does not throw: the result has an `error` message and no posted release. Only a cancelled prompt throws (see [Errors](./usage.md#errors)).

## Options

The flags of [`relizy provider-release`](./../cli/provider-release.md#options), camelCased, and the [shared options](./usage.md#shared-options):

| Option            | Description                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `bumpResult`      | `BumpResultTruthy`, the result of [`bump()`](./bump.md): the releases of the bumped versions  |
| `from`, `to`      | The commit range of the release notes                                                         |
| `provider`        | `'github'` or `'gitlab'`, instead of the one detected from the `origin` remote                |
| `token`           | Token of the git provider, overrides [`tokens`](./../config/overview.md#tokens)               |
| `ai`              | `true` or `false` forces or disables the AI rewrite of the notes, see [AI](./../config/ai.md) |
| `safetyCheck`     | `false` skips the check of the token (and of the AI provider)                                 |
| `force`, `suffix` | Without `bumpResult`, as for [`bump()`](./bump.md)                                            |

See [ProviderReleaseOptions](./../typedoc/interfaces/ProviderReleaseOptions.md) and [ProviderReleaseResult](./../typedoc/interfaces/ProviderReleaseResult.md).

## Examples

```ts
import { bump, providerRelease } from 'relizy'

const bumpResult = await bump({ yes: true })

if (bumpResult.bumped) {
  // After the commit and the tags are pushed
  const result = await providerRelease({ bumpResult })

  if (result.error) {
    console.error(`No ${result.detectedProvider} release: ${result.error}`)
  }
}
```

## See Also

- [`relizy provider-release`](./../cli/provider-release.md)
- [AI-Enhanced Changelogs](./../guide/ai-changelog.md)
