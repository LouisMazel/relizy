---
title: init
description: Create the Relizy config of your project in a few questions, everything else is detected.
keywords: relizy init, relizy setup, create relizy config, relizy.config.ts, relizy wizard, monorepo setup
category: CLI Reference
tags: [cli, init, setup, configuration, commitlint]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
npx relizy init [options]
```

## What It Does

The `init` command reads your repository, asks only what it cannot guess, shows the changes it will make, then writes a minimal `relizy.config.ts`.

### Detected for you

- **Packages**: Relizy does not scan the whole repository. It reads the package globs declared by your workspace (`pnpm-workspace.yaml`, the `workspaces` of the `package.json` for npm, yarn and bun, `lerna.json`, `rush.json`, `deno.json`), lists the folders they match, and reads the `package.json` of each one: name, version and `private` flag. Without a workspace config, the project is a single package
- **Apps without version**: added to `monorepo.ignored`, Relizy only releases versioned packages
- **Package manager**: `packageManager` field, then the lockfile
- **Git provider**: GitHub, GitLab or other, from the `origin` remote (provider releases and PR comments are turned off for the others)
- **Build command**: a `build` script becomes `publish.buildCmd`
- **Publish settings**: `publishConfig.access` and `publishConfig.registry` of the packages, used as defaults in the advanced mode
- **Existing config**: a `relizy.config.*` file or a `relizy` key in the `package.json`

### Asked to you

Every question comes with a default deduced from the repository:

1. **What to release**: publish packages to npm, or only version the project (bump, changelog, tag, provider release). Private packages are suggested for versioning only.
2. **Folders to release** (monorepo with several workspace globs): the globs with publishable packages are checked.
3. **Version mode** (monorepo): `independent` when the packages are already on different versions, `selective` otherwise. See [version modes](/guide/version-modes).
4. **Advanced options** (optional): dependency bumps, `0.x` breaking changes, root changelog, hidden commit types, changelog format command, npm access, registry, build command, Twitter and Slack announcements, PR comment mode and AI release notes.
5. **Commit linting**: install the `commit-msg` hook running [`relizy commitlint`](/commitlint/cli) (in `.husky/` when husky is set up).
6. **Release script**: add `"release": "relizy release"` to the `package.json`.
7. **AI agents** (only when the project already uses one: `CLAUDE.md`, `AGENTS.md`, `.cursor/`...): give them the relizy rules and the [relizy MCP server](/guide/ai-agents), as [`relizy mcp init`](/cli/mcp#relizy-mcp-init) does.
8. **Release workflow** (GitHub or GitLab): generate the workflow releasing from the CI, run on demand (choosing the release type) or at each push on the default branch. See [release workflow](#release-workflow).

Before writing anything, `init` shows the generated config and the list of changes (files created, `package.json` updates, hook, AI agents), and asks for a single confirmation.

When the root `package.json` has no `name` or `version`, they are part of these changes: Relizy reads both. In `unified` and `selective` modes, the version is the highest version of the packages, the shared version bumped at each release. In `independent` mode, it is `0.0.0` and never bumped.

The generated file only contains the values that differ from the defaults:

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

At the end, `init` prints the next steps: installing Relizy if it is not a dependency yet, and the secrets (GitHub) or CI/CD variables (GitLab) to create (npm, GitLab, Twitter, Slack and AI tokens, depending on your answers).

### Release workflow

On GitHub, `init` writes `.github/workflows/release.yml`:

- run on demand from the Actions tab, with a release type (`auto` follows the commits, or `patch`, `minor`, `major`), or at each push on the default branch;
- the permissions it needs: `contents: write` for the release commit, the tags and the GitHub release, `pull-requests: write` for the [PR comment](/guide/pr-comment);
- the full history (`fetch-depth: 0`), your package manager and Node version (`.nvmrc` or `.node-version`), the install from the lockfile;
- `relizy release --yes`, with only the secrets your config needs, then a step reading the [outputs](/config/release#report) of the release.

On GitLab, `init` writes the `release` job in `.gitlab-ci.yml`, or in `.gitlab/ci/relizy.yml` when the project already has one (it prints the `include:` to add, your file is not changed):

- a manual job on the default branch with a `RELEASE_TYPE` variable, or a job at each push, never run on the release commit it pushes;
- the full history (`GIT_DEPTH: 0`), the install of the dependencies;
- the outputs of the release as a `dotenv` artifact (`RELIZY_RELEASED`, `RELIZY_VERSION`, `RELIZY_TAGS`...), for the next jobs.

An existing workflow file is only replaced once confirmed. Relizy handles the rest in CI (shallow clone, detached HEAD, git identity, push): see [CI/CD](/guide/ci-cd#what-relizy-handles-in-ci).

## Options

### --yes

Accept the detected values without asking. Useful in scripts and for AI agents:

```bash
npx relizy init --yes
```

The advanced options are skipped, the `commit-msg` hook is installed (an existing hook is kept), the `release` script is added, the AI agents detected in the project are set up and the release workflow is written, run on demand (an existing one is kept). The command also runs without questions when there is no terminal or in CI.

### --force

Replace an existing config file. Without it, `init` asks for confirmation, or fails with `--yes`:

```bash
npx relizy init --yes --force
```

A config file in another format (e.g. `relizy.config.js`) is removed so it does not take precedence over the new `relizy.config.ts`.

### --no-workflow

Do not offer the release workflow of the CI:

```bash
npx relizy init --yes --no-workflow
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

See [multiple configs](/config/multiple-configs).

## Next Steps

- Preview your next release: `npx relizy release --dry-run`
- Fine-tune the config: [configuration overview](/config/overview)
- Set up your CI: [GitHub Actions](/guide/github-actions) or [GitLab CI](/guide/gitlab-ci)
