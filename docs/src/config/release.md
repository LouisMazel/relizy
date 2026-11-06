---
title: Release Configuration
description: Reference of the release options - the steps of relizy release (changelog, publish, commit, tag, push, provider release, social posts, PR comment) and the report of the release (GitHub Actions outputs, JSON, dotenv, markdown).
metaDescription: 'Reference of the release options: the steps of relizy release, from the changelog to the social posts, and the report of the release.'
keywords: release config, relizy release steps, commit, push, gitTag, noVerify, providerRelease, social, prComment, release report, GitHub Actions outputs, dotenv, GitLab CI
category: Configuration
tags: [config, release, workflow, report, ci]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }} For the order of the steps, see [`relizy release`](./../cli/release.md#steps).

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    social: false,
    report: { dotenv: 'relizy.env' },
  },
})
```

## Steps

Each option is a `boolean`, and a CLI flag disables it for a run.

| Option            | Default | CLI                     | Effect                                                                                                                                                               |
| ----------------- | ------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changelog`       | `true`  | `--no-changelog`        | Write the `CHANGELOG.md` files                                                                                                                                       |
| `publish`         | `true`  | `--no-publish`          | Publish the packages to the registry, see [Publish](./publish.md)                                                                                                    |
| `commit`          | `true`  | `--no-commit`           | Commit the release files and create the tags (`templates.commitMessage`, see [Templates](./commit-templates.md)). Without it, nothing is pushed                      |
| `gitTag`          | `true`  | `--no-git-tag`          | Create the release tags; without it, the commit is pushed without `--follow-tags`                                                                                    |
| `noVerify`        | `false` | `--no-verify`           | Commit with `--no-verify`, skipping the git hooks                                                                                                                    |
| `push`            | `true`  | `--no-push`             | Push the commit and the tags. Requires `commit`                                                                                                                      |
| `providerRelease` | `true`  | `--no-provider-release` | Create the GitHub or GitLab releases. A [version group](./monorepo.md#groups) can override it                                                                        |
| `social`          | `true`  | `--no-social`           | Post the release on the platforms enabled in `social` (`social.twitter.enabled`, `social.slack.enabled`), see [Social](./social.md). A version group can override it |
| `prComment`       | `true`  | `--no-pr-comment`       | Comment the pull request with the outcome of the release, see [PR Comment](./pr-comment.md)                                                                          |
| `clean`           | `true`  | `--no-clean`            | With [`bump.clean`](./bump.md#clean), fail on uncommitted changes; otherwise keep them, with a confirmation when they touch the files the release commits            |

`--canary` turns off `changelog`, `commit`, `gitTag`, `push`, `providerRelease` and `social`, whatever the config: see [Canary Releases](./../guide/prereleases.md#canary-releases).

## report

- **Type:** `{ github?: boolean, json?: string, dotenv?: string, markdown?: string }`
- **Default:** `{ github: true }`
- **CLI:** `--report-json <file>`, `--report-dotenv <file>`, `--report-markdown <file>`

Report of the release, to run something only when a release happens (see [CI/CD](./../guide/ci-cd.md#run-something-only-when-a-release-happens)). Written after a release, when there is nothing to release and when the release fails, in dry-run too. The paths are relative to `cwd`.

| Key        | Effect                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `github`   | On GitHub Actions, write the outputs below to the step, plus `report` (the report as JSON) and `summary` (markdown), and the summary to the run |
| `json`     | Write the whole report (the value returned by `release()`) to this JSON file                                                                    |
| `dotenv`   | Write the outputs to this file as `RELIZY_<OUTPUT>=value` (`RELIZY_RELEASED=true`), for the `artifacts:reports:dotenv` of GitLab CI             |
| `markdown` | Write the summary of the release to this markdown file, e.g. for an artifact of GitLab CI                                                       |

| Output      | Value                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------- |
| `released`  | `true` when the release happened, never in dry-run                                            |
| `status`    | `released`, `nothing` or `failed`                                                             |
| `version`   | The repository version (standalone, `unified` or `selective`), empty otherwise                |
| `tags`      | The created tags, comma-separated                                                             |
| `packages`  | The released packages, comma-separated `name@version`                                         |
| `branch`    | The branch of the release                                                                     |
| `commit`    | The short hash of the release commit                                                          |
| `dist_tags` | The dist-tags of the published versions, comma-separated                                      |
| `urls`      | What the release created (npm pages, provider releases, tweet, pull request), comma-separated |
| `install`   | The command installing the published versions (up to 3 packages)                              |

```yaml
# GitHub Actions
- id: release
  run: pnpm relizy release --yes
- if: steps.release.outputs.released == 'true'
  run: echo "Released ${{ steps.release.outputs.tags }}"
```

The summary is the end of the output of `relizy release`, the summary of the GitHub Actions run, the [PR comment](./../guide/pr-comment.md) and the `markdown` file: the versions, what the release contains (features, fixes, breaking changes, contributors), what each step did with the links of what it created, the AI rewrites (tokens and cost), the install command and the packages.
