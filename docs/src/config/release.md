---
title: Release Configuration
description: Configure release workflow behavior.
keywords: release config, workflow config, git commit config, release automation, release settings
category: Configuration
tags: [config, release, workflow, automation]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## commit

Enable/disable git commits:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    commit: true,
  },
})
```

## push

Enable/disable git push of commit and tags:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    push: true,
  },
})
```

## changelog

Enable/disable changelog generation:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    changelog: true,
  },
})
```

## clean

Enable/disable git clean:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    clean: true,
  },
})
```

## noVerify

Enable/disable git --no-verify flag:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    noVerify: true,
  },
})
```

## publish

Enable/disable npm publish:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    publish: true,
  },
})
```

## gitTag

Enable/disable git tag push:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    gitTag: true,
  },
})
```

## providerRelease

Enable/disable provider release creation (GitHub/GitLab):

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    providerRelease: true,
  },
})
```

## social

Enable/disable social media posting:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    social: true,
  },
})
```

See [Social Media Integration](/guide/social-media) for more details.

## prComment

Enable/disable PR comment posting:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    prComment: true,
  },
})
```

See [PR Comments](/guide/pr-comment) for more details.

## report

Report of the release, to run something only when a release happens (see [CI/CD Setup](/guide/ci-cd#run-something-only-when-a-release-happens)). It is written for a release, when there is nothing to release and when the release fails, in dry-run too, where `released` is `false`.

- **Type:** `{ github?: boolean, json?: string, dotenv?: string, markdown?: string }`
- **Default:** `{ github: true }`

| Option     | Description                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `github`   | In GitHub Actions, write the outputs of the step and the summary of the run                                                       |
| `json`     | File to write the whole report to, as JSON                                                                                        |
| `dotenv`   | File to write the outputs to, as dotenv (`RELIZY_RELEASED`, `RELIZY_VERSION`...), for the `artifacts:reports:dotenv` of GitLab CI |
| `markdown` | File to write the summary of the release to, as markdown (the summary of a GitHub Actions run), e.g. for an artifact of GitLab CI |

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    report: { dotenv: 'relizy.env', markdown: 'relizy-summary.md' },
  },
})
```

The outputs:

| Output      | Value                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------- |
| `released`  | `true` when the release happened (never in dry-run)                                           |
| `status`    | `released`, `nothing` or `failed`                                                             |
| `version`   | The repository version                                                                        |
| `tags`      | The created tags, comma-separated                                                             |
| `packages`  | The released packages, comma-separated `name@version`                                         |
| `branch`    | The branch of the release                                                                     |
| `commit`    | The short hash of the release commit                                                          |
| `dist_tags` | The dist-tags of the published versions, comma-separated                                      |
| `urls`      | What the release created (npm pages, provider releases, tweet, pull request), comma-separated |
| `install`   | The command installing the published versions (up to 3 packages)                              |

On GitHub Actions, the step also gets `report` (the whole report, as JSON) and `summary` (the summary of the release, as markdown, to reuse in a comment or a message).

### The Summary

The same summary closes the output of `relizy release` in the terminal, fills the summary of the GitHub Actions run, the [PR comment](/guide/pr-comment) of the release and the `markdown` file: the versions, what the release contains (features, fixes, breaking changes, contributors), what each step did with the links of what it created (npm pages, GitHub or GitLab releases, tweet, pull request), the AI rewrites (with the sum of their tokens, and of their cost for `claude-code`), the install command and the packages with their versions.

## Canary Mode Behavior

When using `relizy release --canary`, several release options are **automatically overridden** regardless of your configuration:

| Option            | Forced to | Reason                                          |
| ----------------- | --------- | ----------------------------------------------- |
| `commit`          | `false`   | No git commit for a temporary version           |
| `push`            | `false`   | Nothing to push (no commit, no tag)             |
| `changelog`       | `false`   | No changelog for a temporary version            |
| `providerRelease` | `false`   | No GitHub/GitLab release for a test version     |
| `social`          | `false`   | No social media announcement for a test version |
| `gitTag`          | `false`   | No tag for an ephemeral version                 |

The following options are **not affected** by canary mode and respect your configuration:

- `publish` - Stays enabled (this is the main purpose of canary)
- `prComment` - Stays enabled (useful to see canary version in PRs)
- `clean` - Stays enabled (still checks for uncommitted changes)
- `noVerify` - Unchanged

See the [Canary Releases guide](/guide/canary-releases) for full details.

## Complete Example

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    commit: true,
    changelog: true,
    clean: true,
    noVerify: false,
    publish: true,
    providerRelease: true,
    push: true,
    gitTag: true,
    social: true,
    prComment: true,
  },
})
```
