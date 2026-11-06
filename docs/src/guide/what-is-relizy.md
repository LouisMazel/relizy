---
title: What is Relizy?
description: Relizy automates the releases of single packages and monorepos from Conventional Commits - version bumps, changelogs, git tags, npm publishing, GitHub and GitLab releases, social posts and PR comments - with one command.
metaDescription: 'Relizy automates the releases of packages and monorepos from Conventional Commits: versions, changelogs, tags, npm, GitHub and GitLab releases.'
keywords: relizy, release automation, monorepo release tool, version management, conventional commits, changelog generator, npm publishing, github releases, gitlab releases, semantic versioning
category: Guide
tags: [guide, introduction, overview, features]
---

# {{ $frontmatter.title }}

Relizy is a release tool for JavaScript and TypeScript projects, single packages or monorepos. It reads your [Conventional Commits](https://www.conventionalcommits.org/), computes the next [semantic version](https://semver.org/) of each package and runs the whole release with one command:

```bash
relizy release
```

This command bumps the versions, writes the changelogs, publishes to npm, commits, tags and pushes, then creates the GitHub or GitLab release, posts the announcements and comments on the pull request of the release. Each step can be turned off. See [the steps of `relizy release`](./../cli/release.md#steps).

A single package needs no configuration. A monorepo needs a `monorepo` section in `relizy.config.ts`, which [`relizy init`](./../cli/init.md) writes for you.

## Version Modes

In a monorepo, choose how the packages are versioned:

- **`unified`**: every package shares one version and is bumped at each release.
- **`selective`** (recommended): one shared version, only the packages with changes (and their dependents) are bumped.
- **`independent`**: each package has its own version, bumped from its own commits.

See [Version Modes](./version-modes.md).

## Features

- [Version modes](./version-modes.md): `unified`, `selective` or `independent`.
- [Version groups](./version-groups.md): several sets of packages, each with its own version mode, released in one run.
- [Changelogs](./changelog.md): a `CHANGELOG.md` per package and at the root, grouped by commit type.
- [Dependency management](./dependency-management.md): the dependents of a bumped package are bumped too, including through pnpm, Yarn and Bun catalogs.
- [npm publishing](./../config/publish.md): in dependency order, with the right dist-tag, 2FA and registry checks.
- GitHub and GitLab releases: [`relizy provider-release`](./../cli/provider-release.md), run by `relizy release`.
- [Social posts](./social-media.md): release announcements on [Twitter (X)](./social-media.md#twitter) and [Slack](./social-media.md#slack).
- [PR comment](./pr-comment.md): a summary of the release on the pull request or merge request it comes from.
- [Release report](./../config/release.md#report): the summary of the release in the CI, and in a file with `--report-json`, `--report-dotenv` or `--report-markdown`.
- [AI release notes](./ai-changelog.md): the provider releases and the social posts rewritten by an AI model.
- [`relizy commitlint`](./../commitlint/index.md): lints the commit messages, with a preview of their changelog entry.
- [MCP server](./ai-agents.md): lets your AI agents preview a release, lint a commit and read the docs.
- [`relizy init`](./../cli/init.md): writes the config, the CI workflow, the commit-msg hook and the setup of your AI agents.
- [Canary releases](./prereleases.md#canary-releases) and [prereleases](./prereleases.md#prerelease-versions): test versions from a pull request, `alpha`, `beta` and `rc` versions.
- [Private projects](./private-projects.md): versions, changelogs, tags and releases for apps that are never published.
- [Moved packages](./moved-packages.md): the commits made before a package moved keep counting.
- [Rewritten tags](./rewritten-tags.md): detects the release tags orphaned by a rebase, which would break the changelogs.

## Next Steps

- [Getting Started](./getting-started.md): install Relizy and run your first release.
- [Semver Convention](./semver-convention.md): how commits decide the version.
- [CI/CD](./ci-cd.md): release from your pipeline.
- [Configuration](./../config/overview.md): every option.
