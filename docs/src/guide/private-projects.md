---
title: Private Projects & Apps
description: Relizy is not only for packages published to npm. Version your private apps, services and internal monorepos automatically, with changelogs, git tags and GitHub or GitLab releases, without ever publishing anything.
keywords: private project versioning, app versioning, version without npm, internal monorepo, private packages, changelog for apps, git tags, github releases, gitlab releases, release automation without publishing
category: Guide
tags: [guide, private, apps, monorepo, versioning, changelog, github, gitlab]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Not Only for npm Packages

Most release tools assume you publish libraries to a registry. But a lot of code never leaves the company: web apps, APIs, workers, internal tools, monorepos of private services. These projects deserve the same release discipline as open-source libraries:

- 🔢 **A real version number** for every deploy, instead of "the commit from Tuesday"
- 📝 **A changelog** your team, your QA and your clients can read
- 🏷️ **Git tags** to know exactly what is running in production, and to roll back to it
- 🚀 **GitHub or GitLab releases** with release notes, attached to those tags
- 💬 **A PR comment** that tells the team what was just released

Relizy gives you all of this from your Conventional Commits, with a single command, and without publishing anything.

## What Relizy Does for a Private Project

Running `relizy release` on a private project will:

1. ✅ Analyze your commits since the last release
2. ✅ Bump the `version` in each `package.json` that has changes
3. ✅ Generate or update `CHANGELOG.md` files
4. ✅ Create a release commit and a git tag per version
5. ✅ Push the commit and the tags
6. ✅ Create a GitHub or GitLab release for each tag, with its release notes
7. ✅ Post a summary comment on your pull request or merge request

And it will **never**:

- ❌ Publish a package to npm or any other registry
- ❌ Ask for an npm token or check registry authentication
- ❌ Show install commands (`pnpm add ...`) in the PR comment

## Your Code Stays Private

::: tip Nothing is published, ever
Two independent safeguards keep your code where it is:

1. **`release.publish: false`** turns the publish step off entirely. Relizy does not build, pack, authenticate to a registry, or publish anything.
2. **Packages with `"private": true` are never published**, even if the publish step is enabled. This is a hard rule in Relizy, not an option.

:::

The GitHub or GitLab releases are created **in your own repository**, so they have exactly the same visibility as your code: a private repository gets private releases. Their content is the changelog, built from commits that anyone with access to the repository can already read.

## Recommended Configuration

### A Single App

For a project with a single `package.json` at the root (a Nuxt app, an API, a CLI used internally...):

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  projectName: 'My App',

  release: {
    publish: false, // never publish anything
    social: false, // no public announcements
    changelog: true,
    commit: true,
    gitTag: true,
    push: true,
    providerRelease: true, // GitHub or GitLab release
    prComment: true,
  },
})
```

Each release creates a tag like `v1.4.0` and a matching GitHub or GitLab release.

### A Monorepo of Apps and Private Packages

For a monorepo where every package is private (apps, workers, shared internal libraries), use the `independent` mode so each app gets its own version, and enable `includePrivates`:

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  projectName: 'My Platform',

  monorepo: {
    versionMode: 'independent',
    packages: ['apps/*', 'packages/*'],
    includePrivates: true, // version and release private packages too
  },

  changelog: {
    rootChangelog: true, // also keep an aggregated CHANGELOG.md at the root
  },

  release: {
    publish: false,
    social: false,
    changelog: true,
    commit: true,
    gitTag: true,
    push: true,
    providerRelease: true,
    prComment: true,
  },
})
```

With this configuration, a release that touches `apps/web` and `packages/core` creates the tags `@my-platform/web@1.3.0` and `@my-platform/core@2.1.0`, each with its own `CHANGELOG.md` entry and its own GitHub or GitLab release.

::: info Why `includePrivates`?
By default, Relizy skips packages marked `"private": true`, because in a library monorepo they are usually internal tooling. In a private project, they are the whole point: `includePrivates: true` tells Relizy to version, tag and release them. See [`monorepo.includePrivates`](/config/monorepo#includeprivates).
:::

Prefer one shared version for the whole platform? Use `versionMode: 'unified'` or `'selective'` instead: Relizy then creates a single tag (`v1.3.0`) and a single release for the repository. See [Version Modes](/guide/version-modes).

## Before Your First Release

Private apps often have no `version` field, since they are never published. Relizy needs one in every `package.json` it versions. Start at `0.0.0`:

```json
{
  "name": "@my-platform/web",
  "version": "0.0.0",
  "private": true
}
```

Then preview the release without changing anything:

```bash
relizy release --dry-run
```

The dry run shows the versions, changelogs, tags, release notes and PR comment that a real release would produce. When it looks right, run it for real:

```bash
relizy release
```

::: tip First release of a package
A package that has never been released has no previous tag to compare with. Relizy reads its history from the first commit that touched its folder, and the compare link of its first changelog points to the commit just before it.
:::

## In CI

Only a token for your git provider is needed. No npm token, no registry configuration:

```yaml
# .github/workflows/release.yml
name: Release

on:
  workflow_dispatch:

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v6
        with:
          node-version: '24'

      - run: npm ci

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Release
        run: npx relizy release --yes
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

See [GitHub Actions](/guide/github-actions) and [GitLab CI](/guide/gitlab-ci) for more setups.

## Ideas for Using Your Versions

Once every deploy has a version and a tag, you can build on it:

- 🐳 **Tag your Docker images** with the package version instead of a commit hash
- 🔙 **Roll back** by redeploying a previous tag
- 🩺 **Expose the version** in a health check or an "About" page, to know what runs where
- 📣 **Share the release notes** with QA, support or clients from the GitHub or GitLab release page
- ✨ **Rewrite release notes** for a non-technical audience with [AI-Enhanced Changelogs](/guide/ai-changelog)

## FAQ

### Can Relizy publish my code to npm by mistake?

No. With `release.publish: false`, the publish step does not run at all. And even if it did, packages with `"private": true` are always skipped by `relizy publish`.

### Do I need an npm account or token?

No. Without the publish step, Relizy never contacts a registry.

### Does a GitHub or GitLab release make my code public?

No. The release lives in your repository and inherits its visibility. It only contains the changelog and points to a tag you already pushed.

### Can I skip the GitHub or GitLab releases and only keep tags and changelogs?

Yes. Set `release.providerRelease: false`, or pass `--no-provider-release` to `relizy release`.

### What if only some of my packages are published?

That works too. In the same monorepo, public packages are published to npm while private ones are only versioned, tagged and released on GitHub or GitLab. Keep `release.publish: true` and `monorepo.includePrivates: true`. The PR comment only shows install commands for the published packages.
