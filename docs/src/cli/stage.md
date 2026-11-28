---
title: stage
description: List, approve or reject the versions staged on npm, awaiting approval, with your npm login and one 2FA for the whole batch.
metaDescription: 'Approve the versions staged on npm with one 2FA: relizy stage list, approve and reject, the --all, --otp and --json flags.'
keywords: relizy stage, npm stage approve, npm stage reject, npm stage list, staged publishing, approve staged versions, 2FA, otp
category: CLI Reference
tags: [cli, stage, npm, publish, 2fa]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy stage list [options]
relizy stage approve [packages...] [options]
relizy stage reject [packages...] [options]
```

A version [staged](./../guide/staged-publishing.md) on npm is not installable until a maintainer approves it with 2FA. `relizy stage` works on the staged versions of the public packages of the project, with **your own npm login** (`npm login`): a token of the environment (`NPM_TOKEN`, `NODE_AUTH_TOKEN`, `RELIZY_NPM_TOKEN`) never overrides it, as npm only approves with an interactive 2FA.

It is refused in a CI and with trusted publishing (OIDC), where npm does not accept it. The [global options](./commands.md#global-options) apply too (`--dry-run`, `--profile`, `--config`...). With `--dry-run`, nothing is asked to npm, and no code is asked.

## Subcommands

### list

Lists the staged versions: package, version, tag, status, date, who staged it and the id. Read-only, no 2FA.

The status is `validating` while npm scans the version for malware, then `staged`: only a `staged` version can be approved.

### approve

Approves the staged versions of the given packages, of every package with `--all`, or of the ones you check in the terminal (all checked by default). The versions are approved dependencies first, with **one 2FA code for the batch**: Relizy asks again only when npm stops accepting it. A version still `validating` is waited for (up to 5 minutes), then skipped. A version whose dependency was not approved is skipped too.

An account with a security key has no code to type: leave the code empty, Relizy prints the page of the web 2FA of npm and goes on once you validated it. Check **skip 2FA for the next 5 minutes** on the page to approve the whole batch with this validation, otherwise each version asks again. Otherwise, approve on [npmjs.com](https://www.npmjs.com/settings) (the tab of the staged packages), which approves up to 100 versions with one 2FA.

### reject

Rejects the staged versions chosen as for `approve`, after a confirmation. A rejection is final.

## Options

| Flag           | Applies to                  | Description                                                                       |
| -------------- | --------------------------- | --------------------------------------------------------------------------------- |
| `--all`        | `approve`, `reject`         | Every staged version of the public packages of the project, without the selection |
| `--otp <code>` | `approve`, `reject`         | The 2FA code of npm, instead of asking for it                                     |
| `--json`       | `list`, `approve`, `reject` | Print the staged versions (`list`) or the results of each version as JSON         |

## Examples

```bash
# What awaits approval
relizy stage list

# Approve everything, one code
relizy stage approve --all

# Approve two packages
relizy stage approve @scope/core @scope/cli

# Choose in the terminal
relizy stage approve

# Drop a version (asks to confirm)
relizy stage reject @scope/core

# For a script
relizy stage list --json
```

## From a Release

[`relizy release`](./release.md) approves what it staged in its own [`approve` step](./release.md#steps), driven by [`publish.approve`](./../config/publish.md#approve). `relizy stage` is for what is left: a release from a CI, a declined prompt, `--no-approve`.

## See Also

- [Staged publishing](./../guide/staged-publishing.md)
- [`publish.staged`](./../config/publish.md#staged) and [`publish.approve`](./../config/publish.md#approve)
- [`stage()`](./../api/stage.md)
