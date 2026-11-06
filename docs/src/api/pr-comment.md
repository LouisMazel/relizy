---
title: prComment()
description: Post the release comment on the pull request or merge request from code, and know whether it was posted.
keywords: relizy pr comment api, prComment, pull request comment api, merge request comment api, ReleaseContext, PrCommentOptions
category: API Reference
tags: [api, pr-comment, pull-request, merge-request, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Signature

```ts
function prComment(options?: PrCommentOptions): Promise<boolean>
```

Options: [`PrCommentOptions`](./../typedoc/interfaces/PrCommentOptions.md), and [`ReleaseContext`](./../typedoc/interfaces/ReleaseContext.md) for `releaseContext`.

## Behavior

- Without `releaseContext`, the comment is the one of [`relizy pr-comment`](./../guide/pr-comment.md#the-comment-of-relizy-pr-comment), read from the `package.json` files. With a `releaseContext`, it follows its `status` (`success`, `no-release`, `failed`); with its `report`, the comment is the [summary of the release](./../guide/pr-comment.md#the-comment-of-a-release), as in `release()`.
- Resolves `true` when the comment is posted, or with `dryRun` when a pull request is found (always with `prNumber`, even without token), `false` otherwise: without pull request (the warning tells to set `prNumber`), without token, or when the API of the provider refuses it (with a warning).
- Rejects on an error of the config or of the project (e.g. an unreadable root `package.json`). `release()` catches it: a failed comment never fails a release.
- `dryRun` still calls the API of the provider to find the pull request, and posts nothing.

## Example

```ts
import { loadRelizyConfig, prComment } from 'relizy'

const config = await loadRelizyConfig({ configFile: 'relizy' })

const posted = await prComment({
  config,
  prNumber: Number(process.env.PR_NUMBER),
})

if (!posted) {
  console.warn('No release comment posted')
}
```

## See Also

- [PR Comments](./../guide/pr-comment.md)
- [`relizy pr-comment`](./../cli/pr-comment.md)
- [API usage](./usage.md)
