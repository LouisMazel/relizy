---
title: Rewritten Tags & Rebases
description: Why rebasing a branch after a release orphans its tags and breaks the changelogs, how Relizy detects it and recovers (detectRewrittenTags, onRewrittenTag), and how to repair the tags.
metaDescription: 'Why rebasing a branch after a release orphans its tags and breaks the changelogs, and how Relizy detects it, recovers and repairs the tags.'
keywords: relizy rebase, orphaned tag, rewritten tag, changelog wrong range, duplicated commits, git tag rebase, detectRewrittenTags, onRewrittenTag, rejected push
category: Guide
tags: [guide, git, tags, rebase, changelog, troubleshooting]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## The Symptom

Between two releases (two betas, for example), the changelog suddenly lists the whole history since the last stable release, often with duplicated commits, and every package is bumped although only one or two changed.

## The Cause: an Orphaned Tag

A release tags its release commit. When the branch is rebased afterwards, git rewrites that commit with a new SHA, and the tag still points to the old one, which is no longer in the history of the branch:

```text
Before the rebase:  A ─ B (bump 1.1.0)  ← tag v1.1.0
After the rebase:   A'─ B'(bump 1.1.0)  ← branch
                    B (bump 1.1.0)       ← tag v1.1.0, orphaned
```

The range `v1.1.0...HEAD` then spans both lines down to their common ancestor, with the old and the rebased commits. The usual trigger is rebasing a long-lived branch carrying release commits, such as `develop` onto `main` after a stable release.

Never rebase a branch whose commits are tagged or pushed: rebase the feature branches before merging them, and integrate `develop` and `main` with `git merge`.

## Detection and Recovery

Before using a tag as the start of a range, Relizy checks that it is reachable from the end of the range, an explicit `--from` included. When it is not, Relizy explains the situation and looks for the equivalent commit: the reachable commit with the same subject (the rebased release commit). No commit is ever rewritten: the only possible change is moving a tag.

| Option                | Type                                             | Default                                                              | Description                                                        |
| --------------------- | ------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `detectRewrittenTags` | `boolean`                                        | `true`                                                               | Check that the `from` tag is reachable. `false` uses the tag as is |
| `onRewrittenTag`      | `'prompt' \| 'ephemeral' \| 'rebind' \| 'error'` | `prompt` in a terminal, `ephemeral` with `--yes` or without TTY (CI) | What to do with an orphaned tag                                    |

- `prompt`: asks what to do (see below). Without a TTY, it behaves as `ephemeral`.
- `ephemeral`: uses the equivalent commit for this run only, and leaves the tag untouched (a warning tells it). The safe default in CI.
- `rebind`: moves the local tag onto the equivalent commit, without pushing it.
- `error`: stops the release with the explanation.

The prompt offers to use the equivalent commit for this run only (the default choice), to re-bind the tag locally, to re-bind it **and** force-push it (asked again before pushing), to keep the orphaned tag, or to abort. When no equivalent commit is found, the prompt only offers to keep the tag or to abort, and the other strategies keep the tag with a warning, except `error`.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  onRewrittenTag: 'error',
})
```

## Repairing a Tag

The `ephemeral` strategy fixes the current run only. To fix the tag for good, point it at the equivalent commit and push it:

```bash
# The release commit that is on the branch
git log --grep="bump version to 1.1.0" --format=%H -n 1

git tag -f v1.1.0 <equivalent-commit-sha>
git push origin v1.1.0 --force
```

Force-pushing a tag rewrites published history: only do it where that is acceptable.

## Tags Orphaned by a Rejected Push

A tag can also be orphaned without rebase: the release publishes its packages and pushes its tag, but the push of the branch is rejected because new commits landed on it. The release commit then only exists behind the tag, and the next release computes the same version again.

Relizy prevents it (see [Branch Safety](./../cli/release.md#branch-safety)) and stops a release whose tag already exists. If it still happens, there is no equivalent commit to re-bind the tag to: merge the release commit back instead.

```bash
git fetch --tags
git merge v1.1.0
git push
```

The branch gets the bumped versions and changelogs, and the tag is part of its history again.
