---
title: Merge Preview Configuration
description: Options of the merge preview of a pull request or merge request (relizy merge-preview) - its comment, its commit status, the commitlint and the squash merges.
keywords: merge preview config, mergePreview, release preview, commit status, squash merge, commitlint, pull request
category: Configuration
tags: [config, merge-preview, pull-request, merge-request]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

How the merge is computed, what fails the check and how to set it up: [Merge Preview](./../guide/merge-preview.md). These options only apply to [`relizy merge-preview`](./../cli/merge-preview.md).

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  mergePreview: {
    comment: true,
    check: true,
    commitlint: 'auto',
    squash: 'auto',
  },
})
```

## comment

- **Type:** `boolean`
- **Default:** `true`

Comment the pull request with what its merge releases, updated in place at each run (`<!-- relizy-merge-preview -->` marker). `--no-comment` turns it off for a run.

## check

- **Type:** `boolean`
- **Default:** `true`

Set the commit status `relizy/merge-preview` on the last commit of the pull request: `success` with the released versions, `failure` when the release of the merge would fail. Require it in the protection of the branch to block such a merge. `--no-check` turns it off for a run.

## commitlint

- **Type:** `'auto' | boolean`
- **Default:** `'auto'`

Lint the commits of the pull request, and the commit of its squash merge, with [`relizy commitlint`](./../commitlint/index.md): an error fails the check. `auto` lints when the project uses it: a `commitlint` option in its config, or a commit-msg hook running `relizy commitlint`.

## squash

- **Type:** `'auto' | boolean`
- **Default:** `'auto'`

Whether the merge squashes the commits of the pull request into one commit, whose message decides the bump. `auto` asks GitHub (auto-merge, merge methods of the repository) or GitLab (squash option of the project and of the merge request), and computes both when only the merge will tell. `true` always squashes, `false` never. The problems of the squash commit fail the check only when the merge squashes for sure (`true`, or detected), they are warnings when the merge method is left open.
