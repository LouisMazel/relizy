---
title: Resume a Release
description: Resume a release that failed - what a failure leaves at each step, the one safety rule of --skip-existing-versions, and the re-run in GitHub Actions and GitLab CI.
metaDescription: 'Resume a failed release safely: what each failure leaves behind, re-run the same commit with --skip-existing-versions, in GitHub Actions and GitLab CI.'
keywords: resume release, failed release, re-run release, skip-existing-versions, version already published, push refused, release recovery, re-run failed jobs, gitlab retry
category: Guide
tags: [guide, ci-cd, recovery, publish]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## The Rule

**Re-run the release from the same commit, with `--skip-existing-versions`.** The versions already published are skipped, the next steps run: commit, tags, push.

Never after new commits: the release would compute the same version again, skip its publication (it exists), and tag the new commits with a version that does not contain them. Relizy guards the usual cases: a release stops when its branch moved since it started, and without the flag a version already published fails the release. It cannot prove that a published version comes from a commit, so it adds no "resume" flag.

After a failure that published versions, the error is followed by this hint:

```text
2 versions are already published. To resume, re-run the release from commit a1b2c3d (the same commit, never after new commits) with --skip-existing-versions.
```

## What a Failure Leaves

| The release failed at                                                     | What is left                                                                | Resume                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `publish`, after some packages                                            | Files restored, no commit nor tag, the published versions on the registry   | Re-run the same commit with `--skip-existing-versions`                                                        |
| `commit-and-tag` or `push`, in CI                                         | Everything published, the clone and its commit lost                         | The same re-run: same versions from the same last tag, publish skipped, then commit, tags and push            |
| `commit-and-tag`, on a laptop                                             | Everything published, the files of the bump and the changelogs left changed | `git restore . && git clean -f`, then the same re-run                                                         |
| `push`, on a laptop                                                       | The release commit and its tags, local only                                 | `git push --follow-tags` (a re-run finds nothing to release)                                                  |
| The tag was pushed, the commit refused                                    | A remote tag outside the history of the branch                              | A re-run stops and prints `git fetch --tags && git merge <tag> && git push`                                   |
| A step after the push: `provider-release`, `sync`, `social`, `pr-comment` | The release is published and tagged                                         | The command of the step alone: `relizy provider-release`, `relizy sync`, `relizy social`, `relizy pr-comment` |
| The process was killed                                                    | Files written by the bump and the changelog                                 | `git restore . && git clean -f`, then one of the rows above                                                   |

The step that stopped the release is `failedStep` of the [report](./../config/release.md#report) (`Publish`, `Commit`, `Push`...): a script or an app reads it to pick the row.

Before re-running, check what is published and tagged: `relizy release --dry-run`, or [`previewRelease({ checks: true })`](./../api/preview-release.md) and the `preview_release` tool of the [MCP server](./ai-agents.md). Staged versions stay staged: never approved by a re-run, see them with [`relizy stage list`](./../cli/stage.md).

## In GitHub Actions

"Re-run failed jobs" runs the same commit again and raises `github.run_attempt`: skip the existing versions on a re-run only.

```yaml
- uses: relizy/action@v2
  with:
    args: ${{ github.run_attempt > 1 && '--skip-existing-versions' || '' }}
```

## In GitLab CI

"Retry" runs the job again on the same commit, with the same arguments. To resume, include the component a second time for a pipeline run with a variable, from the same commit (Build > Pipelines > Run pipeline, `RESUME_RELEASE` = `true`):

```yaml
include:
  - component: gitlab.com/relizy/relizy/release@2
    rules:
      - if: $RESUME_RELEASE != "true"
  - component: gitlab.com/relizy/relizy/release@2
    inputs:
      args: --skip-existing-versions
    rules:
      - if: $RESUME_RELEASE == "true"
```

A canary is not resumed: run it again, with `--skip-existing-versions` (see [Canary Releases](./prereleases.md#canary-releases)).
