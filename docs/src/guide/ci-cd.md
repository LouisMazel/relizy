---
title: CI/CD Integration
description: Automate your releases with continuous integration and deployment pipelines.
keywords: ci cd integration, continuous integration, continuous deployment, automated releases, pipeline automation
category: Guide
tags: [guide, ci-cd, automation, deployment, integration]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Overview

Relizy is designed to work seamlessly in CI/CD environments. This guide covers best practices for automating releases in your pipelines.

## General Setup

### Environment Variables

Set these in your CI/CD environment:

```bash
# Required for npm publishing
NODE_AUTH_TOKEN=your_npm_token

# Required for GitHub releases
RELIZY_GITHUB_TOKEN=your_github_token

# Required for GitLab releases
RELIZY_GITLAB_TOKEN=your_gitlab_token
```

### Git Configuration

Configure git in your CI environment:

```bash
git config --global user.name "github-actions[bot]"
git config --global user.email "github-actions[bot]@users.noreply.github.com"
```

## Common Patterns

### Manual Trigger

Release only when manually triggered:

```yaml
# GitHub Actions
name: Release
on:
  workflow_dispatch:
    inputs:
      release_type:
        description: Release type
        required: true
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: relizy release --${{ inputs.release_type }} --yes
```

### On Tag Push

Release when a tag is pushed:

```yaml
# GitHub Actions
name: Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: relizy publish
      - run: relizy provider-release
```

### On Main Branch Push

Automatically release on every push to main:

```yaml
# GitHub Actions
name: Release
on:
  push:
    branches:
      - main

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Fetch all history
      - uses: actions/setup-node@v4
      - run: npm install
      - run: relizy release --yes
```

### On PR Merge with Label

Release only when PRs with specific labels are merged:

```yaml
# GitHub Actions
name: Release
on:
  pull_request:
    types: [closed]

jobs:
  release:
    if: github.event.pull_request.merged == true && contains(github.event.pull_request.labels.*.name, 'release')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: relizy release --yes
```

## Important Flags for CI

### --yes

Skip all interactive prompts:

```bash
relizy release --minor --yes
```

### --no-clean

Skip git status checks (useful in CI where working directory may have artifacts):

```bash
relizy release --minor --no-clean
```

### --dry-run

Test the release process without making changes:

```bash
relizy release --minor --dry-run
```

### --log-level

Control logging verbosity:

```bash
relizy release --minor --log-level debug
```

## Complete Examples

### GitHub Actions - Full Release

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      release_type:
        description: 'Release type (patch, minor, major)'
        required: true
        default: patch

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write # For pushing tags and creating releases
      packages: write # For publishing packages

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Fetch all history for changelog
          token: ${{ secrets.RELIZY_GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Release
        run: relizy release --${{ inputs.release_type }} --yes
        env:
          RELIZY_GITHUB_TOKEN: ${{ secrets.RELIZY_GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### GitLab CI - Full Release

```yaml
release:
  image: node:20
  stage: deploy
  only:
    - main
  when: manual
  script:
    - npm ci
    - git config user.name "GitLab CI"
    - git config user.email "ci@gitlab.com"
    - relizy release --yes
  variables:
    RELIZY_GITLAB_TOKEN: $CI_JOB_TOKEN
    NODE_AUTH_TOKEN: $NPM_TOKEN
```

### CircleCI - Automated Release

```yaml
version: 2.1

jobs:
  release:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - restore_cache:
          keys:
            - dependencies-{{ checksum "package-lock.json" }}
      - run:
          name: Install dependencies
          command: npm ci
      - run:
          name: Configure Git
          command: |
            git config user.name "CircleCI"
            git config user.email "ci@circleci.com"
      - run:
          name: Release
          command: relizy release --yes
      - save_cache:
          paths:
            - node_modules
          key: dependencies-{{ checksum "package-lock.json" }}

workflows:
  release:
    jobs:
      - release:
          filters:
            branches:
              only: main
```

## Monorepo CI/CD

### Selective Publishing

Only publish packages that changed:

```yaml
- name: Release
  run: relizy release --yes
```

## Security Best Practices

### 1. Use Tokens, Not Passwords

Always use tokens for authentication:

```bash
# Good ✅
NODE_AUTH_TOKEN=npm_xxx...

# Bad ❌
NPM_PASSWORD=my_password
```

### 2. Limit Token Scopes

Use tokens with minimal required permissions:

- **NPM**: Read and publish access only
- **GitHub**: Contents and packages write only
- **GitLab**: API access only

### 3. Rotate Tokens Regularly

Set reminders to rotate CI tokens every 90 days.

### 4. Use Branch Protection

Protect your main branch:

- Require pull request reviews
- Require status checks to pass
- Restrict who can push to main

### 5. Audit Releases

Log all releases for audit trails:

```yaml
- name: Release
  run: relizy release --yes | tee release.log

- name: Upload logs
  uses: actions/upload-artifact@v4
  with:
    name: release-logs
    path: release.log
```

## Troubleshooting

### Git Push Fails

Ensure you have proper permissions:

```yaml
- uses: actions/checkout@v4
  with:
    token: ${{ secrets.RELIZY_GITHUB_TOKEN }}
    # or use a PAT with wider permissions
    # token: ${{ secrets.PAT_TOKEN }}
```

### NPM Publish Fails

Verify your NPM token:

```bash
# Test authentication
npm whoami
```

Set the token correctly:

```yaml
env:
  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### No Commits Found

Ensure you fetch all git history:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0 # ← Important!
```

### Dirty Working Directory

Use `--no-clean` in CI:

```bash
relizy release --yes --no-clean
```

## Next Steps

- [GitHub Actions](github-actions.md) - Detailed GitHub Actions setup
- [GitLab CI](gitlab-ci.md) - Detailed GitLab CI setup
- [CLI Reference](../cli/release.md) - Learn about all CLI options
