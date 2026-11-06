---
title: provider-release
description: Create the GitHub or GitLab releases of the current versions, with their changelog as release notes.
keywords: relizy provider release, github release, gitlab release, release notes, git provider token, ai release notes
category: CLI Reference
tags: [cli, provider-release, github, gitlab, releases]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy provider-release [options]
```

`provider-release` is a [step of `release`](./release.md#steps), after the push: the tags of the releases must be on the remote. Alone, it creates the release of the current version (one per package in `independent` mode), with the changelog of the commits since the previous release tag as notes. A prerelease version is marked as a prerelease.

The provider is `--provider`, else [`repo.provider`](./../config/overview.md#repo), else detected from the repository (`github` or `gitlab`). The command exits with code `1` when a release fails. On Bitbucket, which has no release API, the step creates nothing (the tags of the release are its only trace). The [global options](./commands.md#global-options) apply too (`--dry-run`, `--group`, `--no-safety-check`...).

## Options

| Flag                    | Description                                                                    | Config                                     |
| ----------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| `--from <ref>`          | Start of the commit range (tag or commit), instead of the previous release tag | [`from`](./../config/overview.md#from-to)  |
| `--to <ref>`            | End of the commit range                                                        | [`to`](./../config/overview.md#from-to)    |
| `--provider <provider>` | `github` or `gitlab`, instead of the detected one                              | -                                          |
| `--token <token>`       | Token of the git provider                                                      | [`tokens`](./../config/overview.md#tokens) |
| `--ai`, `--no-ai`       | Force or disable the AI rewrite of the release notes                           | [AI](./../config/ai.md)                    |

Without `--token`, the token comes from the config or the environment (`GITHUB_TOKEN`, `GITLAB_TOKEN`...), see [Tokens](./../config/overview.md#tokens). See [AI-Enhanced Changelogs](./../guide/ai-changelog.md) for the AI release notes.

## Examples

```bash
# Preview the release notes
relizy provider-release --dry-run

# On GitLab, with a token
relizy provider-release --provider gitlab --token "$GITLAB_TOKEN"

# Without the AI rewrite set in the config
relizy provider-release --no-ai
```

## See Also

- [release](./release.md)
- [GitHub Actions](./../guide/github-actions.md), [GitLab CI](./../guide/gitlab-ci.md)
- [AI config](./../config/ai.md)
- [`providerRelease()`](./../api/provider-release.md)
