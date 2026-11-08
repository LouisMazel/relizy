---
title: merge-preview
description: In the pipeline of a pull request or a merge request, preview what its merge releases, with the options of the release job, and fail when the release of the merge would fail.
keywords: relizy merge-preview, merge preview cli, release preview, pull request preview, merge request preview, commit status, next version
category: CLI Reference
tags: [cli, merge-preview, pull-request, merge-request, github, gitlab, ci]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy merge-preview [options]
relizy merge-preview init [--yes]
```

It computes the release of the merge as `relizy release` will run it on the target branch, and writes nothing: no version, changelog, commit, tag, push, publish nor hook. In the pipeline of a pull request, it:

- comments the pull request with the versions, the tags and the dist-tag the merge releases, and what the pull request brings;
- sets the commit status `relizy/merge-preview`: `failure` when the release of the merge would fail (a version or a tag already taken, a squash commit that is not a Conventional Commit, the commitlint of the project);
- exits with an error when the release of the merge would fail.

Outside a pull request pipeline, it previews the next release of the current branch in the terminal. See [Merge Preview](./../guide/merge-preview.md).

`relizy merge-preview init` adds the merge preview workflow to the CI of the project, as [`relizy init --only merge-preview`](./init.md#only): `.github/workflows/merge-preview.yml` on GitHub. On GitLab it goes in `.gitlab-ci.yml`: written with the release job, else `init` prints the snippet to add (the include of its component on gitlab.com, its job written out on a self-managed instance or with the relizy CLI). `--yes` accepts the detected values without asking.

Give it the options of the release job that change the release: the preview of `relizy release --minor --tag next --config web --yes` is `relizy merge-preview --minor --tag next --config web`.

## Options

| Flag                                                     | Description                                                                                                      | Config                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `--major`, `--minor`, `--patch`                          | The bump type of the release job                                                                                 | [`bump.type`](./../config/bump.md#type)                               |
| `--prerelease`, `--premajor`, `--preminor`, `--prepatch` | The prerelease type of the release job, see [Prerelease Versions](./../guide/prereleases.md#prerelease-versions) | [`bump.type`](./../config/bump.md#type)                               |
| `--preid <id>`                                           | Prerelease identifier: `alpha`, `beta`, `rc`...                                                                  | [`bump.preid`](./../config/bump.md#preid)                             |
| `--suffix <suffix>`                                      | With a prerelease type, replace the last number: `1.0.0-beta.0` becomes `1.0.0-beta.<suffix>`                    | -                                                                     |
| `--force`                                                | Bump the packages even without a commit triggering a bump                                                        | -                                                                     |
| `--from <ref>`, `--to <ref>`                             | The commit range of the release job                                                                              | [`from`](./../config/overview.md#from-to)                             |
| `--no-publish`                                           | The release job does not publish: no dist-tag, no registry check                                                 | [`release.publish`](./../config/release.md)                           |
| `--no-commit`, `--no-git-tag`                            | The release job creates no tag: no tag check                                                                     | [`release.gitTag`](./../config/release.md)                            |
| `--tag <tag>`                                            | The dist-tag of the release job                                                                                  | [`publish.tag`](./../config/publish.md#tag)                           |
| `--registry <url>`                                       | The registry of the release job, checked for the versions already published                                      | [`publish.registry`](./../config/publish.md#registry)                 |
| `--private-packages <mode>`                              | `ignore` or `release` the private packages, as the release job                                                   | [`monorepo.privatePackages`](./../config/monorepo.md#privatepackages) |
| `--token <token>`                                        | GitHub or GitLab token, for the comment and the commit status                                                    | [`tokens`](./../config/overview.md#tokens)                            |
| `--publish-token <token>`                                | Registry token, for the versions already published                                                               | [`tokens.registry`](./../config/overview.md#tokens)                   |
| `--no-comment`                                           | Do not comment the pull request                                                                                  | [`mergePreview.comment`](./../config/merge-preview.md#comment)        |
| `--no-check`                                             | Do not set the commit status `relizy/merge-preview`                                                              | [`mergePreview.check`](./../config/merge-preview.md#check)            |
| `--report-json <file>`, `--report-markdown <file>`       | Write the report of the preview, or its markdown, to this file                                                   | [`release.report`](./../config/release.md#report)                     |

The [global options](./commands.md) apply: `--config`, `--group`, `--pr-number` (the pull request to comment, when relizy cannot find it), `--log-level`.

## Examples

```bash
# In the pipeline of a pull request
relizy merge-preview

# The preview of a beta release job
relizy merge-preview --prerelease --preid beta --tag beta

# Locally: the next release of the current branch, in the terminal
relizy merge-preview --no-comment --no-check
```

## See Also

- [Merge Preview](./../guide/merge-preview.md)
- [Merge Preview Configuration](./../config/merge-preview.md)
- [`mergePreview()`](./../api/merge-preview.md)
- [release](./release.md)
