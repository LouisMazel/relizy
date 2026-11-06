---
title: Moving & Renaming Packages
description: How Relizy keeps the commits made before a package directory was moved or renamed (moves detected from git, monorepo.movedPackages for the others), and how to keep their scopes valid.
metaDescription: 'How Relizy keeps the commits made before a package directory was moved or renamed, detected from git or set in monorepo.movedPackages.'
keywords: relizy move package, rename package directory, git mv monorepo, lost commits changelog, movedPackages, package history, scopeMap, renamed package.json
category: Guide
tags: [guide, monorepo, git, changelog, bump]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## The problem

Relizy gives a commit to a package when it changes a file of the package
directory, as it was **when the commit was made**. Moving a package
(`packages/components` → `packages/ui`) without care would split its history:

- the commits made before the move changed `packages/components`, not
  `packages/ui`, so the next release of the package would only see the commit of
  the move;
- its changelog would lose these commits, and its bump would ignore them (a
  breaking change made before the move would no longer give a major).

## Moves detected from the history

Relizy reads the moves from the commits of the release: a `package.json`
renamed by git (`R100 packages/components/package.json → packages/ui/package.json`
in `git log --name-status`) moves the directory of its package. The commits
that changed the old directory then belong to the package, whenever they were
made: before the move, or on a branch created before it and merged after.

```bash
git mv packages/components packages/ui
git commit -m "chore(ui): move packages/components to packages/ui"
```

- **Chains** are followed: `packages/components` → `packages/ui` → `packages/design-system`.
- **A file moved alone** from a package to another does not move the history of
  its old package: only a renamed `package.json` does.
- **An inexact rename** (a `package.json` edited in the commit of the move) is a
  move only when the package keeps its `name`: git can pair the `package.json`
  of a package removed with the one of a package added in the same commit, as
  they look alike.
- **A directory reused** by another package (a new `package.json` in the old
  directory) keeps its commits: they belong to this other package.
- **Ignored packages** (`monorepo.ignored`, the packages of the other
  [version groups](./version-groups.md)) are followed too, so the commits of
  their old directories stay out of the root version and changelog.
- **New packages** (without tag) start from the first commit of their old
  directory, found by following their `package.json` (`git log --follow`).

### When git does not see the rename

Git detects a renamed file when its content stays similar enough. It can miss
the `package.json` of a move when:

- the `package.json` is rewritten in the commit of the move (its similarity
  drops below 50%), or the package is renamed in the same commit (its `name`
  changes);
- the commit moves more files than the rename detection of git handles
  (`diff.renameLimit`, 1000 by default): the files moved without change are
  still detected, the edited ones may not be.

Keep the move in its own commit, without editing the `package.json`, and move
one package per commit in a large monorepo. Check the result with
[`relizy bump --dry-run`](./../cli/bump.md) (or the `preview_release` tool of the
[MCP server](./ai-agents.md)): the commits made before the move must still be
listed for the package.

## Declaring a move

For the moves git does not see, declare them with
[`monorepo.movedPackages`](./../config/monorepo.md#movedpackages), as
`old path: new path`:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*'],
    movedPackages: {
      'packages/components': 'packages/ui',
      'shared-components/navigation': 'packages/navigation',
    },
  },
})
```

The declared moves are applied as is, without checking the history. They can be
removed once a release includes the move: the next releases start from a tag
made after it.

## Scopes of the commits

The scope of a commit is often the directory name of its package
(`fix(components): ...`). After a move, the commits made before it keep their
old scope:

- [`relizy commitlint`](./../commitlint/index.md) rejects it, as it is no longer
  the name of a package;
- the changelog shows the package under two names (`components` and `ui`).

Rename the old scopes with the [`scopeMap`](./../config/overview.md) option of the
config: its keys are allowed scopes, and the changelog shows the commits under
the new name.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  scopeMap: {
    components: 'ui',
  },
})
```

Remove the entries once a release includes the move, so that the new commits
use the new scope.

Linting the whole range since the last tag may also warn on the commits made
before the move (`scope-matches-files`): their files are outside the current
directory of their package. It is only a warning, and these commits leave the
range once the move is released.
