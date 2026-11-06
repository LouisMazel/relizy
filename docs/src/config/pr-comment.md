---
title: PR Comment Configuration
description: Option of the release comment posted on the pull request or merge request - update the previous comment or add a new one.
keywords: pr comment config, prComment, pull request comment, merge request comment, pr comment mode, append, update
category: Configuration
tags: [config, pr-comment, pull-request, merge-request]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

What the comment contains, how the pull request is found and the tokens it needs: [PR Comments](./../guide/pr-comment.md). In `relizy release`, the comment is posted when [`release.prComment`](./release.md#steps) is `true` (the default).

## mode

- **Type:** `'update' | 'append'`
- **Default:** `'update'`

- `update`: edit the previous comment of Relizy on the pull request (found by its hidden `<!-- relizy-pr-comment -->` marker), or add one when there is none. The pull request keeps a single Relizy comment.
- `append`: add a new comment at each run, to keep one per release attempt.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  prComment: {
    mode: 'append',
  },
})
```
