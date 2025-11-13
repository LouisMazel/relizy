---
title: Installation
description: Get Relizy up and running in your project in seconds.
keywords: relizy installation, install relizy, npm install, pnpm install, setup relizy, relizy config
category: Guide
tags: [guide, installation, setup, configuration]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Prerequisites

- **Node.js** 20.x or higher
- **npm**, **pnpm**, **bun** or **yarn** package manager
- **Git** initialized in your project

## Install Relizy

Install Relizy as a development dependency:

::: code-group

```bash [pnpm]
pnpm add -D relizy
```

```bash [npm]
npm install -D relizy
```

```bash [yarn]
yarn add -D relizy
```

```bash [bun]
bun add -D relizy
```

:::

## Global Installation (Optional)

You can also install Relizy globally to use it across multiple projects:

::: code-group

```bash [pnpm]
pnpm add -g relizy
```

```bash [npm]
npm install -g relizy
```

```bash [yarn]
yarn global add relizy
```

:::

::: tip
For most projects, we recommend installing as a dev dependency rather than globally. This ensures everyone on your team uses the same version.
:::

## Verify Installation

Check that Relizy is installed correctly:

```bash
relizy --version
```

You should see the version number printed in the console.

## Add to Package Scripts (Recommended)

Add Relizy commands to your `package.json` scripts for convenience:

```json
{
  "scripts": {
    "release": "relizy release",
    "release:patch": "relizy release --patch",
    "release:minor": "relizy release --minor",
    "release:major": "relizy release --major"
  }
}
```

Now you can run releases with simple npm commands:

```bash
npm run release:patch
```

## Monorepo Setup

For monorepos, install Relizy in your root `package.json`:

```bash
# In the root of your monorepo
pnpm add -D relizy
```

Relizy will automatically detect packages based on your workspace configuration:

::: code-group

```yml [pnpm-workspace.yaml]
packages:
  - 'packages/*'
```

```json [package.json]
{
  "workspaces": [
    "packages/*"
  ]
}
```

:::

## Configuration File (Optional)

While Relizy works with zero configuration, you can create a config file for customization:

```bash
touch relizy.config.ts
```

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packageGlobs: ['packages/*'],
  },
})
```

::: tip
Configuration is completely optional. Start without a config file and add one only if you need custom behavior.
:::

## Environment Setup

### NPM Publishing

To publish to npm, ensure you're logged in:

```bash
npm login
```

Or set an NPM token in your environment:

```bash
export NODE_AUTH_TOKEN=your_token_here
```

Or use `.env` file

```bash
NODE_AUTH_TOKEN=your_token_here
```

### GitHub and GitLab Releases

Multiple ways to provide the token:

- Command line option (`--token`)
- Configuration file (see [tokens](../config/overview.md#environment-variables) section)
- Environment variables (checked in order):
  - **GitHub:** `RELIZY_GITHUB_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`
  - **GitLab:** `RELIZY_GITLAB_TOKEN`, `GITLAB_TOKEN`, `GITLAB_API_TOKEN`, `CI_JOB_TOKEN`

### CI/CD Integration

For GitHub releases, create a personal access token:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Create a token with `repo` scope
3. Set the token in your environment:

```bash
export RELIZY_GITHUB_TOKEN=your_github_token
```

Or use `.env` file

```bash
RELIZY_GITHUB_TOKEN=your_github_token
```

### GitLab Releases

For GitLab releases, create a project access token:

1. Go to your GitLab project → Settings → Access Tokens
2. Create a token with `api` scope
3. Set the token in your environment:

```bash
export RELIZY_GITLAB_TOKEN=your_gitlab_token
```

Or use `.env` file

```bash
RELIZY_GITLAB_TOKEN=your_gitlab_token
```

::: info
These environment variables are only needed if you want to publish packages or create provider releases. They're not required for basic version bumping and changelog generation.
:::

## Next Steps

Now that Relizy is installed, learn how to use it:

- [Getting Started](getting-started.md) - Run your first release
- [CLI Commands](../cli/commands.md) - Learn about available commands
- [Configuration](../config/overview.md) - Customize Relizy's behavior
