---
title: publish
description: Publish the packages to the npm registry, or other registries, without bump, commit nor tag.
keywords: relizy publish, npm publish, staged publishing, approve, registry, dist-tag, npm token, otp, monorepo publish, build command
category: CLI Reference
tags: [cli, publish, npm, registry, monorepo]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy publish [options]
```

`publish` is the third [step of `release`](./release.md#steps). It:

1. finds the packages to publish (public packages only, the private ones are never published);
2. checks the access to the registry (npm and pnpm, not Yarn nor Bun) and the `workspace:` dependencies (see [`publish.checkWorkspaceDependencies`](./../config/publish.md#checkworkspacedependencies));
3. runs the build command, only when `--build-cmd` or [`publish.buildCmd`](./../config/publish.md#buildcmd) is set;
4. publishes the packages, each after its internal dependencies, with the package manager of the project, or stages them with [`publish.staged`](./../config/publish.md#staged) (see [Staged publishing](./../guide/staged-publishing.md));
5. when the run staged versions, approves them with one 2FA, as [`publish.approve`](./../config/publish.md#approve) says (outside a CI).

Alone, it publishes the current versions: run it after [`bump`](./bump.md). The [global options](./commands.md#global-options) apply too (`--dry-run`, `--group`...).

## Options

| Flag                       | Description                                                                                                | Config                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `--registry <url>`         | Registry to publish to: every package goes there, on top of its non-exclusive `publish.registries` entries | [`publish.registry`](./../config/publish.md#registry)                         |
| `--tag <tag>`              | Dist-tag of the publication. Default: `latest` for a stable version, `next` for a prerelease               | [`publish.tag`](./../config/publish.md#tag)                                   |
| `--access <type>`          | `public` or `restricted`                                                                                   | [`publish.access`](./../config/publish.md#access)                             |
| `--otp <code>`             | One-time password of the registry (2FA). Without it, locally, npm's web 2FA page opens in the browser      | [`publish.otp`](./../config/publish.md#otp)                                   |
| `--build-cmd <cmd>`        | Command run before publishing. Quote it, it is one argument: `--build-cmd "pnpm build"`                    | [`publish.buildCmd`](./../config/publish.md#buildcmd)                         |
| `--publish-token <token>`  | Registry token, for npm, pnpm and bun (written to a temporary `.npmrc`)                                    | [`tokens.registry`](./../config/overview.md#tokens)                           |
| `--skip-existing-versions` | Skip the packages whose version is already on the registry instead of failing                              | [`publish.skipExistingVersions`](./../config/publish.md#skipexistingversions) |
| `--staged`                 | Stage the versions on npm for approval instead of publishing them, canaries included                       | [`publish.staged`](./../config/publish.md#staged)                             |
| `--no-staged`              | Publish the versions directly, without staging                                                             | [`publish.staged`](./../config/publish.md#staged)                             |
| `--approve`                | Approve the versions the run staged without asking, with one 2FA                                           | [`publish.approve`](./../config/publish.md#approve)                           |
| `--no-approve`             | Never approve the versions the run staged: approve them later                                              | [`publish.approve`](./../config/publish.md#approve)                           |

Without `--publish-token`, the token comes from the config or the environment, see [Tokens](./../config/overview.md#tokens).

## Examples

```bash
# Preview the publication
relizy publish --dry-run

# A beta, installed with my-package@beta
relizy publish --tag beta

# Stage the versions: a maintainer approves them before they are installable
relizy publish --staged

# Build first
relizy publish --build-cmd "pnpm build"

# A re-run publishes only what is missing
relizy publish --skip-existing-versions
```

## See Also

- [release](./release.md)
- [Publish config](./../config/publish.md)
- [Staged publishing](./../guide/staged-publishing.md) and [`relizy stage`](./stage.md)
- [CI/CD](./../guide/ci-cd.md)
- [`publish()`](./../api/publish.md)
