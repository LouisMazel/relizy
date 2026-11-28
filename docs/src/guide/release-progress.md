---
title: Release Progress
description: Follow a CI release while it runs with the commit status relizy/release - turn it on, its permissions, the format a program reads, readReleaseStatus() of @relizy/core, and the final report.
metaDescription: 'Follow a CI release while it runs: the commit status relizy/release on GitHub and GitLab, its format, its permissions and readReleaseStatus().'
keywords: release progress, commit status, relizy/release, follow a ci release, live release status, readReleaseStatus, statuses write, github commit status, gitlab external status, report-status
category: Guide
tags: [guide, ci-cd, github-actions, gitlab-ci, report]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

The log of a CI job is not readable by a program while the job runs (GitHub answers `404` for the logs of a running job). With [`release.report.status`](./../config/release.md#report), relizy tells where the release stands in a **commit status** instead: `relizy/release`, on the commit the release started from, next to the other checks of the commit, with a link to the run.

## Turn It On

| Where                                                   | How                                                                         | Default |
| ------------------------------------------------------- | --------------------------------------------------------------------------- | ------- |
| [GitHub action](./github-actions.md#the-relizy-action)  | `report-status` input                                                       | on      |
| [GitLab component](./gitlab-ci.md#the-relizy-component) | `report-status` input                                                       | off     |
| Config, CLI, API                                        | `release: { report: { status: true } }`, `--report-status`, `report.status` | off     |

It only runs for `relizy release`, in GitHub Actions and GitLab CI, never in dry-run nor on a pull or merge request run (canaries included). Outside a CI, the option does nothing.

**Permissions**

- **GitHub**: the job needs `statuses: write` (a workflow that lists its permissions has no other). `relizy init` adds it.
- **GitLab**: a token with the `api` scope, `GITLAB_TOKEN` (the token of the release). The job token cannot set commit statuses.

A status that cannot be set warns once with the fix, and the release goes on: it never fails a release.

## What It Says

| Phase     | Description                                                                | GitHub state | GitLab state |
| --------- | -------------------------------------------------------------------------- | ------------ | ------------ |
| running   | `running <step>: <label>`, e.g. `running publish: Publishing the packages` | `pending`    | `running`    |
| released  | `released <version>`, `released <n> packages`, `canary <version>`          | `success`    | `success`    |
| nothing   | `nothing to release`                                                       | `success`    | `success`    |
| failed    | `failed <step>: <first line of the error>`                                 | `failure`    | `failed`     |
| cancelled | `cancelled <step>` (the job was cancelled)                                 | `error`      | `canceled`   |

`<step>` is a step of the release: `checks`, `bump`, `changelog`, `publish`, `commit-and-tag`, `push`, `sync`, `provider-release`, `approve`, `social`, `pr-comment`. At most 140 characters, the tokens masked.

- **GitHub** shows each step as it starts.
- **GitLab** only accepts a new state, not a new text in the same state: it shows the first step (`running checks`), then the end.

**Contract**: the name `relizy/release` and the first word of the description keep their meaning. A new step or a new text after `:` may come; a new first word is read as `unknown` by an older reader. A change of meaning ships as a new name (`relizy/release/v2`), next to the old one for a major.

## Read It

From Node.js, with `@relizy/core`:

```ts
import { readReleaseStatus } from '@relizy/core'

const status = await readReleaseStatus({
  provider: 'github', // or 'gitlab', with `ref` for a branch pipeline
  repo: 'acme/app',
  token: process.env.GITHUB_TOKEN!,
  sha, // the commit of the push that started the release
})
// { phase: 'running', step: 'publish', label: 'Publishing the packages', state: 'pending', url, updatedAt }
```

`phase` is `unknown` for a text it does not know: something happened, open `url` (the run).

Without Node.js, read the last status named `relizy/release` of the commit:

```bash
# GitHub: newest first
gh api repos/acme/app/commits/$SHA/statuses --jq '[.[] | select(.context == "relizy/release")][0]'
# GitLab
glab api "projects/acme%2Fapp/repository/commits/$SHA/statuses?name=relizy/release&all=true&order_by=id&sort=desc"
```

`parseReleaseStatus()` and `formatReleaseStatus()` of `@relizy/core` read and write the description.

## A Killed Job

A job killed without a chance to post (a lost runner) leaves the status `pending` or `running`. Check the run of its link: when it is over, the release was interrupted, not running. See [Resume a Release](./resume-a-release.md).

- **GitHub**: a yellow dot on the commit, nothing is blocked.
- **GitLab**: the pipeline stays `running` until a final status is posted, which is why the component leaves the option off. A cancelled job does post `cancelled <step>`, which marks the pipeline `canceled`.

## The Final Report

The status tells where the release is, the [report](./../config/release.md#report) tells what it did, after a failure too:

- **GitHub**: the outputs of the step (`report`, the JSON, and `summary`), in a later step with `if: always()`, or a file kept as an artifact:

  ```yaml
  - id: release
    uses: relizy/action@v2
    with:
      args: --report-json relizy.json
  - if: always()
    uses: actions/upload-artifact@v4
    with:
      name: relizy-report
      path: relizy.json
  ```

- **GitLab**: the dotenv report of the component is uploaded after a failure too, `RELIZY_STATUS=failed` for a later job (`when: on_failure`).

The step that stopped a failed release is `failedStep` of the JSON report.
