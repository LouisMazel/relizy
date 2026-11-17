---
title: sync
description: Merge the released branch into the branches of the rules of sync that match it and push them, or open a pull request into each one, without releasing.
keywords: relizy sync, sync branches, merge main into develop, back-merge, git flow, sync cli, pull request, merge request
category: CLI Reference
tags: [cli, sync, git-flow, branches]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy sync [options]
```

Does what the sync step of [`relizy release`](./release.md#steps) does after the push, alone: for each branch of the [rules](./../config/sync.md#rules) whose `from` matches the released branch, up to date, fast-forward, merge commit, or a pull request with `--sync-mode pull-request` (see [What Happens](./../guide/branch-sync.md#what-happens)). Use it to sync again once the access to a branch is fixed, or to sync in a job of its own. After a conflict, merge by hand: the sync would conflict again.

The released branch is the current branch, merged as it is on its remote. When no rule matches it and `--to` is not given, the command does nothing.

## Options

| Flag                 | Description                                                                                                   | Config                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `--to <branch...>`   | The branches to merge into, instead of the rules                                                              | [`sync.rules`](./../config/sync.md#rules) |
| `--from <branch>`    | The released branch, fetched from the remote, instead of the current branch                                   | -                                         |
| `--sync-mode <mode>` | `push` (merge and push) or `pull-request` (open a pull request into each branch), over the modes of the rules | [`sync.mode`](./../config/sync.md#mode)   |

The [global options](./commands.md#global-options) apply: `--dry-run` (fetches the branches and computes the merges, pushes and opens nothing), `--profile`, `--config`, `--log-level` and `--no-safety-check` (skips the check that the branches exist and can be pushed to, or that the token can open the pull requests).

## Exit Codes

| Code | When                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------- |
| `0`  | Each branch got the released branch (or its pull request), or already had it                         |
| `1`  | A branch did not: a conflict (with the commands to merge by hand), a refused push, a failed check... |

The other branches are synced before it fails. It runs the `before:sync`, `success:sync` and `error:sync` [hooks](./../config/hooks.md).

## Examples

```bash
# Merge the current branch into the branches of its rules
relizy sync

# Merge main into develop, from any branch, preview first
relizy sync --from main --to develop --dry-run
relizy sync --from main --to develop

# Open a pull request instead of pushing
relizy sync --to develop --sync-mode pull-request
```

## See Also

- [Branch Sync](./../guide/branch-sync.md)
- [Sync Configuration](./../config/sync.md)
- [`sync()`](./../api/sync.md)
