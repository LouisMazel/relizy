# Relizy Release

Ship every release in one step: versions, changelogs, npm publishing and GitHub releases, from your commits, with [relizy](https://relizy.dev).

The action sets up Node.js and your package manager, installs your dependencies, runs `relizy release` with your tokens and gives its outputs to the next steps.

> This repository is synced from [LouisMazel/relizy](https://github.com/LouisMazel/relizy/tree/main/integrations/github-action) at each release: open issues and pull requests there.

## Usage

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      release:
        description: Release type (auto follows the commits)
        type: choice
        default: auto
        options: [auto, patch, minor, major]

concurrency: release

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      # npm trusted publishing (OIDC): publishes without NPM_TOKEN once set up on npmjs.com
      id-token: write
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - id: release
        uses: relizy/action@v2
        with:
          release-type: ${{ inputs.release }}
          npm-token: ${{ secrets.NPM_TOKEN }}
      - if: steps.release.outputs.released == 'true'
        run: echo "Released ${{ steps.release.outputs.version }}"
```

The guide: [GitHub Actions](https://relizy.dev/guide/github-actions).

## Inputs

| Input                                                                                              | Default                | Description                                                                                               |
| -------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `release-type`                                                                                     | `auto`                 | `auto` (follows the commits), `patch`, `minor`, `major`, `prerelease`, `prepatch`, `preminor`, `premajor` |
| `args`                                                                                             |                        | More arguments for `relizy release`, e.g. `--tag beta --preid beta`                                       |
| `github-token`                                                                                     | `${{ github.token }}`  | GitHub releases, push and PR comment                                                                      |
| `npm-token`                                                                                        |                        | npm publishing, not needed with trusted publishing                                                        |
| `slack-token`, `teams-webhook-url`                                                                 |                        | Slack posts, Microsoft Teams cards                                                                        |
| `twitter-api-key`, `twitter-api-key-secret`, `twitter-access-token`, `twitter-access-token-secret` |                        | Twitter posts                                                                                             |
| `claude-code-oauth-token`, `anthropic-api-key`                                                     |                        | AI rewrites (the claude CLI is installed with `claude-code-oauth-token`)                                  |
| `setup`                                                                                            | `true`                 | Set up Node.js and the package manager and install the dependencies                                       |
| `package-manager`                                                                                  | from the lockfile      | `npm`, `pnpm`, `yarn` or `bun`                                                                            |
| `node-version`                                                                                     | `.nvmrc`, else `lts/*` | Node.js version                                                                                           |
| `relizy-version`                                                                                   | the one of the project | Version of relizy, else the one of the action                                                             |
| `working-directory`                                                                                | `.`                    | Directory of the project                                                                                  |

## Outputs

`released`, `status`, `version`, `tags`, `packages`, `branch`, `commit`, `dist_tags`, `urls`, `install`, `failed_steps`, `summary` (markdown) and `report` (JSON: `fromJSON(steps.release.outputs.report)`). See [the outputs](https://relizy.dev/guide/github-actions#outputs-and-summary).

## Versions

`relizy/action@v2` follows the latest relizy 2, `relizy/action@v2.3.0` a given version. The action runs the relizy of your `package.json`, else the version of its tag.
