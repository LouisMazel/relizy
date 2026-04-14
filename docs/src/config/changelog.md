---
title: Changelog Configuration
description: Customize changelog generation.
keywords: changelog config, commit types, changelog customization, conventional commits, changelog format
category: Configuration
tags: [config, changelog, commits, documentation]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Changelog Config Options

### formatCmd

Command to format the changelog after generation (e.g., with Prettier):

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  changelog: {
    formatCmd: 'prettier --write CHANGELOG.md',
  },
})
```

### rootChangelog

Generate a changelog at root level that contains all changes from all packages:

- **Type:** `boolean`
- **Default:** `true`

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  changelog: {
    rootChangelog: true,
  },
})
```

### includeCommitBody

Include the commit body in the changelog entries:

- **Type:** `boolean`
- **Default:** `true`

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  changelog: {
    includeCommitBody: true,
  },
})
```

## Changelog Title Template

Customize the title used for each changelog section. By default, it shows `v1.0.0...v1.1.0`.

- **Config key:** `templates.changelogTitle`
- **Type:** `string`
- **Default:** <code v-pre>'{{oldVersion}}...{{newVersion}}'</code>

### Available Variables

| Variable                          | Description                      | Example      |
| --------------------------------- | -------------------------------- | ------------ |
| <code v-pre>{{oldVersion}}</code> | Previous version tag (from)      | `v1.0.0`     |
| <code v-pre>{{newVersion}}</code> | New version tag (to)             | `v1.1.0`     |
| <code v-pre>{{date}}</code>       | Today's date (YYYY-MM-DD format) | `2026-03-14` |

### Examples

Show only the new version:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  templates: {
    changelogTitle: '{{newVersion}}',
  },
})
```

This produces:

```md
## v1.1.0
```

Include the date:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  templates: {
    changelogTitle: '{{newVersion}} ({{date}})',
  },
})
```

This produces:

```md
## v1.1.0 (2026-03-14)
```

### Complete Changelog Config Example

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  changelog: {
    formatCmd: 'prettier --write CHANGELOG.md',
    rootChangelog: true,
    includeCommitBody: true,
  },
})
```

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
