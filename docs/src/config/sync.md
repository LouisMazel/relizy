---
title: Sync Configuration
description: Options of the branch sync - the rules that merge the released branch into other branches after the release (main into develop), with a push or a pull request, and the message of the merge.
keywords: sync config, sync.rules, sync.mode, sync.message, branch sync, merge main into develop, git flow, glob, pull request, merge request
category: Configuration
tags: [config, sync, git-flow, branches]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

How the sync works, what it needs and what to do on a conflict: [Branch Sync](./../guide/branch-sync.md). `relizy release` syncs the branches after the push when [`release.sync`](./release.md#steps) is `true` (the default) and a rule matches the released branch; [`relizy sync`](./../cli/sync.md) syncs them alone.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  sync: {
    rules: [
      { from: 'main', to: ['develop'] },
      { from: 'release/*', to: ['main', 'develop'], mode: 'pull-request' },
    ],
    mode: 'push',
    message: 'chore(release): sync {{target}} with {{source}}',
  },
})
```

## rules

- **Type:** `{ from: string, to: string[], mode?: 'push' | 'pull-request', message?: string }[]`
- **Default:** `[]`
- **CLI:** `--sync <branch...>` (`relizy release`), `--to <branch...>` (`relizy sync`), instead of the rules for one run

Which branch is merged into which ones. After a release, relizy takes the rules whose `from` matches the released branch (the current branch, as it is pushed) and merges it into the branches of their `to`. A release of a branch that no rule matches syncs nothing: the betas of `develop` or the canaries of a feature branch are not merged anywhere.

| Field     | Description                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| `from`    | The released branch: a name (`main`) or a glob (`release/*`; `*` stops at `/`, `**` does not: `hotfix/**`) |
| `to`      | The branches to merge it into. The released branch itself is left out                                      |
| `mode`    | The [`mode`](#mode) for these branches, `sync.mode` by default                                             |
| `message` | The [`message`](#message) for these branches, `sync.message` by default                                    |

A branch listed by several matching rules is synced once, with the first rule. The branches of the matching rules must exist on the remote: the [safety checks](./../cli/release.md#steps) fail before the release otherwise.

## mode

- **Type:** `'push' | 'pull-request'`
- **Default:** `'push'`
- **CLI:** `--sync-mode <mode>`, for every branch of the run

The mode of the rules that do not set one.

- `push`: merge the released branch into the branch and push it, a fast-forward when the branch has no commit of its own. Nothing is pushed on a conflict.
- `pull-request`: open a pull request (a merge request on GitLab) from the released branch into the branch, or reuse the open one. For the protected branches the release cannot push to. It needs a GitHub or GitLab token, see [Access](./../guide/branch-sync.md#access).

## message

- **Type:** `string`
- **Default:** <code v-pre>'chore(release): sync {{target}} with {{source}}'</code>

The message of the rules that do not set one: the message of the merge commit (`push`, not used by a fast-forward), the title of the pull request (`pull-request`). Variables: <code v-pre>{{source}}</code> (the released branch), <code v-pre>{{target}}</code> (the branch merged into), <code v-pre>{{tags}}</code> (the tags of the release, comma-separated). Starting with `chore(release):` keeps it out of the changelogs and lets the CI rules that skip the release commit skip it too.
