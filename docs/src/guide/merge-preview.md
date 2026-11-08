---
title: Merge Preview
description: Before merging a pull request or a merge request, see what its merge releases - versions, tags, dist-tag, what the pull request brings - and fail the check when the release of the merge would fail.
keywords: merge preview, release preview, pull request preview, merge request preview, next version, what will be released, release check, commit status, squash merge, relizy merge preview
category: Guide
tags: [guide, merge-preview, pull-request, merge-request, github, gitlab, ci]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## How It Works

[`relizy merge-preview`](./../cli/merge-preview.md) runs in the pipeline of a pull request (GitHub) or a merge request (GitLab), with the options of the job that releases after the merge. It computes the release of the merge, as `relizy release` will run it on the target branch, and writes nothing: no version, no changelog, no commit, no tag, no push, no publish, no hook.

It then:

- comments the pull request with what the merge releases, updated at each push (see [The Comment](#the-comment));
- sets the commit status `relizy/merge-preview` on the last commit of the pull request: green with the versions, red when the release of the merge would fail (see [What Fails the Check](#what-fails-the-check));
- prints the same preview in the terminal and in the summary of the CI job;
- exits with an error when the release of the merge would fail.

Relizy does not guess which pipeline releases: the CI says it, by running the preview with the release type and the options of its release job. A preview of the release job `relizy release --minor --config web --yes` is `relizy merge-preview --minor --config web`.

## Set It Up

`relizy init` offers the merge preview (yes by default, and with `--yes`). In a project already set up, `relizy merge-preview init` only adds its workflow.

### GitHub Actions

The [relizy action](./github-actions.md) with `merge-preview: true`, on the pull requests into the branch that releases:

```yaml
name: Merge preview

on:
  pull_request:
    branches: [main]
    # edited: a new title (the commit of a squash merge) or a new base
    types: [opened, synchronize, reopened, edited]

concurrency:
  group: merge-preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  merge-preview:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
      statuses: write
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: relizy/action@v2
        with:
          merge-preview: true
          # The release-type of the release job, and its options that change the release, e.g.:
          # args: --config web
```

The default checkout of a pull request is its merge commit with the target branch: the preview is computed on it.

### GitLab CI

The `merge-preview` component of the [CI/CD catalog](./gitlab-ci.md), next to the `release` one. It runs in the merge request pipelines into the default branch:

```yaml
include:
  - component: gitlab.com/relizy/relizy/release@2
  - component: gitlab.com/relizy/relizy/merge-preview@2
    inputs:
      # The release-type of the release job, and its options that change the release, e.g.:
      args: --config web
```

The comment and the commit status need `GITLAB_TOKEN` (an access token with the `api` scope): the `CI_JOB_TOKEN` of the job can do neither. When the merge request is behind its target branch (a pipeline that is not a merged results one), the target branch is merged into the clone of the job before the preview.

### Any CI

Run `relizy merge-preview`, with the options of the release job, in the pipeline of the pull request. Relizy reads the pull request from the variables of GitHub Actions (`GITHUB_BASE_REF`, the event of the run) and GitLab CI (`CI_MERGE_REQUEST_*`). Elsewhere, and on a local run, it previews the next release of the current branch in the terminal, without comment nor commit status:

```bash
relizy merge-preview
```

## How the Merge Is Computed

The preview is the real release of the merge: the commits of the target branch not released yet, plus the ones of the pull request. Each released package tells what the pull request brings to it (⭐) and what comes from the target branch.

A **squash merge** turns the commits of the pull request into one commit, whose message decides the bump: a pull request of `fix:` commits titled `feat!: new API` releases a major. [`mergePreview.squash`](./../config/merge-preview.md#squash) tells whether the merge squashes. By default (`auto`), Relizy asks the provider:

- **GitHub**: the method of the auto-merge when it is enabled, else the merge methods allowed by the repository (only squash, or no squash). The commit follows the settings of the repository: its title is the title of the pull request, or the message of its only commit (`COMMIT_OR_PR_TITLE`, the default), and its body holds the messages of the commits (`COMMIT_MESSAGES`, the default: a `BREAKING CHANGE:` of a commit stays one), the description or nothing;
- **GitLab**: the squash option of the project, else the one of the merge request. The commit is the title of the merge request.

When only the merge will tell (several methods allowed), the preview computes both, and shows both when they release different versions.

## What Fails the Check

The check fails, and the job exits with an error, only when the release of the merge would fail, or release a broken result. A major bump or a merge that releases nothing are normal outcomes: they never fail it.

- **A version already published**: the new version of a package is already on its registry, the publish would fail. The registry is checked with the token of the job; when it cannot tell (a private registry without token), the preview only warns.
- **A tag already taken**: a tag of the release already exists on the remote, the push would fail.
- **A squash commit that is not a Conventional Commit**: the release would ignore the changes of the pull request. Write its title as `type(scope): subject`.
- **The commitlint of the project**: the commits of the pull request (and the squash commit) are linted with [`relizy commitlint`](./../commitlint/index.md) when [`mergePreview.commitlint`](./../config/merge-preview.md#commitlint) is `true`, or `auto` and the project uses it: a `commitlint` option in its config, or a commit-msg hook running `relizy commitlint` (husky, lefthook, simple-git-hooks, the hooks of git).
- **An error**: an invalid config, or a bump that cannot be computed.

The problems of the squash commit (its title, its commitlint) fail the check only when the merge squashes for sure: the repository only allows squash merges, or the auto-merge squashes. When the merge method is left open, they are warnings of the comment: a merge commit or a rebase does not have them. A project that never squashes sets [`mergePreview.squash`](./../config/merge-preview.md#squash) to `false`, or turns the squash merges off in the settings of the repository.

To block the merge of a pull request whose release would fail, require the status `relizy/merge-preview` in the protection of the branch (GitHub: Settings > Branches, GitLab: Settings > Merge requests > Status checks).

## The Comment

The comment has its own hidden marker, `<!-- relizy-merge-preview -->`: it is updated in place at each run, apart from the comments of the [releases of the pull request](./pr-comment.md) (canary, prerelease). After the merge, the release of the merge rewrites it with what was released: the prediction becomes the result.

```markdown
### 🔮 If you merge this pull request

relizy releases **2 packages** from `main`, published with the dist-tag `latest`:

**maz-ui** `5.2.0` → `5.3.0` (tag `v5.3.0`)

| Package     | Version           | Why               |
| ----------- | ----------------- | ----------------- |
| maz-ui      | `5.2.0` → `5.3.0` | feat (this PR) ⭐ |
| @maz-ui/mcp | `5.2.0` → `5.3.0` | fix (on `main`)   |

<sub>Computed on `main@abc1234` + this pull request `@def5678` · commits kept: the repository does not allow squash merges · by relizy</sub>
```

The footer tells the commit of the target branch the preview was computed on: the preview runs at each push of the pull request, not when the target branch moves on. The release of the merge always computes the versions again.

## Tokens and Permissions

The comment and the commit status use the token of the provider releases (`tokens.github` or `tokens.gitlab`, see [Tokens](./../config/overview.md#tokens)):

- **GitHub**: the `GITHUB_TOKEN` of the job, with `pull-requests: write` and `issues: write` (the comment) and `statuses: write` (the status). The pull requests opened from a fork get a read-only token: the preview is printed in the summary of the job, without comment nor status.
- **GitLab**: a project or personal access token with the `api` scope, in `GITLAB_TOKEN`.
- **Registry**: none for public packages on npmjs.com, checked without token. Restricted packages and private registries need the registry token (`NPM_TOKEN`) to tell whether a version is published; `relizy init` adds it then. Without it, the preview only warns.

`--no-comment` and `--no-check` (or [`mergePreview.comment`](./../config/merge-preview.md#comment) and [`mergePreview.check`](./../config/merge-preview.md#check)) turn one of them off.

## Limits

- There is no preview of a canary: it publishes right away, from the commit of the pull request.
- A project whose relizy does not know `merge-preview` fails with an unknown command: update relizy.
