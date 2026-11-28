---
title: trust()
description: Set up the npm trusted publishers of the packages from Node.js with trust(), with onOtp and onPrompt for an application, and the functions of @relizy/core behind it.
keywords: relizy trust api, npm trust api, trusted publishers api, createTrustedPublisher, listTrustedPublishers, readReleaseWorkflows, TrustOptions, TrustResponse, onOtp, onPrompt
category: API Reference
tags: [api, trust, npm, oidc, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
function trust(options?: Partial<TrustOptions>): Promise<TrustResponse>
```

`trust()` runs [`relizy trust`](./../cli/trust.md): it creates the [trusted publisher](./../guide/trusted-publishing.md) configurations of the public packages of the project on npmjs.com, from the release workflow files, with the npm login of the user. It throws an `InteractiveAuthRequiredError` in a CI. It returns:

- `results`: one result per package, `{ name, status, reason?, publishers? }`, `status` `created`, `exists`, `differs`, `replaced`, `missing` or `failed`;
- `proposedStaged`: the [`publish.staged`](./../config/publish.md#staged) value the configurations ask for, when it differs from the config;
- `configWritten`: the proposed value was written in the config file;
- `expiring`: the packages set up now with no release pending, whose configuration npm removes after 2 days unused.

## Options

The flags of [`relizy trust`](./../cli/trust.md#options), camelCased (`packages`, `all`, `replace`, `file`, `repo`, `project`, `env`, `otp`, `yes`, `dryRun`), and the [shared options](./usage.md#shared-options). `circleci` takes the identifiers of a CircleCI pipeline: `{ orgId, projectId, pipelineDefinitionId, vcsOrigin, contextIds? }`.

| Option       | Description                                                                                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onOtp`      | `(request: OtpRequest) => string \| Promise<string>`: gives the 2FA code, once for all the packages (`purpose: 'trust'`, `count` the packages)                                                                         |
| `onPrompt`   | `(request: AppPrompt) => boolean \| Promise<boolean>`: `replace-trust` before revoking and recreating configurations (`items` name each one), `write-config` before writing `publish.staged` (`detail` holds the diff) |
| `onWebAuth`  | `({ url, purpose }) => void \| Promise<void>`: shows the web 2FA page of a security-key account, the run goes on once validated (the CLI prints it)                                                                    |
| `onProgress` | Receives the [events](./progress-events.md) of the run: the `trust` step, one `step:item` per package                                                                                                                  |

Without `onPrompt` and without a terminal, the answer is no: nothing is revoked nor written, and `proposedStaged` holds the value instead. `yes: true` answers yes.

## Examples

```ts
import { trust } from 'relizy'

const { results, proposedStaged, expiring } = await trust({
  all: true,
  onOtp: ({ purpose, count }) => askTheCodeInTheApp(purpose, count),
  onPrompt: ({ kind, items }) => confirmInTheApp(kind, items),
  onProgress: event => renderInTheApp(event),
})

for (const result of results.filter(item => item.status === 'missing')) {
  console.log(`${result.name} is not on npm yet: ${result.reason}`)
}
```

## With `@relizy/core`

An application that has no relizy config reads and sets up the trust with the plain functions of `@relizy/core`, with the same rules (the npm login, never a token, never in a CI):

```ts
import {
  createTrustedPublisher,
  listTrustedPublishers,
  readReleaseWorkflows,
} from '@relizy/core'

const cwd = '/path/to/project'

// The workflows that release with relizy: file, repository, jobs and their environment
const [workflow] = await readReleaseWorkflows({ cwd })

const existing = await listTrustedPublishers({ cwd, packageName: '@scope/core', otp })

if (existing.length === 0 && workflow?.repository) {
  await createTrustedPublisher({
    cwd,
    packageName: '@scope/core',
    otp,
    source: { type: 'github', file: workflow.file, repository: workflow.repository },
    allowPublish: true,
    allowStagePublish: false,
  })
}
```

A refusal of npm becomes a `TrustedPublisherError` (`E_TRUST`) with its status. `listTrustedPublishers`, `createTrustedPublisher` and `revokeTrustedPublisher` take an optional `onWebAuth({ url, purpose })`, called with the page of the web 2FA of a security-key account: the call goes on once the person validated it (`waitForWebAuth` polls npm). `checkTrustedPublisher({ registry, packageName, env })` tells from a CI job whether npm trusts it for a package (`matched`, `no-match`, `missing-package` or `unknown`).

## See Also

- [`relizy trust`](./../cli/trust.md)
- [Trusted publishing](./../guide/trusted-publishing.md)
- [`stage()`](./stage.md)
- [Progress events](./progress-events.md)
