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

Options: [`MergePreviewOptions`](./../typedoc/interfaces/MergePreviewOptions.md), the options of the release job that change the release (`type`, `preid`, `tag`, `publish`, `configName`, `groups`...) and the outputs of the preview (`comment`, `check`).

## Behavior

- Computes the release of the merge as [`release()`](./release.md) will run it on the target branch, and writes nothing: no version, changelog, commit, tag, push, publish nor hook. See [Merge Preview](./../guide/merge-preview.md).
- In the pipeline of a pull request, comments it and sets the commit status `relizy/merge-preview`, unless `comment: false` or `check: false`.
- Resolves the [`ReleaseReport`](./../typedoc/interfaces/ReleaseReport.md) of the preview: `released: false`, `dryRun: true`, `status` `released` when the merge releases a package, `nothing` otherwise, and `mergePreview` (the pull request, the squash mode, the warnings, the markdown of the comment).
- Rejects with a `MergePreviewError` when the release of the merge would fail (a version or a tag already taken, a squash commit that is not a Conventional Commit, the commitlint of the project, an error of the config): its message lists the problems.

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

## See Also

- [Merge Preview](./../guide/merge-preview.md)
- [`relizy merge-preview`](./../cli/merge-preview.md)
- [API usage](./usage.md)
