---
title: release
description: Run the whole release in one command - bump, changelog, publish, commit, tag, push, provider release, social posts and PR comment.
keywords: relizy release, release workflow, release steps, npm publish, git tag, changelog, github release, gitlab release, canary
category: CLI Reference
tags: [cli, release, workflow, publish, steps]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy release [options]
```

Without a type flag, the bump of each package is computed from its commits (see [SemVer Convention](./../guide/semver-convention.md)). The [global options](./commands.md#global-options) apply too (`--dry-run`, `--group`, `--pr-number`, `--no-safety-check`...).

## Steps

Before the first step, `release` checks that it can run to the end, so a failure does not leave a half-done release:

- the new versions can be confirmed: an interactive terminal, or `--yes`;
- unless `--no-safety-check`: the token of the git provider (and the AI provider when used), the access to the registry (npm and pnpm), the credentials of the enabled social platforms, and, when the release commit is pushed, that the branch is up to date with its upstream and can be pushed to.

Then the steps run in this order:

| #   | Step                          | What it does                                                                                                                                                                                                                              | Skipped by                           |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Bump                          | Computes the new versions, asks to confirm them, writes the `package.json` files. When no commit triggers a bump, comments the PR (`no-release`), shows the summary, writes the report and stops with code `0`, without `success:release` | -                                    |
| 2   | Changelog                     | Writes the `CHANGELOG.md` files, then runs `--format-cmd`                                                                                                                                                                                 | `--no-changelog`                     |
| 3   | Publish                       | Runs `--build-cmd`, then publishes the packages in dependency order                                                                                                                                                                       | `--no-publish`                       |
| 4   | Commit and tag                | Commits the release files and creates the tags                                                                                                                                                                                            | `--no-commit` (tags: `--no-git-tag`) |
| 5   | Push                          | Pushes the commit and the tags                                                                                                                                                                                                            | `--no-push`, `--no-commit`           |
| 6   | Provider release              | Creates the GitHub or GitLab releases                                                                                                                                                                                                     | `--no-provider-release`              |
| 7   | Social                        | Posts on X (Twitter) and Slack, when a platform is enabled in [`social`](./../config/social.md)                                                                                                                                           | `--no-social`                        |
| 8   | PR comment                    | Comments the pull request or merge request of the release                                                                                                                                                                                 | `--no-pr-comment`                    |
| 9   | Summary and `success:release` | Shows the summary, writes the [report](./../config/release.md#report), runs the `success:release` hook                                                                                                                                    | -                                    |

`--no-commit` skips the commit, the tags and the push. `--no-git-tag` only skips the tags: the commit is still created and pushed. Each step but the PR comment runs its `before:*`, `success:*` and `error:*` [hooks](./../config/hooks.md).

A failed provider release, social post or PR comment does not stop the release: the step is marked as failed in the summary, and the release ends with `success:release` and code `0`. Any other error, a failed check included, stops it, writes the failed [report](./../config/release.md#report), posts a failed PR comment, runs the `error:release` hook and exits with code `1`.

### Branch Safety

The packages are published **before** the release commit and its tags are pushed, so a failed publication never leaves a tag behind. In return:

- **Branch up to date**: when the commit is pushed, relizy fetches the upstream branch during the checks and again right before publishing. If commits landed on it meanwhile, the release stops before publishing and restores the release files: run it again from the latest commit. `--dry-run` stops too, except on a pull request or a merge request, where it only warns: the commits pushed after it started get their own run. Skipped on a detached HEAD or a branch without upstream.
- **Existing tags**: right after the bump, the release fails if a tag it would create already exists, and tells how to recover.
- **Rejected push**: if the push is still rejected because the remote branch moved, relizy merges the remote branch into the release commit (the tags stay on the published commit) and pushes again. On a conflict, it aborts the merge, pushes the tags and prints the recovery command.
- **Failed publication**: the files written by the release are restored.

## Options

| Flag                                                     | Description                                                                                                 | Config                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `--major`, `--minor`, `--patch`                          | Force the bump type of the release                                                                          | [`bump.type`](./../config/bump.md#type)                                       |
| `--prerelease`, `--premajor`, `--preminor`, `--prepatch` | Bump to a prerelease version, see [Prerelease Versions](./../guide/prereleases.md#prerelease-versions)      | [`bump.type`](./../config/bump.md#type)                                       |
| `--preid <id>`                                           | Prerelease identifier: `alpha`, `beta`, `rc`...                                                             | [`bump.preid`](./../config/bump.md#preid)                                     |
| `--suffix <suffix>`                                      | With a prerelease type, replace the last number: `1.0.0-beta.0` becomes `1.0.0-beta.<suffix>`               | -                                                                             |
| `--canary`                                               | Publish a canary version of the current commit, see [Canary](#canary)                                       | -                                                                             |
| `--force`                                                | Bump the packages even without a commit triggering a bump                                                   | -                                                                             |
| `--yes`                                                  | Confirm the new versions without asking. Required without an interactive terminal (CI)                      | [`bump.yes`](./../config/bump.md#yes)                                         |
| `--from <ref>`                                           | Start of the commit range (tag or commit), instead of the last release tag                                  | [`from`](./../config/overview.md#from-to)                                     |
| `--to <ref>`                                             | End of the commit range, `HEAD` by default                                                                  | [`to`](./../config/overview.md#from-to)                                       |
| `--no-clean`                                             | Release with uncommitted changes. In a terminal, asks to confirm when they touch a file the release commits | [`release.clean`](./../config/release.md#steps)                               |
| `--private-packages <mode>`                              | `release`: version the private packages too (never published), `ignore`: leave them out                     | [`monorepo.privatePackages`](./../config/monorepo.md#privatepackages)         |
| `--no-changelog`                                         | Do not write the changelogs                                                                                 | [`release.changelog`](./../config/release.md#steps)                           |
| `--format-cmd <cmd>`                                     | Command run after writing the changelogs, <code v-pre>{{files}}</code> replaced by their paths              | [`changelog.formatCmd`](./../config/changelog.md#formatcmd)                   |
| `--no-format-cmd`                                        | Do not format the changelogs (no formatter detected)                                                        | [`changelog.formatCmd: false`](./../config/changelog.md#formatcmd)            |
| `--no-root-changelog`                                    | Do not write the root `CHANGELOG.md` of a monorepo                                                          | [`changelog.rootChangelog`](./../config/changelog.md#rootchangelog)           |
| `--no-publish`                                           | Do not publish the packages                                                                                 | [`release.publish`](./../config/release.md#steps)                             |
| `--build-cmd <cmd>`                                      | Command run before publishing, e.g. `"pnpm build"` (quoted: it is one argument)                             | [`publish.buildCmd`](./../config/publish.md#buildcmd)                         |
| `--registry <url>`                                       | Registry to publish to: every package goes there, on top of its non-exclusive `publish.registries` entries  | [`publish.registry`](./../config/publish.md#registry)                         |
| `--tag <tag>`                                            | Dist-tag of the publication. Default: `latest` for a stable version, `next` for a prerelease                | [`publish.tag`](./../config/publish.md#tag)                                   |
| `--access <type>`                                        | `public` or `restricted`                                                                                    | [`publish.access`](./../config/publish.md#access)                             |
| `--otp <code>`                                           | One-time password of the registry (2FA)                                                                     | [`publish.otp`](./../config/publish.md#otp)                                   |
| `--publish-token <token>`                                | Registry token, for npm, pnpm and bun                                                                       | [`tokens.registry`](./../config/overview.md#tokens)                           |
| `--skip-existing-versions`                               | Skip the packages whose version is already on the registry instead of failing                               | [`publish.skipExistingVersions`](./../config/publish.md#skipexistingversions) |
| `--no-commit`                                            | Do not commit, tag nor push                                                                                 | [`release.commit`](./../config/release.md#steps)                              |
| `--no-git-tag`                                           | Do not create the tags                                                                                      | [`release.gitTag`](./../config/release.md#steps)                              |
| `--no-verify`                                            | Commit with `git commit --no-verify` (skip the git hooks)                                                   | [`release.noVerify`](./../config/release.md#steps)                            |
| `--no-push`                                              | Do not push the commit and the tags                                                                         | [`release.push`](./../config/release.md#steps)                                |
| `--no-provider-release`                                  | Do not create the GitHub or GitLab releases                                                                 | [`release.providerRelease`](./../config/release.md#steps)                     |
| `--provider <provider>`                                  | Git provider: `github` or `gitlab`                                                                          | [`repo`](./../config/overview.md#repo)                                        |
| `--token <token>`                                        | Token of the git provider (GitHub or GitLab)                                                                | [`tokens`](./../config/overview.md#tokens)                                    |
| `--ai`, `--no-ai`                                        | Force or disable the AI rewrite of the release notes and the social posts                                   | [AI](./../config/ai.md)                                                       |
| `--no-social`                                            | Do not post on social media                                                                                 | [`release.social`](./../config/release.md#steps)                              |
| `--slack-format <format>`                                | `full` (bodies and PR links), `summary` (commit titles) or `none` changelog in the Slack message            | [`social.slack`](./../config/social.md#slack)                                 |
| `--no-pr-comment`                                        | Do not comment the pull request                                                                             | [`release.prComment`](./../config/release.md#steps)                           |
| `--report-json <file>`                                   | Write the report of the release to this JSON file                                                           | [`release.report`](./../config/release.md#report)                             |
| `--report-dotenv <file>`                                 | Write the outputs of the release to this dotenv file (`RELIZY_RELEASED=true`...), for GitLab CI             | [`release.report`](./../config/release.md#report)                             |
| `--report-markdown <file>`                               | Write the summary of the release to this markdown file                                                      | [`release.report`](./../config/release.md#report)                             |

On GitHub Actions, the outputs of the step and the summary of the run are written without option.

## Canary

`--canary` publishes a temporary version of the current commit, `{nextVersion}-0.canary-{sha}` (e.g. `1.3.0-0.canary-a3f4b2c`), with the `canary` dist-tag:

- it skips the changelog, the commit, the tags, the push, the provider release and the social posts;
- it keeps the checks, the publication and the PR comment;
- it restores the `package.json` files once published (right away with `--no-publish`);
- the version comes from the commits: the type flags, `--force` and `--suffix` are ignored;
- `--preid` changes the identifier (`1.3.0-0.snapshot-a3f4b2c`), `--tag` the dist-tag, `--skip-existing-versions` makes a re-run on the same commit succeed.

See [Canary Releases](./../guide/prereleases.md#canary-releases).

## Examples

```bash
# Preview: versions, changelogs, release notes, posts
relizy release --dry-run

# In CI
relizy release --yes

# A beta prerelease, published with the next dist-tag
relizy release --prerelease --preid beta --yes

# Version and tag, publish nothing
relizy release --no-publish --no-provider-release

# Canary of a pull request
relizy release --canary --yes --pr-number 42

# GitLab CI: the outputs for the next jobs
relizy release --yes --report-dotenv relizy.env
```

## See Also

- [bump](./bump.md), [changelog](./changelog.md), [publish](./publish.md), [provider-release](./provider-release.md), [social](./social.md), [pr-comment](./pr-comment.md): each step alone
- [Release config](./../config/release.md)
- [CI/CD](./../guide/ci-cd.md)
- [`release()`](./../api/release.md)
