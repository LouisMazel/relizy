---
title: Hooks
description: Run shell commands or functions before, after or on the failure of each step of a release, and rewrite the generated changelogs.
keywords: relizy hooks, lifecycle hooks, before hooks, success hooks, error hooks, generate:changelog, HookContext, release steps, commit-and-tag, social hooks
category: Configuration
tags: [config, hooks, lifecycle, automation, workflow]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  hooks: {
    'before:publish': 'pnpm test',
    'success:release': async (config, dryRun, context) => {
      if (!dryRun) {
        await notifyTeam(context?.release)
      }
    },
  },
})
```

## Hook Names

- **Type:** `HookConfig`, a key `<type>:<step>` for each step
- **Default:** none

| Type      | Runs                                    |
| --------- | --------------------------------------- |
| `before`  | before the step                         |
| `success` | after the step completes                |
| `error`   | when the step fails, before it rethrows |

| Step               | What it covers                  | Run by                                      |
| ------------------ | ------------------------------- | ------------------------------------------- |
| `bump`             | Version bump                    | `relizy bump`, `relizy release`             |
| `changelog`        | `CHANGELOG.md` files            | `relizy changelog`, `relizy release`        |
| `publish`          | Publication to the registry     | `relizy publish`, `relizy release`          |
| `commit-and-tag`   | Release commit and tags         | `relizy release`                            |
| `push`             | Push of the commit and the tags | `relizy release`                            |
| `provider-release` | GitHub or GitLab releases       | `relizy provider-release`, `relizy release` |
| `social`           | Every social post               | `relizy social`, `relizy release`           |
| `twitter`          | The tweet                       | `relizy social`, `relizy release`           |
| `slack`            | The Slack message               | `relizy social`, `relizy release`           |
| `teams`            | The Teams cards                 | `relizy social`, `relizy release`           |
| `release`          | The whole release               | `relizy release`                            |

The PR comment has no hooks. A step disabled by the config or a flag (`--no-publish`) runs none of its hooks.

## Parameters

A hook is a shell command (a `string`, run from `cwd`) or a function, sync or async:

```ts
(config: ResolvedRelizyConfig, dryRun: boolean, context?: HookContext) => any
```

- `config`: the resolved config, defaults included
- `dryRun`: `true` with `--dry-run`, where the hooks still run: check it before any side effect
- `context`: the release, when it is known: in `relizy release` once the bump is done, and in a command given a bump result. `before:release`, `before:bump` and `error:bump` never get it, nor the standalone `relizy changelog`, `publish`, `provider-release` and `social`.
  - `bumpResult` (`BumpResultTruthy`): the result of the bump
  - `release` (`ReleaseOverview`): the packages and versions of the release by version group; in the `twitter`, `slack` and `teams` hooks, what the post announces

```ts
export default defineConfig({
  hooks: {
    'success:release': (config, dryRun, context) => {
      for (const group of context?.release.groups ?? []) {
        console.log(group.title, group.version ?? group.packages.map(pkg => `${pkg.name}@${pkg.newVersion}`).join(', '))
      }
    },
  },
})
```

See the [`HookContext`](./../typedoc/interfaces/HookContext.md) and [`ReleaseOverview`](./../typedoc/interfaces/ReleaseOverview.md) types.

## generate:changelog

- **Type:** `(config, dryRun, { commits: GitCommit[], changelog: string }) => string | void | null | undefined | Promise<...>`

Rewrites a generated changelog: called once for the changelog of each package and for the root changelog (in `independent` mode, the root changelog gathers the rewritten changelogs of the packages, without a call of its own), as written in the `CHANGELOG.md` files (not for the provider releases nor the social posts). Return a string to replace `changelog`, or nothing to keep it. With version groups, `config` is the config of the group of the changelog. To rewrite the release notes and the posts with AI, see [AI](./ai.md).

```ts
export default defineConfig({
  hooks: {
    'generate:changelog': (config, dryRun, { commits, changelog }) => {
      return commits.length > 0 ? `${changelog}\n\nThanks to every contributor!` : undefined
    },
  },
})
```

## Order

`relizy bump`, `changelog`, `publish` and `provider-release` run `before:<step>`, then `success:<step>` or `error:<step>`; `relizy changelog` also runs `generate:changelog` for each changelog. `relizy publish` with nothing to publish runs neither `success:publish` nor `error:publish`.

`relizy social` runs:

1. `before:social`
2. `before:twitter`, then `success:twitter` or `error:twitter`, when Twitter is enabled and a version is posted (see `onlyStable` and `exclude`)
3. `before:slack`, then `success:slack` or `error:slack`, likewise for Slack (see `announcements` too)
4. `before:teams`, then `success:teams` or `error:teams`, likewise for Teams
5. `success:social`, or `error:social` when a post failed or the step itself failed (reading the release, a failing hook)

`relizy release` runs, for its enabled steps:

1. `before:release`
2. Bump: `before:bump`, `success:bump` or `error:bump`
3. Changelog: `before:changelog`, `generate:changelog`, `success:changelog` or `error:changelog`
4. Publish: `before:publish`, `success:publish` or `error:publish`
5. Commit and tag: `before:commit-and-tag`, `success:commit-and-tag` or `error:commit-and-tag`
6. Push: `before:push`, `success:push` or `error:push`
7. Provider release: `before:provider-release`, `success:provider-release` or `error:provider-release`
8. Social posts: the hooks of `relizy social`
9. PR comment (no hooks)
10. `success:release`, or `error:release` when the release failed

When nothing is released (no commit triggers a bump), `relizy release` stops after the bump: neither `success:release` nor `error:release` runs. A refused or cancelled prompt runs no `error:*` hook.

## Errors

A function hook that throws, or a command exiting with a non-zero code, fails its step: the `error:<step>` hook runs and the command stops (in `relizy release`, `error:release` runs too). A failed provider release or social post does not stop `relizy release`: its `error:provider-release` hook runs (or `error:twitter`, `error:slack` or `error:teams`, then `error:social`), the step is marked as failed in the summary, and the release ends with `success:release`. A failed PR comment only warns.

```ts
export default defineConfig({
  hooks: {
    'before:publish': 'pnpm test',
    'error:publish': (config, dryRun) => {
      console.error('Publish failed, the release files are restored')
    },
  },
})
```

## Version Groups

With [version groups](./../guide/version-groups.md), each hook runs once per command, with the global config: one bump, one publish, one post per platform for the whole release. Only `generate:changelog` receives the config of a group, where `monorepo.versionMode` and `monorepo.packages` are the ones of the group. Read the groups of the release from `context.release`.
