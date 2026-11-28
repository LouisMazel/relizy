---
title: trust
description: Set up the npm trusted publishers of the packages from the release workflow files, with your npm login and one 2FA - the command that replaces the manual setup on npmjs.com.
metaDescription: 'Create the npm trusted publisher configurations of every package with relizy trust: GitHub Actions, GitLab CI and CircleCI, one 2FA, idempotent.'
keywords: relizy trust, npm trust, trusted publishers, trusted publishing, oidc, github actions, gitlab ci, circleci, npm 2FA, monorepo
category: CLI Reference
tags: [cli, trust, npm, publish, oidc, security]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy trust [packages...] [options]
```

Creates the [trusted publisher](./../guide/trusted-publishing.md) configurations of the public packages on npmjs.com, with your npm login (`npm login`) and **one 2FA code** for all of them. It reads what it needs from the release workflow: the workflow file (written by [`relizy init`](./init.md), running `relizy release` or `relizy publish`, or given with `--file`), the repository of the git remote and the environment of the releasing job. Nothing to repeat in the config.

It needs npm 11.15.0 or later and a package already on npm (trusted publishing cannot create one: a package not on npm yet is reported as `missing`, with the way to create it). It never runs in a CI. The [global options](./commands.md#global-options) apply too: with `--dry-run`, it tells what would be set up without calling npm.

## What It Does

- **Idempotent**: an existing configuration is kept. One of the same workflow with other permissions or another environment is reported as `differs`, or revoked and recreated with `--replace`, after a confirmation that names each configuration.
- **The permissions follow [`publish.staged`](./../config/publish.md#staged)**: direct publish for a package never staged, both direct and staged publish for a staged package (its canaries, and the tags out of `staged.tags`, are published directly). A workflow with the jobs `npm-staged` and `npm-direct` (environments) gets one configuration of each, so that npm enforces staging, see [Making npm enforce staging](./../guide/trusted-publishing.md#making-npm-enforce-staging).
- **Proposes `publish.staged`**: when the configurations only allow staging, it shows the change and writes it in the config file after a confirmation. A config that is not a plain object literal gets the value printed instead.
- **Unused configurations**: npm removes a new configuration that no publish used within 2 days. `relizy trust` lists the packages it set up with no release pending: run it again before their next release.

The results are `created`, `exists`, `differs`, `replaced`, `missing` or `failed`, one per package.

## Options

| Flag                                     | Description                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `--all`                                  | Every public package of the project (the default, `packages` narrows it)                 |
| `--replace`                              | Revoke and recreate the configurations of the workflow that differ, after a confirmation |
| `--file <file>`                          | The release workflow file, instead of the ones found                                     |
| `--repo <owner/repo>`                    | GitHub repository, instead of the git remote                                             |
| `--project <group/project>`              | GitLab project, instead of the git remote                                                |
| `--env <name>`                           | Environment of the job, instead of the one read in the workflow                          |
| `--otp <code>`                           | The 2FA code of npm, instead of asking for it                                            |
| `--yes`                                  | Answer yes to the confirmations (replace, write `publish.staged`)                        |
| `--circleci-org-id <id>`                 | CircleCI organization id (Organization Settings > Overview)                              |
| `--circleci-project-id <id>`             | CircleCI project id (Project Settings > Overview)                                        |
| `--circleci-pipeline-definition-id <id>` | CircleCI pipeline definition id (Project Settings > Project Setup)                       |
| `--circleci-vcs-origin <origin>`         | CircleCI repository, e.g. `github.com/owner/repo`                                        |
| `--circleci-context-id <id...>`          | CircleCI context ids (Organization Settings > Contexts)                                  |

A CircleCI pipeline is written by hand, so its identifiers do not come from the git remote: give them with the `--circleci-*` flags.

## Examples

```bash
# Preview what would be set up
relizy trust --dry-run

# Every public package
relizy trust

# One package, recreating its configuration
relizy trust @scope/core --replace

# A release workflow that is not the generated one
relizy trust --file publish.yml

# A CircleCI pipeline
relizy trust \
  --circleci-org-id 1111 --circleci-project-id 2222 \
  --circleci-pipeline-definition-id 3333 \
  --circleci-vcs-origin github.com/owner/repo
```

## See Also

- [Trusted publishing](./../guide/trusted-publishing.md)
- [Staged publishing](./../guide/staged-publishing.md)
- [`trust()`](./../api/trust.md)
