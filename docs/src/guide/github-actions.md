# GitHub Actions

Complete guide to using Relizy with GitHub Actions.

## Quick Start

Create `.github/workflows/release.yml`:

```yaml
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
    permissions:
      contents: write
      packages: write

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
        run: npx relizy release --${{ inputs.release_type }} --yes --publish --provider-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Workflow Triggers

### Manual Trigger (Recommended)

Best for controlled releases:

```yaml
on:
  workflow_dispatch:
    inputs:
      release_type:
        description: 'Release type (patch, minor, major)'
        required: true
        type: choice
        options:
          - patch
          - minor
          - major
      dry_run:
        description: Dry run (preview only)
        required: false
        type: boolean
        default: false
```

Usage in workflow:

```yaml
- name: Release
  run: npx relizy release --${{ inputs.release_type }} --yes ${{ inputs.dry_run && '--dry-run' || '' }}
```

### On Push to Main

Automatic releases on every push:

```yaml
on:
  push:
    branches:
      - main
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

### On PR Merge

Release when specific PRs are merged:

```yaml
on:
  pull_request:
    types: [closed]
    branches:
      - main

jobs:
  release:
    if: |
      github.event.pull_request.merged == true &&
      contains(github.event.pull_request.labels.*.name, 'release:patch')

    steps:
      - run: npx relizy release --patch --yes
```

### On Schedule

Automated periodic releases:

```yaml
on:
  schedule:
    - cron: '0 10 * * 1' # Every Monday at 10 AM UTC

jobs:
  release:
    steps:
      - run: npx relizy release --yes
```

## Authentication

### GitHub Token

Use the built-in `GITHUB_TOKEN` for most operations:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

For operations requiring wider permissions, use a Personal Access Token:

```yaml
- uses: actions/checkout@v4
  with:
    token: ${{ secrets.PAT_TOKEN }}
```

Create a PAT:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Create a fine-grained token with `contents: write` permission
3. Add it to repository secrets as `PAT_TOKEN`

### NPM Token

Add your NPM token to repository secrets:

1. Create token: `npm token create`
2. Add to GitHub: Settings → Secrets → New repository secret
3. Name: `NPM_TOKEN`

Use in workflow:

```yaml
env:
  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Complete Workflows

### Full Release Workflow

```yaml
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
      publish_npm:
        description: Publish to npm
        type: boolean
        default: true
      create_github_release:
        description: Create GitHub release
        type: boolean
        default: true

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Release
        run: |
          PUBLISH_FLAG=${{ inputs.publish_npm && '--publish' || '' }}
          PROVIDER_FLAG=${{ inputs.create_github_release && '--provider-release' || '' }}
          npx relizy release --${{ inputs.release_type }} --yes $PUBLISH_FLAG $PROVIDER_FLAG
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create release summary
        run: |
          echo "## Release Summary" >> $GITHUB_STEP_SUMMARY
          echo "Release type: ${{ inputs.release_type }}" >> $GITHUB_STEP_SUMMARY
          echo "NPM publish: ${{ inputs.publish_npm }}" >> $GITHUB_STEP_SUMMARY
          echo "GitHub release: ${{ inputs.create_github_release }}" >> $GITHUB_STEP_SUMMARY
```

### Monorepo Release Workflow

```yaml
name: Monorepo Release

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
      packages:
        description: 'Packages to release (comma-separated, leave empty for all)'
        required: false
        type: string

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: pnpm

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Build packages
        run: pnpm run build

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Release
        run: |
          PACKAGES_FLAG=${{ inputs.packages && format('--packages {0}', inputs.packages) || '' }}
          npx relizy release --${{ inputs.release_type }} --yes --publish --provider-release $PACKAGES_FLAG
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Separate Bump and Publish

Split bumping and publishing into separate jobs:

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      release_type:
        required: true
        type: choice
        options: [patch, minor, major]

jobs:
  bump:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    outputs:
      version: ${{ steps.bump.outputs.version }}

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

      - name: Bump version
        id: bump
        run: |
          npx relizy bump --${{ inputs.release_type }} --yes
          VERSION=$(node -p "require('./package.json').version")
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Create changelog
        run: npx relizy changelog

      - name: Commit and tag
        run: |
          git add .
          git commit -m "chore(release): v${{ steps.bump.outputs.version }}"
          git tag "v${{ steps.bump.outputs.version }}"
          git push origin main --follow-tags

  publish:
    needs: bump
    runs-on: ubuntu-latest
    permissions:
      packages: write

    steps:
      - uses: actions/checkout@v4
        with:
          ref: v${{ needs.bump.outputs.version }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci
      - run: npm run build
      - run: npx relizy publish --yes
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  github-release:
    needs: [bump, publish]
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4
        with:
          ref: v${{ needs.bump.outputs.version }}

      - name: Create GitHub Release
        run: npx relizy provider-release --yes
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Matrix Strategy for Monorepos

Test and publish multiple packages in parallel:

```yaml
jobs:
  detect-packages:
    runs-on: ubuntu-latest
    outputs:
      packages: ${{ steps.packages.outputs.list }}
    steps:
      - uses: actions/checkout@v4
      - id: packages
        run: |
          PACKAGES=$(ls -d packages/* | jq -R -s -c 'split("\n")[:-1]')
          echo "list=$PACKAGES" >> $GITHUB_OUTPUT

  publish:
    needs: detect-packages
    runs-on: ubuntu-latest
    strategy:
      matrix:
        package: ${{ fromJson(needs.detect-packages.outputs.packages) }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - name: Publish ${{ matrix.package }}
        run: npx relizy publish --packages $(basename ${{ matrix.package }})
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Conditional Publishing

Only publish if tests pass:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test

  release:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: npx relizy release --yes --publish
```

## Notifications

### Slack Notification

```yaml
- name: Notify Slack
  if: success()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "New release: v${{ steps.bump.outputs.version }}"
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Discord Notification

```yaml
- name: Notify Discord
  if: success()
  run: |
    curl -X POST -H 'Content-Type: application/json' \
      -d '{"content": "🚀 New release: v${{ steps.bump.outputs.version }}"}' \
      ${{ secrets.DISCORD_WEBHOOK }}
```

## Best Practices

### 1. Use Concurrency Control

Prevent multiple releases at once:

```yaml
concurrency:
  group: release
  cancel-in-progress: false
```

### 2. Add Approval Steps

Require manual approval for production releases:

```yaml
jobs:
  approve:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: echo "Approved"

  release:
    needs: approve
    runs-on: ubuntu-latest
    steps:
      - run: npx relizy release --yes
```

### 3. Cache Dependencies

Speed up workflows:

```yaml
- uses: actions/setup-node@v4
  with:
    cache: npm # or 'pnpm' or 'yarn'
```

### 4. Upload Artifacts

Save build artifacts:

```yaml
- name: Upload build
  uses: actions/upload-artifact@v4
  with:
    name: dist
    path: dist/
```

### 5. Use Job Summaries

Add release summaries:

```yaml
- run: |
    echo "## Release v$VERSION" >> $GITHUB_STEP_SUMMARY
    echo "Type: ${{ inputs.release_type }}" >> $GITHUB_STEP_SUMMARY
    npx relizy changelog >> $GITHUB_STEP_SUMMARY
```

## Troubleshooting

### Permission Denied Errors

Ensure permissions are set:

```yaml
permissions:
  contents: write # For tags and releases
  packages: write # For npm publishing
```

### Git Push Fails

Use a PAT instead of `GITHUB_TOKEN`:

```yaml
- uses: actions/checkout@v4
  with:
    token: ${{ secrets.PAT_TOKEN }}
```

### Build Artifacts Missing

Ensure artifacts are built before releasing:

```yaml
- run: npm run build
- run: npx relizy release --yes
```

## Next Steps

- [GitLab CI](/guide/gitlab-ci) - GitLab CI integration
- [CI/CD Setup](/guide/ci-cd) - General CI/CD best practices
- [CLI Reference](/cli/release) - Full command reference
