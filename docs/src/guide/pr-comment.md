---
title: PR Comments
description: Post the summary of each release on the pull request or merge request it comes from, on GitHub and GitLab, with Relizy.
keywords: pr comment, pull request comment, merge request comment, release comment, github pr, gitlab mr, pr-number, relizy pr comment
category: Guide
tags: [guide, pr-comment, github, gitlab, pull-request, merge-request]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## How It Works

`relizy release` comments the pull request as its last step (see [the steps of a release](./../cli/release.md#steps)), when [`release.prComment`](./../config/release.md#steps) is `true` (the default). `--no-pr-comment` skips it. [`relizy pr-comment`](./../cli/pr-comment.md) posts a comment on its own.

A comment that cannot be posted (no pull request, no token, an API error) is reported with a warning: it never fails the release.

By default, Relizy edits its previous comment on the pull request instead of adding one: see [`prComment.mode`](./../config/pr-comment.md#mode).

## Finding the Pull Request

Relizy looks for the **open** pull request (GitHub) or merge request (GitLab) whose source branch is the current branch, in the repository of the config (`repo`, or the `origin` remote). It finds nothing:

- once the pull request is merged or closed, e.g. in a job running on the push to `main`;
- on a detached `HEAD` (a CI checking out a commit);
- for a pull request opened from a fork;
- on Bitbucket, not supported.

Give the number with `--pr-number` in these cases:

```bash
pnpm exec relizy release --yes --pr-number 42
```

```yaml
# GitHub Actions, in a workflow triggered by pull_request
- run: pnpm exec relizy release --yes --pr-number ${{ github.event.pull_request.number }}
```

Without pull request, the comment is skipped with the warning `No PR/MR detected. Use --pr-number to specify one manually.`

## Tokens

The comment uses the token of the provider releases (`tokens.github` or `tokens.gitlab`): see [Tokens](./../config/overview.md#tokens). On GitLab, the job token (`CI_JOB_TOKEN`) cannot comment the merge requests: set `GITLAB_TOKEN`.

- **GitHub**: the token needs the permission to comment the pull requests. With the `GITHUB_TOKEN` of GitHub Actions, grant `pull-requests: write` to the job (see [GitHub Actions](./github-actions.md)).
- **GitLab**: the token is sent in the `PRIVATE-TOKEN` header: use a project or personal access token with the `api` scope (see [GitLab CI](./gitlab-ci.md)).

A self-hosted instance is reached on the domain of `repo` (`https://<domain>/api/v3` for GitHub Enterprise, `https://<domain>/api/v4` for GitLab).

## The Comment of a Release

With `relizy release`, the comment is the **summary of the release**, the same as the end of the terminal output and the summary of the GitHub Actions run (see [`release.report`](./../config/release.md#report)):

- a title: `🚀 Released <name> <version>`, `🧪 Dry run: <name> <version>`, `ℹ️ Nothing to release` or `❌ Release failed` with the error;
- a table: the versions, the tags, what the release contains (`3 features · 2 fixes · 1 contributor`), each step with its status and the links of what it created (npm pages, provider releases, tweet), the AI rewrites and the install command;
- the packages and their versions: one table, or one per [version group](./version-groups.md) titled with its `title`, its version and its version mode, the `unified`/`selective` group first;
- a footer: the branch, the date, and a link to Relizy.

```markdown
## 🚀 Released maz-ui 5.2.1, @maz-ui/eslint-config 5.1.0

...

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

When nothing is released, the comment says so (`No commit since the last release triggers a new version.`). When the release fails, it shows the error and the steps done before it.

The private packages are listed only with [`monorepo.privatePackages: 'release'`](./../config/monorepo.md#privatepackages), and never get an install command: see [Private Projects](./private-projects.md).

## The Comment of `relizy pr-comment`

Without a release, `relizy pr-comment` comments the current state of the project, read from the `package.json` files:

- the title `🚀 Release published`;
- the version of the root `package.json` (not with the `independent` mode), the dist-tag when it is not `latest`, the date and the branch;
- the packages and their versions;
- the install commands of the published packages (with `release.publish` not `false`), and of their dist-tag.

## Dry Run

```bash
relizy release --dry-run
relizy pr-comment --dry-run
```

The dry run looks for the pull request (it calls the API of the provider to find it), then shows the comment with the pull request found, the mode and the status. It posts nothing.

## See Also

- [`relizy pr-comment`](./../cli/pr-comment.md)
- [`prComment()`](./../api/pr-comment.md)
- [PR Comment Configuration](./../config/pr-comment.md)
- [CI/CD](./ci-cd.md)
