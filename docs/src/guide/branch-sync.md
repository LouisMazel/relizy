---
title: Branch Sync
description: After a release from main, merge it into develop (or any other branch) automatically, with a push or a pull request, instead of a CI job of your own.
keywords: branch sync, sync develop, merge main into develop, git flow, gitflow, back-merge, release branch, sync.rules, relizy sync, pull request, merge request
category: Guide
tags: [guide, sync, git-flow, branches, ci]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Why

With a git flow (`develop` for the work, `main` for the releases), the release commit and its tags are only on `main`. Until `main` is merged back into `develop`:

- the next merge request `develop` → `main` conflicts on the `package.json` and `CHANGELOG.md` files;
- the prereleases of `develop` are computed from the previous stable version.

`sync.rules` makes relizy do this back-merge itself, right after the release.

## Set It Up

A rule says which branch is merged into which ones:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  sync: {
    rules: [{ from: 'main', to: ['develop'] }],
  },
})
```

A release from `main` then merges `main` into `develop`. The releases of the other branches sync nothing: a beta from `develop` or a canary from a feature branch is not merged anywhere. `from` takes a glob too, for release branches:

```ts
export default defineConfig({
  sync: {
    rules: [
      { from: 'main', to: ['develop'] },
      // release/1.x, release/2.x...: back into main and develop, with pull requests
      { from: 'release/*', to: ['main', 'develop'], mode: 'pull-request' },
    ],
  },
})
```

For one run, `--sync develop` merges into the given branches whatever the rules, `--no-sync` skips the sync. All the options: [Sync Configuration](./../config/sync.md).

## What Happens

The sync is a step of `relizy release`, right after the push of the release commit, before the provider release and the social posts (see [the steps](./../cli/release.md#steps)). It runs only when the release commit is pushed: never with `--no-commit`, `--no-push` or `--canary`.

For each branch, relizy fetches it, then:

| The branch                 | relizy                                                                                               | Status         |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | -------------- |
| already has the release    | pushes nothing                                                                                       | `up-to-date`   |
| has no commit of its own   | moves it to the release commit                                                                       | `fast-forward` |
| has its own commits        | pushes a merge commit, <code v-pre>chore(release): sync {{target}} with {{source}}</code> by default | `merged`       |
| conflicts with the release | pushes nothing, and tells how to merge by hand                                                       | `conflict`     |

The merge is computed in memory (`git merge-tree`): no checkout, no git hook, the working directory of the job is left as it is. It needs **git 2.38** or later. If the branch receives commits during the sync, the merge is computed again (3 attempts).

A branch that does not get the release (a conflict, a refused push) **does not fail the release**, which is already published: the step is marked as failed in the summary, the warning gives the commands, and the release ends with code `0`. The [report](./../config/release.md#report) tells it: `synced_branches` lists the branches that got the release (or their pull request), `failed_steps` contains `sync`.

```bash
# The commands of a conflict on develop
git fetch origin
git switch develop
git merge origin/main
git push origin develop
```

## Pull Request Mode

When `develop` is protected and the release cannot push to it, open a pull request instead (a merge request on GitLab):

```ts
export default defineConfig({
  sync: {
    rules: [{ from: 'main', to: ['develop'], mode: 'pull-request' }],
  },
})
```

relizy opens one pull request from `main` into `develop` per release, or reuses the one already open. When the merge conflicts, the pull request still opens and says on which files: resolve them in it. Merge it with a **merge commit**, not a squash: a squash merge would leave the release commit and its tags out of `develop`.

## Access

The [safety checks](./../cli/release.md#steps) check the sync before anything is written: each branch exists on the remote, and the release can push to it (`push`) or has a token to open the pull requests (`pull-request`). The rules of a protected branch are only checked by the real push.

| Mode           | GitHub Actions                                                                                           | GitLab CI                                                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `push`         | `permissions: contents: write`, and a branch protection of `develop` that lets the token push            | The job token cannot push by default: a `GITLAB_TOKEN` (or `RELIZY_GITLAB_TOKEN`) with the `write_repository` scope and a role allowed to push to `develop`. relizy pushes with it, without changing the remote |
| `pull-request` | `permissions: pull-requests: write` (and "Allow GitHub Actions to create pull requests" in the settings) | A `GITLAB_TOKEN` with the `api` scope: the job token cannot open merge requests                                                                                                                                 |

The push to `develop` can start a pipeline. On GitLab CI, the merge commit and the release commit both start with `chore(release):`, so the rule that already keeps the release commit from releasing again covers it:

```yaml
rules:
  - if: '$CI_COMMIT_BRANCH == "develop" && $CI_COMMIT_MESSAGE !~ /^chore\(release\): /'
```

On GitHub Actions, a push made with the `GITHUB_TOKEN` starts no workflow.

## Preview and Run It Alone

- `relizy release --dry-run` computes the merges without pushing, with the release commit it would create: a branch that already has the released branch shows `fast-forward` or `merged`, as in the real release. A conflict with the commits of the branch shows up before the release, not one on the files the release writes (`CHANGELOG.md`, `package.json`): the dry run does not write them.
- [`relizy sync`](./../cli/sync.md) syncs the branches without releasing, e.g. after the access to a branch is fixed, or in a job of its own: `relizy sync --to develop`. It fails (code `1`) when a branch does not get the release.

## Replace Your Own Job

The usual job of a GitLab pipeline, run after the release job:

```yaml
sync-develop:
  needs: [{job: release, artifacts: true}]
  script:
    - if [ "$RELIZY_RELEASED" != "true" ]; then exit 0; fi
    - git fetch origin main develop
    - git checkout -B develop origin/develop
    - git merge origin/main --no-edit
    - git push origin develop
```

becomes one rule, `sync: { rules: [{ from: 'main', to: ['develop'] }] }`, with the checks before the release, the push through the GitLab token when the job token cannot push, and a release that is not failed by a conflict.

## See Also

- [Sync Configuration](./../config/sync.md)
- [`relizy sync`](./../cli/sync.md)
- [GitLab CI](./gitlab-ci.md), [GitHub Actions](./github-actions.md)
