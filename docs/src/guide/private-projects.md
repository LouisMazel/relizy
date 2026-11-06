---
title: Private Projects & Apps
description: Version private apps, services and internal monorepos with Relizy - versions, changelogs, git tags, GitHub or GitLab releases and PR comments - without ever publishing anything to a registry.
metaDescription: 'Version private apps, services and internal monorepos with Relizy: changelogs, git tags, GitHub or GitLab releases, without publishing to npm.'
keywords: private project versioning, app versioning, version without npm, internal monorepo, private packages, privatePackages, changelog for apps, git tags, github releases, gitlab releases, release without publishing, no-publish
category: Guide
tags: [guide, private, apps, monorepo, versioning, changelog, github, gitlab]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## What a Release Does

On a private project, `relizy release` bumps the versions from the commits, writes the `CHANGELOG.md` files, commits, tags and pushes, creates a GitHub or GitLab release per tag and comments on the pull request or merge request of the release.

It never publishes a package, never asks for an npm token and never shows install commands in the PR comment.

## Your Code Stays Private

::: tip Nothing is published, ever
Two independent safeguards keep your code where it is:

1. **`release.publish: false`** turns the publish step off: Relizy does not build, pack, authenticate to a registry nor publish anything. `--no-publish` does the same for one run.
2. **Packages with `"private": true` are never published**, even when the publish step runs. There is no option to change this.

:::

The GitHub or GitLab releases are created in your own repository, with its visibility: a private repository gets private releases. They contain the changelog, built from commits that anyone with access to the repository can already read.

## Set Up With relizy init

[`relizy init`](./../cli/init.md) asks what a release should do: choose **Version only**. It is suggested for a single package marked `private`, or for a monorepo none of whose versioned workspace packages can be published. Relizy then writes `release.publish: false` and, in a monorepo of private packages, `monorepo.privatePackages: 'release'`. The generated CI workflow does not ask for an npm token.

## A Single App

A project with a single `package.json` at the root (a Nuxt app, an API, an internal CLI) is released even with `"private": true`, and never published. No option is needed. To skip the publish step entirely and the social posts:

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    publish: false,
    social: false,
  },
})
```

Each release creates a tag like `v1.4.0` and its GitHub or GitLab release.

## A Monorepo of Apps and Private Packages

By default, Relizy leaves out the workspace packages marked `"private": true`: in a library monorepo, they are usually internal tooling. In a private project, they are the whole point: release them with [`monorepo.privatePackages: 'release'`](./../config/monorepo.md#privatepackages) (or `--private-packages release` for one run).

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'independent',
    packages: ['apps/*', 'packages/*'],
    privatePackages: 'release',
  },
  release: {
    publish: false,
  },
})
```

In `independent` mode, a release touching `apps/web` and `packages/core` creates the tags `@my-platform/web@1.3.0` and `@my-platform/core@2.1.0`, each with its `CHANGELOG.md` entry and its GitHub or GitLab release. With `unified` or `selective`, the whole platform shares one version, one tag (`v1.3.0`) and one release. See [Version Modes](./version-modes.md).

## Before Your First Release

Relizy needs a `version` in every `package.json` it releases, and private apps often have none. Start at `0.0.0`:

```json
{
  "name": "@my-platform/web",
  "version": "0.0.0",
  "private": true
}
```

`relizy init` adds it to the root `package.json` when it is missing, and leaves out the workspace packages without a version (`monorepo.ignored`).

Then preview the release:

```bash
npx relizy release --dry-run
```

A package never released has no previous tag: Relizy reads its history from the first commit that touched its folder.

## In CI

The workflow is the one of [GitHub Actions](./github-actions.md) or [GitLab CI](./gitlab-ci.md), without the npm token: only the token of the git provider is needed (see [Tokens](./../config/overview.md#tokens)).

## FAQ

### Can Relizy publish my code to npm by mistake?

No. With `release.publish: false`, the publish step does not run. And even when it runs, the packages with `"private": true` are always skipped.

### Do I need an npm account or token?

No. When no package can be published, Relizy never contacts a registry.

### Does a GitHub or GitLab release make my code public?

No. The release lives in your repository and has its visibility. It contains the changelog and points to a tag you already pushed.

### Can I skip the GitHub or GitLab releases and only keep tags and changelogs?

Yes. Set `release.providerRelease: false`, or pass `--no-provider-release` to `relizy release`.

### What if only some of my packages are published?

Keep the publish step and set `monorepo.privatePackages: 'release'`: in the same monorepo, the public packages are published to npm while the private ones are only versioned, tagged and released on GitHub or GitLab. The PR comment only shows install commands for the published packages.
