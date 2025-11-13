---
title: Changelog Configuration
description: Customize changelog generation.
keywords: changelog config, commit types, changelog customization, conventional commits, changelog format
category: Configuration
tags: [config, changelog, commits, documentation]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Commit Types

Customize how commit types appear in changelogs:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  types: {
    feat: { title: '🎉 New Features', semver: 'minor' },
    fix: { title: '🔧 Bug Fixes', semver: 'patch' },
    perf: { title: '⚡ Performance', semver: 'patch' },
    docs: { title: '📖 Documentation', semver: 'patch' },
    style: { title: '💄 Styling', semver: 'patch' },
    refactor: { title: '🔨 Refactors', semver: 'patch' },
    test: { title: '🧪 Tests' },
    ci: { title: '🤖 CI/CD' },
    chore: { title: '🧹 Chores' },
    build: false,
  },
})
```

## Exclude Authors

Filter out commits from specific authors:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  excludeAuthors: [
    'dependabot[bot]',
    'renovate[bot]',
    'github-actions[bot]',
  ],
})
```

## Repository URLs

Set custom GitHub/GitLab URLs:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  repo: {
    domain: 'github.com',
    repo: 'user/repo',
    provider: 'github',
    token: process.env.GITHUB_TOKEN,
  },
})
```

## Complete Example

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  types: {
    feat: { title: '✨ Features', semver: 'minor' },
    fix: { title: '🐛 Fixes', semver: 'patch' },
  },
  excludeAuthors: ['dependabot[bot]'],
  repo: {
    domain: 'github.com',
    repo: 'user/repo',
    provider: 'github',
    token: process.env.GITHUB_TOKEN,
  },
})
```
