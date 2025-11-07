---
layout: home

hero:
  name: Relizy
  text: Seamless and automated release manager
  tagline: Automated version bumping, changelog generation, and publishing for monorepos and single packages
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/LouisMazel/relizy
  image:
    src: https://raw.githubusercontent.com/LouisMazel/relizy/refs/heads/main/resources/logo.svg
    alt: Relizy Logo

features:
  - icon: 🚀
    title: Zero Configuration
    details: Works out of the box with sensible defaults. Get started in seconds with a single command, no complex setup required.
    link: /guide/getting-started
  - icon: 📦
    title: Monorepo Support
    details: Built-in support for monorepos with three versioning strategies (unified, selective, independent) and smart dependency management.
    link: /config/overview
  - icon: 📝
    title: Beautiful Changelogs
    details: Automatically generates elegant changelogs from Conventional Commits using changelogen. Markdown formatted and SEO-friendly.
    link: /guide/changelog
  - icon: 🔄
    title: Smart Version Bumping
    details: Intelligent semantic versioning based on commit types. Automatically bumps dependent packages in monorepos to keep everything in sync.
  - icon: 🎯
    title: Git Provider Integration
    details: Native support for GitHub and GitLab releases. Creates tagged releases with changelogs automatically on your preferred platform.
  - icon: 📤
    title: NPM Publishing
    details: Seamlessly publish packages to npm with automatic registry authentication. Handles both public and private registries.
  - icon: ⚡
    title: CI/CD Ready
    details: Perfect for automation pipelines. Works seamlessly with GitHub Actions, GitLab CI, and any CI/CD platform.
  - icon: 🛠️
    title: CLI & Programmatic API
    details: Use it from the command line or integrate into your scripts. Flexible API for advanced workflows and custom automation.
  - icon: 🎨
    title: Multiple Configs
    details: Support for multiple configuration files per project. Perfect for different release strategies or separate monorepo workflows.
---

## Quick Start

Install Relizy in your project:

::: code-group

```bash [npm]
npm install -D relizy
```

```bash [pnpm]
pnpm add -D relizy
```

```bash [yarn]
yarn add -D relizy
```

```bash [bun]
bun add -D relizy
```

:::

Run your first release:

```bash
relizy release
```

That's it! Relizy will:

- ✅ Bump the version in package.json
- ✅ Generate a beautiful changelog
- ✅ Create a git commit and tag
- ✅ Publish to npm (if configured)
- ✅ Create a GitHub/GitLab release (if configured)

## Why Relizy?

Managing releases in modern JavaScript projects—especially monorepos—can be tedious and error-prone. Relizy automates the entire release workflow so you can focus on building features.

**Perfect for:**

- 📦 Monorepos with multiple packages
- 🎯 Single package projects
- 🤖 Automated CI/CD pipelines
- 👥 Teams following Conventional Commits

Built on top of the battle-tested [changelogen](https://github.com/unjs/changelogen) library, Relizy brings powerful release automation with a delightful developer experience.

## Team

<VPTeamMembers size="small" :members />

<script setup>
import { VPTeamMembers } from 'vitepress/theme'

const members = [
  {
    avatar: 'https://www.github.com/LouisMazel.png',
    name: 'Louis Mazel',
    title: 'Creator',
    links: [
      { icon: 'github', link: 'https://github.com/LouisMazel' },
      { icon: 'twitter', link: 'https://twitter.com/mazeel' },
    ]
  },
]
</script>
