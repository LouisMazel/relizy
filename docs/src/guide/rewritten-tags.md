---
title: Rewritten Tags & Rebases
description: Why rebasing a branch after a release orphans its tags, how it breaks changelogs, and how Relizy detects and recovers from it.
keywords: relizy rebase, orphaned tag, rewritten tag, changelog wrong range, git tag rebase, detectRewrittenTags
category: Guide
tags: [guide, git, tags, rebase, changelog, troubleshooting]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## The symptom

Between two releases (for example two betas), the changelog suddenly lists the
**entire history since the last stable release**, often with **duplicated
commits**, and **every package gets bumped** even though only one or two
actually changed. The compare link in the changelog header looks correct, but
the commit list does not.

## The cause: an orphaned tag

When Relizy releases a version, it creates a commit (`chore(release): bump
version to X`) and a tag pointing exactly to that commit, then pushes both.

If the branch is **rebased afterwards**, git rewrites every commit on it,
including that release commit, giving it a **new SHA**. The tag still points to
the **old** commit, which is no longer part of the branch history. The tag is
now _orphaned_.

```
Before rebase:   ...─ A ─ B(bump 1.1.0) ←── tag v1.1.0
After  rebase:   ...─ A'─ B'(bump 1.1.0)   ← branch HEAD (new SHA)
                       └ B (bump 1.1.0)  ←── tag v1.1.0 still here (orphaned)
```

To build a changelog, Relizy (via changelogen) runs `git log "v1.1.0...HEAD"`.
With an orphaned `v1.1.0`, that range is the **symmetric difference** between
two divergent lines, so it walks all the way back to their common ancestor
(near the last stable tag) and returns both the old and the rebased commits,
hence the bloat and the duplicates.

## Why it keeps happening

Every cycle that rebases a branch carrying tagged release commits orphans those
tags. The most common trigger is rebasing a long-lived branch (`develop`,
`main`) - for example rebasing `develop` onto `main` after a stable release
replays every previously-tagged beta commit with new SHAs.

## The fix: never rebase tagged/pushed commits

A pushed or tagged commit is **published history** and must be treated as
immutable.

- ✅ **Feature branches**: rebase them onto `develop` freely, before merging.
  Only the feature's own (unpushed, untagged) commits are rewritten.
- ✅ **Integrate into `develop`** via merge or fast-forward, not by rebasing
  `develop` itself.
- ✅ **`develop` ↔ `main`**: integrate with `git merge`, never `git rebase`.
  Merging keeps every existing SHA, so tags stay valid.
- ❌ **Never rebase `develop` or `main`** - they carry tagged release commits.

## How Relizy recovers

Relizy detects when the resolved `from` tag is no longer reachable from `to`.
Instead of silently producing a wrong changelog, it explains the situation and
recovers safely. **No commit is ever rewritten** - the only possible mutation is
moving a tag.

When a `git rebase` is detected, Relizy locates the _equivalent_ commit (the
release commit with the same message that is actually reachable from the current
branch) and:

- **Interactively** (TTY, no `--yes`): prompts you to choose between
  - using the equivalent commit for this run only (recommended, non-destructive),
  - re-binding the tag onto the equivalent commit locally,
  - re-binding **and** force-pushing the corrected tag (asks again before pushing),
  - keeping the orphaned tag, or
  - aborting.
- **Non-interactively** (`--yes` / CI / no TTY): uses the equivalent commit for
  this run only and logs a warning. Idempotent, and the tag is left untouched.

### Configuration

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  // Enabled by default. Set to false to opt out entirely.
  detectRewrittenTags: true,

  // Force a strategy instead of the auto behavior (prompt on TTY, ephemeral on CI):
  //   'prompt'    → interactive selection
  //   'ephemeral' → use the reachable equivalent commit for this run only
  //   'rebind'    → move the local tag onto the equivalent commit (no push)
  //   'error'     → stop the release with an explanation
  onRewrittenTag: 'ephemeral',
})
```

| Option                | Type      | Default | Description                                                                    |
| --------------------- | --------- | ------- | ------------------------------------------------------------------------------ |
| `detectRewrittenTags` | `boolean` | `true`  | Detect an unreachable `from` tag and recover instead of failing silently.      |
| `onRewrittenTag`      | `string`  | auto    | `prompt` \| `ephemeral` \| `rebind` \| `error`. Auto = `prompt` / `ephemeral`. |

## Repairing already-orphaned tags

The ephemeral correction fixes the current run without touching anything. To fix
a tag permanently, point it at its equivalent commit and force-push it:

```bash
# Find the equivalent commit (the bump commit that IS on your branch)
git log --grep="bump version to 1.1.0" --format=%H -n 1

# Re-bind the tag and publish the correction
git tag -f v1.1.0 <equivalent-commit-sha>
git push origin v1.1.0 --force
```

Force-pushing a tag rewrites already-published history; only do it on
repositories where that is acceptable.
