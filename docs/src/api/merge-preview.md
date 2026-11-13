---
title: mergePreview()
description: Preview from code what the merge of the pull request of the CI job releases, and know whether its release would fail.
keywords: relizy merge preview api, mergePreview, MergePreviewOptions, MergePreviewError, release preview api, pull request preview
category: API Reference
tags: [api, merge-preview, pull-request, merge-request, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Signature

```ts
function mergePreview(options?: MergePreviewOptions): Promise<ReleaseReport>
```

Options: [`MergePreviewOptions`](./../typedoc/interfaces/MergePreviewOptions.md), the options of the release job that change the release (`type`, `preid`, `tag`, `publish`, `configName`, `groups`...), the outputs of the preview (`comment`, `check`), and `changelog: true` for the changelog entries of the release.

## Behavior

- Computes the release of the merge as [`release()`](./release.md) will run it on the target branch, and writes nothing: no version, changelog, commit, tag, push, publish nor hook. See [Merge Preview](./../guide/merge-preview.md).
- In the pipeline of a pull request, comments it and sets the commit status `relizy/merge-preview`, unless `comment: false` or `check: false`. With both `false`, the preview is only computed: nothing is posted (outside a pull request pipeline, nothing is posted either). The report is still written as [`release.report`](./../config/release.md#report) says: in GitHub Actions, the outputs and the summary of the job (`release.report.github: false` turns them off).
- Resolves the [`ReleaseReport`](./../typedoc/interfaces/ReleaseReport.md) of the preview: `released: false`, `dryRun: true`, `status` `released` when the merge releases a package, `nothing` otherwise, the versions and tags by version group (`release`), and `mergePreview`:
  - `pullRequest`, the number of the pull request (kept for the reports of relizy 2), and `pullRequestDetails`, the pull request itself: `provider`, `kind`, `number` (the same), `title`, `targetBranch`, `merged`. None outside a pull request pipeline
  - `branch`, the squash mode (`squash`), `packages` (each released package: versions, reason, commits, from the pull request or not), `squashPackages` when a squash merge would release other versions
  - `problems`, `warnings`, `publish` (`enabled`, `distTag`), `changelogs` (with `changelog: true`), `posted` (`comment`, `status`), and the `markdown` of the comment
- Its steps are the `merge-preview` step of the [progress events](./progress-events.md) (`onProgress`): one `step:start`/`step:done` pair per part of the preview (the merge, the release, the checks, the comment, the commit status).
- Rejects with a `MergePreviewError` when the release of the merge would fail (a version or a tag already taken, a squash commit that is not a Conventional Commit, the commitlint of the project, an error of the config): its message lists the problems, and its `report` is the report of the preview.

## Example

```ts
import { mergePreview, MergePreviewError } from 'relizy'

try {
  const report = await mergePreview({ tag: 'next', comment: false })
  console.log(report.mergePreview?.markdown)
}
catch (error) {
  if (error instanceof MergePreviewError) {
    console.error(error.message)
  }
  throw error
}
```

Only computed, for an application showing it:

```ts
import { mergePreview, MergePreviewError } from 'relizy'

const report = await mergePreview({ comment: false, check: false, changelog: true })
  .catch((error: unknown) => {
    // The release would fail: the report lists the problems
    if (error instanceof MergePreviewError && error.report) {
      return error.report
    }
    throw error
  })

for (const pkg of report.mergePreview?.packages ?? []) {
  console.log(pkg.name, pkg.oldVersion, '->', pkg.newVersion, pkg.reason)
}
```

## See Also

- [Merge Preview](./../guide/merge-preview.md)
- [`relizy merge-preview`](./../cli/merge-preview.md)
- [API usage](./usage.md)
