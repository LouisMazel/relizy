---
title: PR Comment Configuration
description: Configure automatic PR/MR comment posting with release information.
keywords: pr comment config, pull request comment config, merge request comment config, release comment settings, pr comment mode
category: Configuration
tags: [config, pr-comment, pull-request, merge-request, automation]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Overview

The `prComment` configuration controls how Relizy posts release information as comments on your pull requests and merge requests. It supports both GitHub and GitLab, with two comment modes.

## Configuration Structure

```ts
interface PrCommentConfig {
  /**
   * PR comment mode
   * - 'append': Create a new comment each time
   * - 'update': Find and update an existing comment
   * @default 'append'
   */
  mode?: 'append' | 'update'
}
```

## mode

- **Type:** `'append' | 'update'`
- **Default:** `'append'`

Controls how Relizy manages comments on the PR/MR.

### Append Mode

Creates a **new comment** each time. This preserves a history of all release attempts on the PR:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  prComment: {
    mode: 'append',
  },
})
```

### Update Mode

**Finds and updates** the existing Relizy comment instead of creating a new one. Uses a hidden HTML marker (`<!-- relizy-pr-comment -->`) to identify the previous comment:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  prComment: {
    mode: 'update',
  },
})
```

If no previous comment is found, a new one is created.

::: tip
Use `update` mode in CI/CD pipelines to keep your PRs clean — only one Relizy comment will ever appear on the PR.
:::

## release.prComment

- **Type:** `boolean`
- **Default:** `true`

Enable or disable PR comment posting in the release workflow:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    prComment: true, // Enable PR commenting in release workflow (default)
  },
})
```

To disable:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    prComment: false, // Disable PR commenting in release workflow
  },
})
```

Or use the CLI flag:

```bash
relizy release --patch --no-pr-comment
```

## Complete Examples

### Append Mode (Default)

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  prComment: {
    mode: 'append',
  },
  release: {
    prComment: true,
  },
})
```

### Update Mode

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  prComment: {
    mode: 'update',
  },
  release: {
    prComment: true,
  },
})
```

### Disabled

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    prComment: false,
  },
})
```

## Authentication

PR comments use the same tokens as provider releases. No additional token configuration is needed:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  tokens: {
    github: process.env.GITHUB_TOKEN,
    // or
    gitlab: process.env.GITLAB_TOKEN,
  },
})
```

**Environment Variables:**

- GitHub: `RELIZY_GITHUB_TOKEN` or `GITHUB_TOKEN` or `GH_TOKEN`
- GitLab: `RELIZY_GITLAB_TOKEN` or `GITLAB_TOKEN` or `GITLAB_API_TOKEN` or `CI_JOB_TOKEN`

## Integration with Release Workflow

PR comment posting is automatically triggered when enabled in the `release` configuration:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    prComment: true,
  },
  prComment: {
    mode: 'update',
  },
})
```

Then run:

```bash
relizy release --patch
```

This will:

1. Bump version
2. Generate changelog
3. Create git commit and tag
4. Push to remote
5. Create GitHub/GitLab release
6. Publish to npm
7. Post to social media
8. **Post a comment on the PR/MR** 💬

## Standalone Usage

You can also post PR comments independently using the `pr-comment` command:

```bash
relizy pr-comment
```

See the [CLI reference](../cli/pr-comment.md) for more details.

## See Also

- [PR Comments Guide](../guide/pr-comment.md)
- [CLI Reference](../cli/pr-comment.md)
- [API Reference](../api/pr-comment.md)
- [Release Configuration](./release.md)
