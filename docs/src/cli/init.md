---
title: init
description: Set up Relizy in a few questions - the config, the commit-msg hook, the release script, the AI agents and the release workflow of GitHub Actions or GitLab CI. Everything else is detected.
metaDescription: 'Set up Relizy in a few questions: the config, the commit-msg hook, the release script, the AI agents and the CI release workflow.'
keywords: relizy init, relizy setup, create relizy config, relizy.config.ts, release workflow, github actions workflow, gitlab ci job, commit-msg hook, relizy init --yes
category: CLI Reference
tags: [cli, init, setup, configuration, ci-cd, commitlint]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
npx relizy init [options]
```

## What It Does

`init` reads your repository, asks only what it cannot guess, shows the changes it will make, and applies them once confirmed.

### Detected for you

- **Packages**: the package globs of your workspace (`pnpm-workspace.yaml`, the `workspaces` of the `package.json` for npm, yarn and bun, `lerna.json`, `rush.json`, `deno.json`), and the `package.json` of each folder they match: name, version and `private` flag. Without a workspace config, the project is a single package.
- **Apps without version**: added to `monorepo.ignored`, Relizy only releases versioned packages.
- **Package manager**: the `packageManager` field, then the lockfile.
- **Git provider**: GitHub, GitLab or other, from the `origin` remote. For the others, the provider releases and the PR comments are turned off, and no workflow is offered.
- **Build command**: a `build` script becomes `publish.buildCmd`.
- **Publish settings**: `publishConfig.access` and `publishConfig.registry` of the packages, the defaults of the advanced options.
- **Existing config**: a `relizy.config.*` file or a `relizy` key in the `package.json`.

### Asked to you

Every question has a default deduced from the repository. When a config already exists, `init` first offers to keep it and set up the rest (the default), to replace it, or to cancel: a kept config skips the questions 1 to 4, and the workflow takes its secrets from it.

1. **What a release does**: publish to npm, or only version the project (bump, changelog, tag, provider release). Private packages are suggested for versioning only.
2. **Folders to release** (monorepo with several workspace globs): the globs with publishable packages are checked.
3. **Version mode** (monorepo): `independent` when the packages are already on different versions, `selective` otherwise. See [version modes](./../guide/version-modes.md).
4. **Advanced options** (optional): dependency bumps, `0.x` breaking changes, root changelog, listed commit types, changelog format command, npm access, registry, build command, Twitter and Slack posts, PR comment mode and AI rewrites.
5. **Commit linting**: install the `commit-msg` hook running [`relizy commitlint`](./../commitlint/cli.md) (in `.husky/` when husky is set up).
6. **AI agents** (only when the project already uses one: `CLAUDE.md`, `AGENTS.md`, `.cursor/`...): give them the relizy rules and the [relizy MCP server](./../guide/ai-agents.md), as [`relizy mcp init`](./mcp.md#relizy-mcp-init) does.
7. **Release script**: add `"release": "relizy release"` to the `package.json`, when it has no `release` script.
8. **Release workflow** (GitHub or GitLab): generate the workflow releasing from the CI, run on demand or at each push on the default branch. See [Release workflow](#release-workflow).

Then `init` shows the config and the list of changes (files created or replaced, `package.json` updates, hook, workflow, AI agents), and asks for a single confirmation.

When the root `package.json` has no `name` or `version`, they are part of these changes: Relizy reads both. In `unified` and `selective` modes, the version is the highest version of the packages, the shared version bumped at each release. In `independent` mode, it is `0.0.0` and never bumped.

The config only contains the values that differ from the defaults:

```ts
import { defineConfig } from 'relizy'

// All the options: https://relizy.dev/config/overview
export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*'],
    ignored: ['packages/docs'],
  },
  publish: {
    buildCmd: 'pnpm run build',
  },
})
```

At the end, `init` prints the next steps: install Relizy when it is not a dependency yet, preview the release, the `include:` to add on GitLab, and the secrets (GitHub) or CI/CD variables (GitLab) to create.

### Release workflow

On GitHub, `init` writes `.github/workflows/release.yml`:

- run on demand from the Actions tab with a release type (`auto` follows the commits, or `patch`, `minor`, `major`), or at each push on the default branch;
- one release at a time (`concurrency: release`), and the permissions it needs: `contents: write` for the release commit, the tags and the GitHub release, `pull-requests: write` and `issues: write` for the [PR comment](./../guide/pr-comment.md);
- the [relizy action](./../guide/github-actions.md#the-relizy-action) `relizy/action@v2`, which sets up your package manager and Node version (`.nvmrc` or `.node-version`), installs from the lockfile and runs `relizy release --yes`, with only the secrets your config needs; or, when you choose the relizy CLI, [these steps written out](./../guide/github-actions.md#the-relizy-action) in the workflow;
- a step reading the [outputs](./../config/release.md#report) of the release.

On GitLab, `init` writes the `release` job in `.gitlab-ci.yml`, or in `.gitlab/ci/relizy.yml` when the project already has one (your file is not changed, `init` prints the `include:` to add):

- on gitlab.com, the [relizy component](./../guide/gitlab-ci.md#the-relizy-component) `gitlab.com/relizy/relizy/release@2` of the CI/CD catalog, or the same job written out when you choose the relizy CLI; on a self-managed instance, always the job written out;
- a manual job on the default branch with a `RELEASE_TYPE` variable, or a job at each push, never run on the release commit it pushes;
- corepack (pnpm, Yarn) or Bun, the install of the dependencies, the `claude` CLI for the AI rewrites, `relizy release --yes --report-dotenv relizy.env`;
- the outputs of the release as a `dotenv` artifact (`RELIZY_RELEASED`, `RELIZY_VERSION`, `RELIZY_TAGS`...), for the next jobs.

`init` also offers the [merge preview](./../guide/merge-preview.md) of the pull requests, on its own (yes by default, and with `--yes`), even when the release workflow is not generated or already exists: `.github/workflows/merge-preview.yml` on GitHub, which runs the action with `merge-preview: true` (`relizy merge-preview`) on the pull requests into the default branch; the `merge-preview` component (or its job written out) in the same file on GitLab. It comments what the merge releases and sets the commit status `relizy/merge-preview`.

`init` asks how the CI runs relizy (on GitHub and gitlab.com): with the relizy action or component (the default, and with `--yes`), or with the relizy CLI, whose steps are written out in the workflow. The choice applies to the release and to the merge preview.

The generated files are explained in [GitHub Actions](./../guide/github-actions.md) and [GitLab CI](./../guide/gitlab-ci.md). An existing workflow file is only replaced once confirmed.

## Options

### --yes

Accept the detected values without asking, for scripts and AI agents:

```bash
npx relizy init --yes
```

The advanced options are skipped, the `commit-msg` hook is installed (an existing hook is kept), the `release` script is added, the AI agents detected in the project are set up, and the release workflow is written, run on demand (an existing one is kept). An existing config is kept, and the other steps follow it. `init` also runs without questions when there is no terminal, or in CI.

### --force

Replace an existing config file. Without it, `init` asks whether to keep it, or keeps it when it runs without questions (`--yes`, no terminal, CI), and sets up the rest:

```bash
npx relizy init --yes --force
```

A config file in another format (`relizy.config.js`...) is removed, so it does not take precedence over the new `relizy.config.ts`.

### --no-workflow

Do not offer the workflows of the CI, the release and the merge preview:

```bash
npx relizy init --yes --no-workflow
```

### --only

Only run these steps, comma-separated: `config`, `commitlint` (the commit-msg hook), `scripts` (the `release` script), `agents` (the AI agents), `workflow` (the release workflow) and `merge-preview` (the merge preview workflow). Without `config`, the existing config is kept without asking, and `init` fails when the project has none. To add the merge preview to a project already set up:

```bash
npx relizy init --only merge-preview
# The same
npx relizy merge-preview init
```

### --dry-run

Print the config and the release workflow without writing anything:

```bash
npx relizy init --dry-run
```

### --config

Name of the config file, without `.config.ts`:

```bash
npx relizy init --config relizy.standalone
# Writes relizy.standalone.config.ts
```

See [--config](./commands.md#global-options).

## Next Steps

- Preview your next release: `npx relizy release --dry-run`
- Fine-tune the config: [configuration overview](./../config/overview.md)
- Release from your CI: [CI/CD](./../guide/ci-cd.md)
