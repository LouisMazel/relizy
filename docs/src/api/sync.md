---
title: sync()
description: Merge the released branch into the branches of its rules of sync from code, and know what was done to each branch.
keywords: relizy sync api, sync, SyncOptions, SyncResult, SyncError, branch sync api, merge main into develop
category: API Reference
tags: [api, sync, git-flow, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Signature

```ts
function sync(options?: SyncOptions): Promise<SyncResult>
```

Options: [`SyncOptions`](./../typedoc/interfaces/SyncOptions.md). Result: [`SyncResult`](./../typedoc/interfaces/SyncResult.md), one [`SyncBranchResult`](./../typedoc/interfaces/SyncBranchResult.md) per branch.

## Behavior

- Does what [`relizy sync`](./../cli/sync.md) does: the branches of the [rules](./../config/sync.md#rules) whose `from` matches the released branch; `branches`, `mode` and `from` are its `--to`, `--sync-mode` and `--from`.
- Resolves with what was done to each branch, and with which `mode`: `merged`, `fast-forward`, `up-to-date` or `pull-request` (with its `number` and `url`, `existing` when it was already open). When no rule matches and `branches` is not given, `branches` is empty.
- Rejects with a [`SyncError`](./../typedoc/classes/SyncError.md) when a branch did not get the release (`conflict`, with its `conflicts` and the commands in `reason`, or `failed`), after the other branches are synced: its `result` holds every branch.
- `dryRun` fetches the branches and computes the merges: nothing is pushed nor opened.
- In `release()`, the same sync runs after the push, and a branch that does not get the release never rejects it: see `sync` in the [`ReleaseReport`](./../typedoc/interfaces/ReleaseReport.md).

## Example

```ts
import { sync, SyncError } from 'relizy'

try {
  const result = await sync({ branches: ['develop'] })
  console.log(result.branches.map(branch => `${branch.branch}: ${branch.status}`))
}
catch (error) {
  if (error instanceof SyncError) {
    console.error(error.result.branches.filter(branch => branch.status === 'conflict'))
  }
  throw error
}
```

## See Also

- [Branch Sync](./../guide/branch-sync.md)
- [`relizy sync`](./../cli/sync.md)
- [API usage](./usage.md)
