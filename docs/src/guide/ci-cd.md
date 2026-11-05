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

### What Relizy Handles in CI

Relizy prepares the clone of the CI job itself, whatever the provider:

- **Shallow clone**: the full history and the tags are fetched (`fetch-depth: 1` of GitHub Actions, `GIT_DEPTH` of GitLab CI), as the versions and the changelogs need every commit since the last release.
- **Detached HEAD**: GitLab CI (and others) check out the commit; Relizy checks out the branch of the job (`CI_COMMIT_BRANCH`...), tracking the remote one, so the release commit can be pushed.
- **Git identity**: without `git config user.name` in the job, the release commit and the tags are made by the person who started the release, with the noreply email their provider links to their profile (`12446546+octocat@users.noreply.github.com`, `42-jdoe@users.noreply.gitlab.com`). A bot, or a CI that does not tell, gets `relizy[bot]`.
- **Push**: before publishing anything, Relizy checks that the release commit and the tags can be pushed, and fails with the fix otherwise: a push failing after the publish would leave versions on the registry without their commit nor their tags. On GitLab, it pushes with `GITLAB_TOKEN` when the job token cannot.
- **Confirmation**: without `--yes`, `relizy release` and `relizy bump` fail right away, as nobody can confirm the new versions (see [Important Flags for CI](#important-flags-for-ci)).

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
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
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
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
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
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0 # Fetch all history
      - uses: actions/setup-node@v6
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
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
      - run: npm install
      - run: relizy release --yes
```

## Important Flags for CI

### --yes

Skip all interactive prompts:

```bash
relizy release --minor --yes
```

Without it, `relizy release` and `relizy bump` fail right away in CI, with the exit code 1 and the fix, as nobody can confirm the new versions:

```text
✖ Release failed
  relizy release asks to confirm the new versions, but the terminal is not interactive (GitHub Actions): run "relizy release --yes" to confirm them in advance
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
        uses: actions/checkout@v6
        with:
          fetch-depth: 0 # Fetch all history for changelog
          token: ${{ secrets.RELIZY_GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '24'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Release
        run: relizy release --${{ inputs.release_type }} --yes
        env:
          RELIZY_GITHUB_TOKEN: ${{ secrets.RELIZY_GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### GitLab CI - Full Release

```yaml
release:
  image: node:24
  stage: deploy
  only:
    - main
  when: manual
  script:
    - npm ci
    - relizy release --yes
  variables:
    NODE_AUTH_TOKEN: $NPM_TOKEN
```

### CircleCI - Automated Release

```yaml
version: 2.1

jobs:
  release:
    docker:
      - image: cimg/node:24.0
    steps:
      - checkout
      - restore_cache:
          keys:
            - dependencies-{{ checksum "package-lock.json" }}
      - run:
          name: Install dependencies
          command: npm ci
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

## Run Something Only When a Release Happens

`relizy release` exits with code `0` whether it released or there was nothing to release: run what follows a release (a message to the team, a deployment of the docs) from a **hook**, which only runs when a release happens.

```ts
export default defineConfig({
  hooks: {
    // A command, run after a successful release only
    'success:release': 'node ./scripts/notify-teams.mjs',
  },
})
```

The hooks also run with `--dry-run`: a command hook would then notify for nothing. A function hook gets `dryRun`, and the release as third parameter (see [Hooks](../config/hooks.md#parameters)), to tell what was released:

```ts
export default defineConfig({
  hooks: {
    'success:release': async (config, dryRun, context) => {
      if (dryRun || !context) {
        return
      }

      const versions = context.release.groups.flatMap(group => group.version
        ? [`${group.title} ${group.version}`]
        : group.packages.map(pkg => `${pkg.name} ${pkg.newVersion}`))

      await fetch(process.env.TEAMS_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `Released: ${versions.join(', ')}` }),
      })
    },
  },
})
```

### From the CI

The release also writes its report for the next steps of the CI: its outputs (`released`, `version`, `tags`, `packages`, `urls`...) and a summary (see [`release.report`](../config/release.md#report)).

On **GitHub Actions**, the outputs of the step and the summary of the run are written without option:

```yaml
- id: release
  run: pnpm relizy release --yes
- if: steps.release.outputs.released == 'true'
  run: ./scripts/notify-teams.sh "${{ steps.release.outputs.version }}"
```

On **GitLab CI**, write them to a dotenv file ([`release.report.dotenv`](../config/release.md#report) or `--report-dotenv`), read by the next jobs:

```yaml
release:
  script:
    - pnpm relizy release --yes --report-dotenv relizy.env
  artifacts:
    reports:
      dotenv: relizy.env

notify:
  needs: [release]
  script:
    - '[ "$RELIZY_RELEASED" = "true" ] && ./scripts/notify-teams.sh "$RELIZY_VERSION" || echo "Nothing released"'
```

GitLab CI has no summary of the run: write it to a markdown file (`--report-markdown relizy-summary.md`) and expose it as an artifact, or read it in the comment of the merge request ([PR comment](./pr-comment.md)).

```yaml
release:
  script:
    - pnpm relizy release --yes --report-markdown relizy-summary.md
  artifacts:
    expose_as: Release summary
    paths: [relizy-summary.md]
```

In a script, read the JSON report (`--report-json relizy.json`), or the return value of [`release()`](../api/release.md).

## Canary Releases in CI

Canary releases are ideal for CI pipelines. Publish a temporary test version on every pull request so reviewers can install and test the changes before merging.

### Canary on Pull Request

```yaml
# GitHub Actions
name: Canary
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
      pull-requests: write

    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - name: Canary Release
        run: relizy release --canary --yes
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

This publishes a canary version (e.g., `1.3.0-0.canary-a3f4b2c`) to npm with the `canary` dist-tag and posts a comment on the PR with the version details.

::: tip
Use `--no-clean` in CI to skip the git dirty check, since CI environments may have build artifacts.
:::

Learn more in the [Canary Releases](/guide/canary-releases) guide.

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
- uses: actions/checkout@v6
  with:
    token: ${{ secrets.RELIZY_GITHUB_TOKEN }}
    # or use a PAT with wider permissions
    # token: ${{ secrets.PAT_TOKEN }}
```

If the push is rejected as `non-fast-forward`, commits were pushed to the branch while the release was running. Relizy merges them into the release commit and pushes again; see [Branch Safety](/cli/release#branch-safety) for the details and the recovery command printed when the merge conflicts.

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
- uses: actions/checkout@v6
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
