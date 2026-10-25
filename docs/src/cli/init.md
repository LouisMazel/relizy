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

Before writing anything, `init` shows the generated config and the list of changes (files created, `package.json` updates, hook), and asks for a single confirmation.

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

At the end, `init` prints the next steps: installing Relizy if it is not a dependency yet, and the environment variables to set in your CI (npm, GitHub or GitLab, Twitter, Slack and AI tokens, depending on your answers).

## Options

### --yes

Accept the detected values without asking. Useful in scripts and for AI agents:

```bash
npx relizy init --yes
```

The advanced options are skipped, the `commit-msg` hook is installed (an existing hook is kept) and the `release` script is added. The command also runs without questions when there is no terminal or in CI.

### --force

Replace an existing config file. Without it, `init` asks for confirmation, or fails with `--yes`:

```bash
npx relizy init --yes --force
```

A config file in another format (e.g. `relizy.config.js`) is removed so it does not take precedence over the new `relizy.config.ts`.

### --dry-run

Print the config without writing anything:

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
