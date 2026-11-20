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
    check: 'auto',
    commitlint: 'auto',
    squash: 'auto',
  },
})
```

## comment

- **Type:** `boolean`
- **Default:** `true`

Comment the pull request with what its merge releases, updated in place at each run (`<!-- relizy-merge-preview -->` marker), or posted again at the bottom with [`prComment.mode: 'recreate'`](./pr-comment.md#mode). `--no-comment` turns it off for a run.

## check

- **Type:** `'auto' | boolean`
- **Default:** `false`

Set the commit status `relizy/merge-preview` on the last commit of the pull request: `success` with the released versions, `failure` when the release of the merge would fail. Off by default: the job of the merge preview already fails when the release of the merge would fail, require the job in the protection of the branch to block such a merge. The status gives a name that does not change with the workflow, and the released versions in the list of the checks. `auto` sets it on GitHub only: on GitLab, a commit status would show up as an external stage failing the pipeline a second time. `true` sets it on GitLab too. `--check` and `--no-check` override it for a run.

## commitlint

- **Type:** `'auto' | boolean`
- **Default:** `false`

Lint the commits of the pull request, and the commit of its squash merge, with [`relizy commitlint`](./../commitlint/index.md). The commits failing it are warnings, in their own section of the comment: they never fail the check, `relizy release` does not lint the commits, and the history is often too late to reword when the preview runs (see [Commits Not Following the Commit Convention](./../guide/merge-preview.md#commits-not-following-the-commit-convention)). Off by default: run [`relizy commitlint`](./../commitlint/index.md#lint-the-commits-of-a-pull-request) in its own job to fail on them. `true` turns it on, `auto` lints when the project uses it: a `commitlint` option in its config, or a commit-msg hook running `relizy commitlint`. `--commitlint` and `--no-commitlint` override it for a run.

## squash

- **Type:** `'auto' | boolean`
- **Default:** `'auto'`

Whether the merge squashes the commits of the pull request into one commit, whose message decides the bump. `auto` asks GitHub (auto-merge, merge methods of the repository) or GitLab (squash option of the project and of the merge request), and computes both when only the merge will tell. `true` always squashes, `false` never. A squash title that is not a Conventional Commit fails the check only when the merge squashes for sure (`true`, or detected), it is a warning when the merge method is left open. [`commitlint.title: 'auto'`](./../commitlint/config.md#title) reads the merge method the same way, to lint the title and the commits of the pull request.
