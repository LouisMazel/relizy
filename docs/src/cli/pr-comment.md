---
title: pr-comment
description: Post release information as a comment on your pull request or merge request.
keywords: relizy pr-comment, pr comment cli, pull request comment, merge request comment, release comment, automated pr comment
category: CLI Reference
tags: [cli, pr-comment, pull-request, merge-request, github, gitlab, automation]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy pr-comment [options]
```

## What It Does

The `pr-comment` command posts release information as a comment on your PR/MR:

1. Loads your Relizy configuration
2. Detects the current PR/MR from the git branch (or uses `--pr-number`)
3. Reads package information from disk (standalone mode)
4. Builds a formatted comment with release details
5. Posts the comment to the PR/MR via the provider's API

## Options

### --pr-number

Override the auto-detected PR/MR number:

```bash
relizy pr-comment --pr-number 42
```

Useful in CI/CD where the PR number is available as an environment variable.

### --dry-run

Preview the comment without posting:

```bash
relizy pr-comment --dry-run
```

This will:

- Detect the PR/MR
- Generate the comment
- Log what would be posted
- NOT make any API calls

### --config

Use a different configuration file:

```bash
relizy pr-comment --config relizy.production
```

This will load `relizy.production.config.ts` instead of `relizy.config.ts`.

### --log-level

Control logging verbosity:

```bash
relizy pr-comment --log-level debug
```

Available levels:

- `silent` - No output
- `error` - Errors only
- `warn` - Warnings and errors
- `log` - Standard logs
- `info` - Informational messages (default)
- `debug` - Detailed debugging information
- `verbose` - Maximum verbosity

## Examples

### Basic Usage

Post a comment on the PR associated with the current branch:

```bash
relizy pr-comment
```

### Dry Run

Preview the comment without posting:

```bash
relizy pr-comment --dry-run
```

Output:

```bash
[dry-run] Would post PR comment to #42:

## 🚀 Release Published

| Field   | Value          |
| ------- | -------------- |
| Version | 1.0.0 → 1.1.0 |
| Tags    | v1.1.0         |
...
```

### Override PR Number

Specify the PR/MR number manually:

```bash
relizy pr-comment --pr-number 42
```

### CI/CD Usage

In GitHub Actions:

```bash
relizy pr-comment --pr-number ${{ github.event.pull_request.number }}
```

In GitLab CI:

```bash
relizy pr-comment --pr-number $CI_MERGE_REQUEST_IID
```

## Configuration

Configure PR comment behavior in `relizy.config.ts`:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  prComment: {
    mode: 'append', // 'append' (default) or 'update'
  },
})
```

- **`append`** - Creates a new comment each time
- **`update`** - Updates the existing Relizy comment (uses a hidden marker to find it)

## Environment Variables

### GitHub

Set any of these environment variables for GitHub authentication:

```bash
export RELIZY_GITHUB_TOKEN="your-token"
export GITHUB_TOKEN="your-token"
export GH_TOKEN="your-token"
```

Token priority: `RELIZY_GITHUB_TOKEN` > `GITHUB_TOKEN` > `GH_TOKEN`

### GitLab

Set any of these environment variables for GitLab authentication:

```bash
export RELIZY_GITLAB_TOKEN="your-token"
export GITLAB_TOKEN="your-token"
export GITLAB_API_TOKEN="your-token"
export CI_JOB_TOKEN="your-token"
```

Token priority: `RELIZY_GITLAB_TOKEN` > `GITLAB_TOKEN` > `GITLAB_API_TOKEN` > `CI_JOB_TOKEN`

## CI/CD Integration

### GitHub Actions

```yaml
name: Release with PR Comment

on:
  pull_request:
    types: [closed]
    branches:
      - main

jobs:
  release:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
      pull-requests: write # Required for PR comments

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Release
        run: relizy release --patch --yes --pr-number ${{ github.event.pull_request.number }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

::: warning
The `pull-requests: write` permission is required for posting PR comments with `GITHUB_TOKEN`.
:::

### GitLab CI

```yaml
release:
  image: node:20
  stage: deploy
  when: manual
  script:
    - npm ci
    - git config user.name "GitLab CI"
    - git config user.email "ci@gitlab.com"
    - relizy release --patch --yes --pr-number $CI_MERGE_REQUEST_IID
  variables:
    GITLAB_TOKEN: $CI_JOB_TOKEN
    NODE_AUTH_TOKEN: $NPM_TOKEN
  only:
    - merge_requests
```

::: tip
In GitLab CI, `CI_MERGE_REQUEST_IID` is automatically available in merge request pipelines. Use `CI_JOB_TOKEN` for authentication — it has permission to comment on merge requests.
:::

## Integration with release Command

The `pr-comment` command is automatically run as part of the `release` workflow when enabled:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    prComment: true, // Enabled by default
  },
  prComment: {
    mode: 'update', // Optional: use update mode
  },
})
```

Then:

```bash
relizy release --patch --yes
```

This will run the complete workflow including posting a PR comment.

To skip PR commenting during release:

```bash
relizy release --patch --no-pr-comment
```

## See Also

- [release](/cli/release) - Full release workflow (includes PR comment)
- [Configuration reference](../config/pr-comment.md) - PR comment configuration
- [API reference](../api/pr-comment.md) - Programmatic usage
- [PR Comments Guide](../guide/pr-comment.md) - General overview
- [GitHub Actions Guide](../guide/github-actions.md) - GitHub Actions setup
- [GitLab CI Guide](../guide/gitlab-ci.md) - GitLab CI setup
