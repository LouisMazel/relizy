---
title: social()
description: Post the release on Twitter (X), Slack and Microsoft Teams from code, and read the result of each platform.
keywords: relizy social api, social, twitter api, slack api, SocialOptions, SocialResult, release announcements api
category: API Reference
tags: [api, social, twitter, slack, teams, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Signature

```ts
function social(options?: Partial<SocialOptions>): Promise<SocialResult>
```

Options: [`SocialOptions`](./../typedoc/interfaces/SocialOptions.md): `bumpResult`, `from`, `to`, `dryRun`, `ai` (force the AI on or off), `slackFormat` (`summary` or `full`), `safetyCheck`, `suffix`, `force`, `groups`, and the [shared options](./usage.md#shared-options) `config`, `configName` and `logLevel`. Result: [`SocialResult`](./../typedoc/interfaces/SocialResult.md), with one [`SocialNetworkResult`](./../typedoc/interfaces/SocialNetworkResult.md) per enabled platform.

## Behavior

- Posts once per enabled platform (`social.<platform>.enabled`), what the release ships: with a `bumpResult` (a [`BumpResultTruthy`](./../typedoc/interfaces/BumpResultTruthy.md), as `bump()` returns it), its versions; without, the versions of the `package.json` files and the commits since the previous tags (`from` and `to` set the range). See [Social Media](./../guide/social-media.md) for the posts.
- `results` is empty when no platform is enabled or nothing is to announce. A post that fails gives `{ platform, success: false, error }` and `hasErrors: true`.
- `social()` does not reject: an error (the safety check, a missing config...) is returned as a result of the `unknown` platform with `hasErrors: true`. Only a refused or cancelled prompt rejects, with a [`RelizyCancelError`](./usage.md).
- `results[].url` is the link of the tweet.
- With `dryRun`, nothing is posted and the AI is not called: the CLI flag `--ai-preview` has no equivalent in the API.
- The hooks get the release as third parameter (`HookContext`) only with a `bumpResult`. See [Social Media](./../guide/social-media.md#hooks).

## Example

```ts
import { social } from 'relizy'

// The current release, as `relizy social` posts it
const { results, hasErrors } = await social({ dryRun: process.env.CI !== 'true' })

for (const result of results) {
  console.log(result.platform, result.success ? (result.url ?? 'posted') : result.error)
}

if (hasErrors) {
  process.exitCode = 1
}
```

## See Also

- [Social Media](./../guide/social-media.md)
- [Social Configuration](./../config/social.md)
- [`relizy social`](./../cli/social.md)
- [API usage](./usage.md)
