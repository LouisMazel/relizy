---
title: Getting Started
description: Install Relizy, set up a project with relizy init, write Conventional Commits, preview the release with --dry-run, run your first release and move it to the CI.
keywords: relizy getting started, install relizy, relizy init, first release, quick start, conventional commits, dry run, relizy tutorial, node version
category: Guide
tags: [guide, getting-started, installation, tutorial, quickstart]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Prerequisites

- **Node.js** `^22.23.4 || ^24.22.1 || >=26.12.1`
- **pnpm**, **npm**, **Yarn** or **Bun**
- A **git** repository

## Set Up the Project

Run [`relizy init`](./../cli/init.md) at the root of the project:

```bash
npx relizy init
```

It adds Relizy to the devDependencies with your package manager (`pnpm add -D relizy`...), so everyone, and the CI, run the same version. The package also installs the `rly` alias of the `relizy` binary.

It detects the package manager, the git provider and the workspace packages, asks what a release should do (publish to npm, or only version for an app or a private project) and how to version the packages, then writes `relizy.config.ts`. It also offers the release workflow of the CI, a commit-msg hook running [`relizy commitlint`](./../commitlint/index.md), the setup of your AI agents and a `release` script. Add `--yes` to accept the detected values without questions.

A single package needs no config file. A monorepo needs a `monorepo` section: without it, Relizy releases the root `package.json` only.

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*'],
  },
})
```

See [Version Modes](./version-modes.md) to choose a mode, and [Configuration](./../config/overview.md) for every option.

## Write Conventional Commits

Relizy computes the versions from the [Conventional Commits](https://www.conventionalcommits.org/) since the last release:

```bash
git commit -m "feat(auth): add the magic link login"
git commit -m "fix(auth): resolve the login redirect"
git commit -m "docs: update the README"
```

`feat` bumps the minor, `fix` the patch, a `!` after the type or a `BREAKING CHANGE:` footer the major. See [Semver Convention](./semver-convention.md) for every type and the rules of the `0.x` versions. In a monorepo, a commit belongs to the packages whose files it changes.

## Preview the Release

```bash
npx relizy release --dry-run
```

The dry run computes the versions and shows the changelogs, release notes, posts and PR comment the release would produce, without writing, committing, pushing or publishing anything. `--no-preview` hides the generated content, and `--ai-preview` calls the AI to preview its rewrites (it costs) instead of simulating them.

## Release

```bash
npx relizy release
```

Relizy shows the packages to bump and asks for confirmation, then bumps the versions, writes the changelogs, publishes to npm, commits, tags, pushes, creates the GitHub or GitLab release, posts to the social platforms and comments on the pull request. See [the steps of `relizy release`](./../cli/release.md#steps). Publishing and the provider releases need tokens: see [Tokens](./../config/overview.md#tokens).

The changelog of a release fixing a bug looks like this:

```md
## v1.0.0...v1.0.1

[compare changes](https://github.com/acme/my-lib/compare/v1.0.0...v1.0.1)

### 🩹 Fixes

- **auth:** Resolve the login redirect ([a1b2c3d](https://github.com/acme/my-lib/commit/a1b2c3d))

### 📖 Documentation

- Update the README ([e4f5a6b](https://github.com/acme/my-lib/commit/e4f5a6b))

### ❤️ Contributors

- Jane Doe ([@jane](https://github.com/jane))
```

Useful flags:

- `--patch`, `--minor`, `--major`: force the bump instead of computing it from the commits. For prereleases and canary versions, see [Prereleases](./prereleases.md).
- `--no-publish`: skip the npm publishing, for an app or a private project.
- `--no-commit`: skip the commit, the tag and the push.
- `--no-push`, `--no-provider-release`, `--no-social`, `--no-pr-comment`: skip a single step.

Every flag is on the page of [`relizy release`](./../cli/release.md). Each step also has its command (`relizy bump`, `relizy changelog`, `relizy publish`...), see [CLI Commands](./../cli/commands.md).

## Release From the CI

In a CI, there is no terminal to confirm the bump: add `--yes`, otherwise `relizy release` fails and tells you to add it.

```bash
pnpm exec relizy release --yes
```

`relizy init` generates the workflow: `.github/workflows/release.yml` with the [relizy action](./github-actions.md#the-relizy-action) for GitHub Actions, `.gitlab-ci.yml` with the [relizy component](./gitlab-ci.md#the-relizy-component) for GitLab CI. Relizy handles the shallow clone, the git identity of the release commit and the detached HEAD of GitLab by itself. See [CI/CD](./ci-cd.md), [GitHub Actions](./github-actions.md) and [GitLab CI](./gitlab-ci.md).

## AI Release Notes

Relizy can rewrite the GitHub or GitLab release notes and the social posts with an AI model (Claude by default, or any model of the Vercel AI SDK). Turn it on with the `ai` options of the config and an API key. See [AI-Enhanced Changelogs](./ai-changelog.md) for the installation, and [AI](./../config/ai.md) for the options.

## AI Agents

`relizy mcp init` gives your AI coding agents (Claude Code, Cursor, VS Code...) the rules of Relizy and its MCP server: they can preview the next release, lint a commit message and read these docs. See [AI Agents](./ai-agents.md).

## Next Steps

- [Version Modes](./version-modes.md): `unified`, `selective` or `independent`.
- [Private Projects](./private-projects.md): version an app without publishing it.
- [Prereleases](./prereleases.md): canary, `alpha`, `beta` and `rc` versions.
- [CLI Commands](./../cli/commands.md): every command and global option.
