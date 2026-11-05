---
title: PR Comments
description: Automatically post release information as comments on your pull requests and merge requests with Relizy.
keywords: pr comment, pull request comment, merge request comment, release notification, github pr, gitlab mr, relizy pr comment
category: Guide
tags: [pr-comment, github, gitlab, pull-request, merge-request, automation, notifications]
---

# PR Comments

Relizy can automatically post a comment on your pull request or merge request with release information after running `relizy release`. This keeps your team informed about what was released directly in the PR/MR where the work happened.

## How It Works

When you run the `release` command (or use the standalone `pr-comment` command), Relizy will:

1. 🔍 Detect the current PR/MR from the git branch
2. 📝 Build a comment with release information
3. 💬 Post it as a comment on the PR/MR

PR comment posting is part of the release workflow and runs after:

- Version bumping
- Changelog generation
- Git commit and tag creation
- Provider release (GitHub/GitLab)
- npm publishing
- Social media posting

## Comment Statuses

Relizy generates different comments depending on the release outcome:

### ✅ Success

With `relizy release`, the comment is the **summary of the release**, as at the end of the terminal output and in the summary of the GitHub Actions run (see [`release.report`](/config/release#report)):

- The versions and tags
- What the release contains: features, fixes, breaking changes, contributors
- Each step and what it did, with the links of what it created: the npm pages (with the dist-tag and the registry), the GitHub or GitLab releases, the tweet
- The AI rewrites, the install command
- The package table with version transitions (private packages are listed when [`monorepo.includePrivates`](/config/monorepo#includeprivates) is enabled). With several [version groups](/guide/version-groups) released, one table per group, titled with its `title`, its version and its version mode, the `unified`/`selective` group first

::: info Projects that publish nothing
The install command is only shown for packages that are actually published: it is omitted when `release.publish` is `false`, and never shown for private packages. See [Private Projects & Apps](/guide/private-projects).
:::

Example:

```markdown
## 🚀 Released relizy 2.0.0

|                         |                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| **Version**             | `2.0.0`                                                                                    |
| **Tag**                 | `v2.0.0`                                                                                   |
| **Content**             | 11 features · 7 fixes · 7 breaking · 2 contributors                                        |
| ✅ **Changelog**        | done                                                                                       |
| ✅ **Publish**          | [relizy@2.0.0](https://www.npmjs.com/package/relizy/v/2.0.0) · latest · registry.npmjs.org |
| ✅ **Commit and tags**  | a1b2c3d · v2.0.0                                                                           |
| ✅ **Push**             | main → origin/main                                                                         |
| ✅ **Provider release** | 1 release on github<br>[v2.0.0](https://github.com/LouisMazel/relizy/releases/tag/v2.0.0)  |
| ✨ **AI**               | 1 rewrite by claude-code in 27.4s · 8.2k tokens · $0.031                                   |
| **Install**             | `pnpm add relizy@2.0.0`                                                                    |

### Packages

| Package  | Version            |
| -------- | ------------------ |
| `relizy` | `1.14.3` → `2.0.0` |
```

With version groups, one table per group:

```markdown
### maz-ui `5.2.1` (selective)

| Package       | Version           |
| ------------- | ----------------- |
| `maz-ui`      | `5.2.0` → `5.2.1` |
| `@maz-ui/mcp` | `5.2.0` → `5.2.1` |

### Tooling (independent)

| Package                 | Version           |
| ----------------------- | ----------------- |
| `@maz-ui/eslint-config` | `5.0.0` → `5.1.0` |
```

`relizy pr-comment` on its own (without a release) comments the versions, the tags, the dist-tag and the install commands of the packages.

### ℹ️ No Release

When no qualifying commits exist (nothing to release):

```markdown
## ℹ️ Nothing to release

No commit since the last release triggers a new version.
```

### ❌ Failed

When the release fails, the error and the steps done before it:

```markdown
## ❌ Release failed

> Failed to publish to npm
```

## Comment Modes

Relizy supports two comment modes:

### Append Mode

In `append` mode, Relizy creates a **new comment** each time. This is useful when you want a full history of release attempts on the PR.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  prComment: {
    mode: 'append',
  },
})
```

### Update Mode (Default)

In `update` mode, Relizy **finds and updates** an existing comment instead of creating a new one. It uses a hidden HTML marker (`<!-- relizy-pr-comment -->`) to identify its previous comment.

If no previous comment is found, it creates a new one.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  prComment: {
    mode: 'update',
  },
})
```

::: tip
`update` is the default: only one Relizy comment ever appears on the PR. Use `append` to keep a comment per release attempt.
:::

## Supported Providers

| Provider | API         | Enterprise/Self-hosted |
| -------- | ----------- | ---------------------- |
| GitHub   | REST API v3 | ✅ Supported           |
| GitLab   | API v4      | ✅ Supported           |

Relizy automatically detects the provider from your git remote URL.

## PR Detection

Relizy auto-detects the PR/MR number from the current git branch by querying the provider's API. You can also manually specify the PR number:

```bash
# Auto-detect PR from current branch
relizy pr-comment

# Manually specify PR number
relizy pr-comment --pr-number 42
```

::: tip
In CI/CD environments like GitHub Actions, you can pass the PR number from the environment:

```bash
relizy release --patch --yes --pr-number ${{ github.event.pull_request.number }}
```

:::

## Standalone vs Release Integration

### As Part of Release Workflow

PR commenting is **enabled by default** in the release workflow. Just run:

```bash
relizy release --patch
```

To disable it:

```bash
relizy release --patch --no-pr-comment
```

Or in your config:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    prComment: false,
  },
})
```

### Standalone Command

You can also post PR comments independently:

```bash
# Post a PR comment about the current state
relizy pr-comment

# Preview without posting
relizy pr-comment --dry-run
```

## Authentication

PR comments use the same tokens as provider releases:

### GitHub

```bash
# Any of these (checked in order):
export RELIZY_GITHUB_TOKEN="your-token"
export GITHUB_TOKEN="your-token"
export GH_TOKEN="your-token"
```

Required token scope: `pull-requests: write` (or `repo` for classic tokens).

### GitLab

```bash
# Any of these (checked in order):
export RELIZY_GITLAB_TOKEN="your-token"
export GITLAB_TOKEN="your-token"
export GITLAB_API_TOKEN="your-token"
export CI_JOB_TOKEN="your-token"  # Available in GitLab CI
```

## Dry Run

Preview the comment without posting:

```bash
relizy pr-comment --dry-run
```

This will:

- Detect the PR/MR
- Generate the comment body
- Log what would be posted
- **NOT** make any API calls

## Quick Setup

No additional configuration is needed! PR commenting works out of the box when a GitHub/GitLab token is available and the command is run from a branch with an open PR/MR.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  // PR comment is enabled by default in release workflow
  // Customize if needed:
  prComment: {
    mode: 'update', // or 'append'
  },
})
```

## Learn More

- [PR Comment CLI Reference](/cli/pr-comment)
- [PR Comment Configuration](/config/pr-comment)
- [PR Comment API](/api/pr-comment)
- [Release Configuration](/config/release)
- [GitHub Actions Guide](/guide/github-actions)
- [GitLab CI Guide](/guide/gitlab-ci)
