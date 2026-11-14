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

Each option is a `boolean`, and a CLI flag disables it for a run (`--no-verify` turns `noVerify` on).

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

`--canary` (or [`canary`](#canary)) turns off `changelog`, `commit`, `gitTag`, `push`, `providerRelease` and `social`, whatever the config: see [Canary Releases](./../guide/prereleases.md#canary-releases).

## canary

- **Type:** `boolean`
- **Default:** `false`
- **CLI:** `--canary`

Release a canary version of the current commit instead of a release, as `relizy release --canary`: `{nextVersion}-0.{preid}-{sha}`, published with the `canary` dist-tag (`--tag`, or `publish.tag` of a canary [profile](./profiles.md), one that sets `release.canary`), without changelog, commit, git tag, push, provider release nor social post. Set it in a profile (`profiles: { canary: { release: { canary: true } } }`) to make `relizy release --profile canary` a canary release. See [Canary Releases](./../guide/prereleases.md#canary-releases).

## report

- **Type:** `{ github?: boolean, json?: string, dotenv?: string, markdown?: string }`
- **Default:** `{ github: true }`
- **CLI:** `--report-json <file>`, `--report-dotenv <file>`, `--report-markdown <file>`

Report of the release, to run something only when a release happens (see [CI/CD](./../guide/ci-cd.md#run-something-only-when-a-release-happens)). Written after a release, when there is nothing to release and when the release fails (not for a refused or cancelled prompt), in dry-run too. The paths are relative to `cwd`.

| Key        | Effect                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `github`   | On GitHub Actions, write the outputs below to the step, plus `report` (the report as JSON) and `summary` (markdown), and the summary to the run                                                                          |
| `json`     | Write the whole report (the value returned by `release()`) to this JSON file                                                                                                                                             |
| `dotenv`   | Write the outputs to this file as `RELIZY_<OUTPUT>=value` (`RELIZY_RELEASED=true`), for the `artifacts:reports:dotenv` of GitLab CI. Without `install`: no value has a space, the file can be sourced (`. ./relizy.env`) |
| `markdown` | Write the summary of the release to this markdown file, e.g. for an artifact of GitLab CI                                                                                                                                |

| Output                   | Value                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `released`               | `true` when the release happened, never in dry-run                                                                                                     |
| `status`                 | `released`, `nothing` or `failed`                                                                                                                      |
| `version`                | The repository version (standalone, `unified` or `selective`; with `monorepo.groups`, the first `unified`/`selective` group released), empty otherwise |
| `tags`                   | The created tags, comma-separated                                                                                                                      |
| `packages`               | The released packages, comma-separated `name@version`                                                                                                  |
| `branch`                 | The branch of the release                                                                                                                              |
| `commit`                 | The short hash of the release commit                                                                                                                   |
| `dist_tags`              | The dist-tags of the published versions, comma-separated (`publish.tag`, not the `tag` of the `registries`)                                            |
| `urls`                   | What the release created (npm pages, provider releases, tweet, pull request), comma-separated                                                          |
| `install`                | The command installing the published versions (up to 3 packages), not in the dotenv file                                                               |
| `failed_steps`           | The steps that failed without stopping the release (`social`, `providerRelease`, `prComment`), comma-separated, empty when none failed                 |
| `group_<name>_version`   | The version of a `unified`/`selective` group of `monorepo.groups` released (`group_ecosystem_version`)                                                 |
| `package_<name>_version` | The new version of a released package (`@acme/ui-kit` gives `package_acme_ui_kit_version`)                                                             |

The `group_*` and `package_*` outputs are only set when the release happened (not in dry-run): a group or a package not released has none.

The JSON report has the same content, with the packages by version group: see [`ReleaseReport`](./../typedoc/interfaces/ReleaseReport.md).

```yaml
# GitHub Actions
- id: release
  uses: relizy/action@v2
- if: steps.release.outputs.released == 'true'
  run: echo "Released ${{ steps.release.outputs.tags }}"
```

The summary is the end of the output of `relizy release`, the summary of the GitHub Actions run, the [PR comment](./../guide/pr-comment.md) and the `markdown` file: the versions, what the release contains (features, fixes, breaking changes, contributors), what each step did with the links of what it created, the AI rewrites (tokens and cost), the install command and the packages.
