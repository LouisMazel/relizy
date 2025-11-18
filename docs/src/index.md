---
layout: home
title: Relizy - Seamless and automated release manager
description: Automated version bumping, changelog generation, and publishing for monorepos and single packages. Built-in support for GitHub, GitLab, and npm, pnpm, yarn, and bun.
keywords: relizy, release manager, monorepo tool, version management, automated releases, npm publishing, changelog generator, semantic versioning, conventional commits, github releases, gitlab releases, ci cd automation
category: Home
tags: [relizy, release-automation, monorepo, npm, changelog, semver]

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
    link: /cli/bump
  - icon: 🎯
    title: Git Provider Integration
    details: Native support for GitHub and GitLab releases. Creates tagged releases with changelogs automatically on your preferred platform.
    link: /cli/provider-release
  - icon: 📤
    title: NPM Publishing
    details: Seamlessly publish packages to npm with automatic registry authentication. Handles both public and private registries.
    link: /cli/publish
  - icon: ⚡
    title: CI/CD Ready
    details: Perfect for automation pipelines. Works seamlessly with GitHub Actions, GitLab CI, and any CI/CD platform.
    link: /guide/ci-cd
  - icon: 🛠️
    title: CLI & Programmatic API
    details: Use it from the command line or integrate into your scripts. Flexible API for advanced workflows and custom automation.
  - icon: 🎨
    title: Multiple Configs
    details: Support for multiple configuration files per project. Perfect for different release strategies or separate monorepo workflows.
    link: /config/multiple-configs
  - icon: 📚
    title: Hooks
    details: Execute custom scripts at specific stages of the release workflow.
    link: /config/hooks
---

## Why Relizy?

Managing releases in modern JavaScript projects, especially monorepos, can be tedious and error-prone. Relizy automates the entire release workflow so you can focus on building features.

**Perfect for:**

- 📦 Monorepos with multiple packages
- 🎯 Single package projects
- 🤖 Automated CI/CD pipelines
- 👥 Teams following Conventional Commits

Relizy brings powerful release automation with a delightful developer experience.

## Run your first release

::: code-group

```bash [pnpm]
pnpm dlx relizy release
```

```bash [npm]
npx relizy release
```

```bash [yarn]
yarn dlx relizy release
```

```bash [bun]
bunx relizy release
```

:::

That's it! Relizy will:

- ✅ Bump the version in package.json
- ✅ Generate a beautiful changelog
- ✅ Create a git commit and tag
- ✅ Publish to npm
- ✅ Create a GitHub or GitLab release

<br />

---

<br />

<div style="display: flex; justify-content: center;">
  <RelizyTerminal />
</div>

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
