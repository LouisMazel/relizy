---
title: Canary Releases
description: Publish temporary test versions from any branch to let your team try packages before a real release.
keywords: canary release, snapshot release, test version, pre-release testing, npm canary, ephemeral release, ci preview
category: Guide
tags: [guide, canary, snapshot, preview, testing, ci-cd]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## What Is a Canary Release?

A canary release is a **temporary, throwaway version** of your packages. Think of it like a "sneak peek" — you publish a version to npm so your team can install and test it, but it never becomes the official latest version.

For example, if your current version is `1.2.3` and you have a `feat` commit, a canary release would produce something like:

```
1.3.0-canary.a3f4b2c.0
```

This version:

- Can be installed with `npm install my-package@canary`
- Does **not** replace the `latest` tag on npm
- Does **not** create any git commits, tags, or changelog entries
- Is perfect for testing changes in a pull request before merging

## When to Use Canary Releases

Canary releases are useful when:

- You want to **test a package from a PR** before merging it
- Your CI pipeline needs to **publish a preview version** for QA or integration testing
- You want teammates to try your changes without doing a full release
- You need a quick way to verify that a package works correctly when installed from npm

## Quick Start

Run a canary release with a single flag:

```bash
relizy release --canary
```

That's it! Relizy will:

1. Detect the next version from your commits (e.g., `feat` = minor bump)
2. Append a canary suffix with the current git commit SHA
3. Write the canary version to all package.json files
4. Publish to npm with the `canary` dist-tag

::: tip
A canary release asks you for confirmation before bumping, just like a normal release. Use `--yes` to skip the prompt in CI.
:::

## Version Format

The canary version format is:

```
{nextVersion}-{preid}.{sha}.0
```

| Part          | Description                                         | Example   |
| ------------- | --------------------------------------------------- | --------- |
| `nextVersion` | The next stable version, auto-detected from commits | `1.3.0`   |
| `preid`       | The prerelease identifier (default: `canary`)       | `canary`  |
| `sha`         | The first 7 characters of the current git commit    | `a3f4b2c` |
| `0`           | A counter (always `0` for canary)                   | `0`       |

### Examples

| Current Version | Commits          | Canary Version                               |
| --------------- | ---------------- | -------------------------------------------- |
| `1.2.3`         | `feat: ...`      | `1.3.0-canary.a3f4b2c.0`                     |
| `1.2.3`         | `fix: ...`       | `1.2.4-canary.a3f4b2c.0`                     |
| `1.2.3`         | `feat!: ...`     | `2.0.0-canary.a3f4b2c.0`                     |
| `1.2.3`         | No commits found | `1.2.4-canary.a3f4b2c.0` (defaults to patch) |
| `2.0.0-beta.1`  | `feat: ...`      | `2.0.0-canary.a3f4b2c.0`                     |

## What Canary Disables

When you use `--canary`, Relizy **automatically disables** several steps that don't make sense for a temporary release:

| Step                | Disabled? | Why                                         |
| ------------------- | --------- | ------------------------------------------- |
| Publish to npm      | **No**    | This is the main purpose of canary          |
| PR/MR comment       | **No**    | Useful to see the canary version in your PR |
| Safety checks       | **No**    | Still validates tokens and permissions      |
| Git clean check     | **No**    | Still checks for uncommitted changes        |
| Confirmation prompt | **No**    | Still asks for your approval                |
| Changelog           | Yes       | No changelog for a temporary version        |
| Git commit          | Yes       | No commit needed — nothing permanent        |
| Git tag             | Yes       | No tag needed — this version is ephemeral   |
| Git push            | Yes       | Nothing to push (no commit, no tag)         |
| Provider release    | Yes       | No GitHub/GitLab release for a test version |
| Social media        | Yes       | No announcement for a test version          |

::: info
You can still override any of these with CLI flags. For example, `--no-publish` would skip publishing even in canary mode, and `--no-pr-comment` would skip the PR comment.
:::

## Custom Preid

By default, the canary version uses `canary` as the prerelease identifier. You can change it:

```bash
# Use "snapshot" instead of "canary"
relizy release --canary --preid snapshot
# → 1.3.0-snapshot.a3f4b2c.0

# Use "nightly" instead of "canary"
relizy release --canary --preid nightly
# → 1.3.0-nightly.a3f4b2c.0
```

The `--preid` value is also used as the npm dist-tag. So `--preid snapshot` publishes to the `snapshot` dist-tag, and users can install it with:

```bash
npm install my-package@snapshot
```

## Installing a Canary Version

After a canary release is published, anyone can install it:

```bash
# Install the latest canary version
npm install my-package@canary

# Install a specific canary version
npm install my-package@1.3.0-canary.a3f4b2c.0
```

The `latest` dist-tag on npm is **never affected** by canary releases. Users running `npm install my-package` will always get the last stable version.

## Canary in CI/CD

Canary releases shine in CI/CD pipelines. A common pattern is to publish a canary version on every pull request so reviewers can test the changes.

### GitHub Actions

```yaml
name: Canary Release

on:
  pull_request:
    branches:
      - main

jobs:
  canary:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      pull-requests: write # Required for PR comments

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci

      - name: Build
        run: npm run build

      - name: Canary Release
        run: relizy release --canary --yes
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

This workflow:

1. Runs on every pull request
2. Builds the packages
3. Publishes a canary version to npm
4. Posts a comment on the PR with the canary version details

### GitLab CI

```yaml
canary:
  image: node:20
  stage: deploy
  script:
    - npm ci
    - npm run build
    - git config user.name "GitLab CI"
    - git config user.email "ci@gitlab.com"
    - relizy release --canary --yes --no-clean --pr-number $CI_MERGE_REQUEST_IID
  variables:
    GITLAB_TOKEN: $CI_JOB_TOKEN
    NODE_AUTH_TOKEN: $NPM_TOKEN
  only:
    - merge_requests
```

::: tip
Use `--no-clean` in CI to skip the git dirty check, since CI environments may have build artifacts or generated files.
:::

## Canary with the Bump Command

You can also use `--canary` with just the `bump` command if you only want to update version numbers without publishing:

```bash
relizy bump --canary
# Updates package.json to 1.3.0-canary.a3f4b2c.0 without publishing
```

This is useful if you want to control the publish step separately.

## Dry Run

Preview what a canary release would do without making any changes:

```bash
relizy release --canary --dry-run
```

This shows you the canary version that would be generated and which packages would be affected, without writing to any files or publishing to npm.

## PR Comments

When canary mode is used, Relizy can post a comment on your pull request with the canary version details. This makes it easy for reviewers to find and install the canary version.

The PR comment is **enabled by default** in canary mode. To disable it:

```bash
relizy release --canary --no-pr-comment
```

To specify the PR number manually (useful in CI):

```bash
relizy release --canary --pr-number 42
```

## Comparison with Pre-releases

| Feature          | Canary (`--canary`)            | Pre-release (`--prerelease`)   |
| ---------------- | ------------------------------ | ------------------------------ |
| Version format   | `1.3.0-canary.a3f4b2c.0`       | `1.3.0-beta.0`                 |
| Git commit       | No                             | Yes                            |
| Git tag          | No                             | Yes                            |
| Changelog        | No                             | Yes                            |
| Push to remote   | No                             | Yes                            |
| Provider release | No                             | Yes                            |
| npm dist-tag     | `canary` (or custom preid)     | `beta` (or custom tag)         |
| Purpose          | Quick testing from a PR branch | Official pre-release milestone |

Use **canary** for quick, throwaway test versions. Use **pre-release** for official beta/alpha milestones that are part of your release history.

## Summary

- `relizy release --canary` publishes a temporary test version to npm
- The version format is `{nextVersion}-canary.{sha}.0`
- It skips changelog, git commits, tags, push, provider releases, and social media
- It keeps publishing, PR comments, safety checks, and confirmation prompts active
- Use `--preid` to customize the prerelease identifier (e.g., `snapshot`, `nightly`)
- Perfect for CI pipelines that need to publish preview versions from pull requests

## Next Steps

- [CI/CD Setup](/guide/ci-cd) - General CI/CD best practices
- [GitHub Actions](/guide/github-actions) - Detailed GitHub Actions setup
- [GitLab CI](/guide/gitlab-ci) - Detailed GitLab CI setup
- [PR Comments](/guide/pr-comment) - Learn about PR comment integration
- [CLI Release Reference](/cli/release) - All release command options
