---
title: PR Comment Configuration
description: Option of the release comment posted on the pull request or merge request - update the previous comment, add a new one, or replace it with a new one.
keywords: pr comment config, prComment, pull request comment, merge request comment, pr comment mode, append, update, recreate
category: Configuration
tags: [config, pr-comment, pull-request, merge-request]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

What the comment contains, how the pull request is found and the tokens it needs: [PR Comments](./../guide/pr-comment.md). In `relizy release`, the comment is posted when [`release.prComment`](./release.md#steps) is `true` (the default).

## mode

- **Type:** `'update' | 'append' | 'recreate'`
- **Default:** `'update'`

| Mode       | What it does                                                         | Comments of Relizy on the pull request |
| ---------- | -------------------------------------------------------------------- | -------------------------------------- |
| `update`   | Edits the previous comment of Relizy, or adds one when there is none | One, where it was first posted         |
| `append`   | Adds a new comment at each run                                       | One per run                            |
| `recreate` | Adds a new comment, then deletes the previous one                    | One, always at the bottom              |

Relizy finds its previous comment by a hidden marker (`<!-- relizy-pr-comment -->`). On a long pull request, GitHub and GitLab collapse the older comments: with `update`, the comment can end up hidden among them; `recreate` keeps it in sight, at the end of the conversation. When the new comment fails to post, the previous one stays.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  prComment: {
    mode: 'recreate',
  },
})
```

`--pr-comment-mode <mode>` overrides it for a run, on [`relizy release`](./../cli/release.md), [`relizy pr-comment`](./../cli/pr-comment.md) and [`relizy merge-preview`](./../cli/merge-preview.md).

The mode applies to the [merge preview](./../guide/merge-preview.md#the-comment) too, except `append`: the merge preview keeps a single comment, updated with `update` and `append`, recreated with `recreate`.
