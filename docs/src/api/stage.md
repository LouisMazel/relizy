---
title: stage()
description: List, approve or reject the versions staged on npm from Node.js with stage(), and the flow of an application that approves a CI release with one 2FA, with onOtp, onPrompt and getStagedState of @relizy/core.
keywords: relizy stage api, npm stage approve api, approveStagedVersions, getStagedState, onOtp, onPrompt, OtpRequest, AppPrompt, StageOptions, StageResponse, staged versions
category: API Reference
tags: [api, stage, npm, publish, 2fa, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
function stage(options: StageOptions): Promise<StageResponse>
```

`stage()` runs [`relizy stage`](./../cli/stage.md) with the config of the project: it lists, approves or rejects the staged versions of its public packages, with the npm login of the user. It is refused in a CI and under trusted publishing (it throws an `InteractiveAuthRequiredError`). It returns `{ action, staged, results }`: the staged versions (`list`), or the ones selected, and one result per version approved or rejected.

## Options

| Option       | Description                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`     | `'list'` (read-only), `'approve'` or `'reject'` (final). Required                                                                                   |
| `packages`   | Only these packages, by name. Without them nor `all`, `list` lists every public package, and `approve` and `reject` ask in an interactive terminal  |
| `all`        | Every staged version of the public packages of the project                                                                                          |
| `otp`        | The 2FA code, instead of `onOtp` or the terminal                                                                                                    |
| `dryRun`     | Shows what would be done: npm is never called, nor `onOtp`                                                                                          |
| `onOtp`      | `(request: OtpRequest) => string \| Promise<string>`: gives the 2FA code once npm needs one, once for the batch                                     |
| `onPrompt`   | `(request: AppPrompt) => boolean \| Promise<boolean>`: confirms a rejection (`reject-staged`)                                                       |
| `onWebAuth`  | `({ url, purpose }) => void \| Promise<void>`: shows the web 2FA page of a security-key account, the run goes on once validated (the CLI prints it) |
| `onProgress` | Receives the [events](./progress-events.md) of the run: the `approve`, `reject` and `list` steps                                                    |

And the [shared options](./usage.md#shared-options) (`configName`, `config`, `profile`, `logLevel`). There are no hooks.

`OtpRequest` is `{ registry, packageName?, purpose?, count? }`: `purpose` is `'approve'` or `'reject'` here, `count` the number of versions the code covers. Each version is tried first without code: npm then offers its web 2FA (`onWebAuth`), and the code is asked only when npm needs one, once for the batch. It never mixes with the code of a publish. `AppPrompt` is `{ kind, items }`: `kind` is `'reject-staged'` here, `items` the `{ name, version, stageId }` to reject. Without `onPrompt` and without a terminal, nothing is rejected.

See [Answering from the application](./progress-events.md#answering-from-the-application).

## Examples

```ts
import { stage } from 'relizy'

// What awaits approval
const { staged } = await stage({ action: 'list' })

// Approve it all, one code
const { results } = await stage({
  action: 'approve',
  all: true,
  onOtp: ({ purpose, count }) => askTheCodeInTheApp(purpose, count),
  onProgress: event => renderInTheApp(event),
})

console.log(results.filter(result => result.status !== 'approved'))
```

A version is `skipped` while it is still `validating`, when its dependency was not approved, or when the account has a security key (`web-auth`, with the `url` of the page to approve on).

## An Application Flow

A CI stages a release and never approves. An application (a desktop tool, a dashboard) closes the loop with the npm login of its user. From the release to the installable version:

1. **The CI release stages.** The application reads what the run says: the outputs `staged`, `stage_ids`, `awaiting_approval` and `publish_auth` (see [Staged publishing](./../guide/staged-publishing.md#releases-from-a-ci)), or the report (`publish.staged`).
2. **It lists what awaits approval**, and shows the state of each version, with the functions of `@relizy/core` (they need no relizy config).
3. **It approves with one OTP**, with the code of its user.
4. **It polls `getStagedState`** until the version is `installable`: that is the moment to say "out".

```ts
import {
  approveStagedVersions,
  getStagedState,
  listStagedVersions,
} from '@relizy/core'

const cwd = '/path/to/project'
const registry = 'https://registry.npmjs.org/'

// 2. What awaits approval, with the npm login of the user (never a CI token)
const staged = await listStagedVersions({ cwd, registry })

// 3. One OTP for every version, dependencies first
const results = await approveStagedVersions({
  cwd,
  registry,
  versions: staged.map(({ stageId, name, version }) => ({ stageId, name, version })),
  getOtp: ({ purpose, count }) => askTheCodeInTheApp(purpose, count),
  onItem: result => showProgressInTheApp(result),
  // A security key has no code to type: show the page of the web 2FA, the approval goes on once validated
  onWebAuth: ({ url }) => openInTheBrowser(url),
})

// 4. Poll until each version is installable
for (const { name, version, stageId } of staged) {
  let state = await getStagedState({ cwd, registry, name, version, stageId })
  while (state === 'validating' || state === 'staged') {
    await sleep(5000)
    state = await getStagedState({ cwd, registry, name, version, stageId })
  }
  if (state === 'installable') {
    notifyInTheApp(`${name}@${version} is out`)
  }
}
```

`getStagedState` returns `validating` (npm scans the version, not approvable yet), `staged` (awaiting approval), `installable` (in the registry), `rejected-or-gone` or `unknown` (npm could not be asked). It never throws.

`approveStagedVersions` approves only the versions it is given, in dependency order (`dependencies` names the other given versions a version depends on), tries each version without code first (or with `otp`), asks `getOtp` only when npm needs a code it cannot get on the web, once, and again only when npm refuses it, waits for a `validating` version (`waitMs`, `maxWaitMs`), and returns one result per version: `approved`, `skipped` or `failed`, with a `reason`. Every call has a `timeoutMs`. `onWebAuth({ url, purpose })` shows the web 2FA page npm offers (security key, passkey, or a code typed on the page): npm then gives a one-time token, and the approval goes on (checking "skip 2FA for the next 5 minutes" on the page covers the next versions). Without it, and without code from `getOtp`, the version gets `web-auth` with the `url` of the page. `getWebAuth(error)` and `waitForWebAuth({ doneUrl })` are the two halves, for an npm call of your own.

These functions throw an `InteractiveAuthRequiredError` (`E_INTERACTIVE_AUTH`) in a CI, under trusted publishing, or without an npm login: an application approves with the session of the user, where the user is. The typed errors of `@relizy/core` have a stable `code`: `StageRequiredError` (`E_STAGE_REQUIRED`), `VersionAlreadyStagedError` (`E_ALREADY_STAGED`), `StagingUnavailableError` (`E_STAGING_UNAVAILABLE`), `InteractiveAuthRequiredError` (`E_INTERACTIVE_AUTH`) and `TrustedPublisherError` (`E_TRUST`).

The whole API of `@relizy/core` is documented in its [`core/*` pages](./../guide/ai-agents.md) for agents (`search_docs`, `get_doc`).

## See Also

- [`relizy stage`](./../cli/stage.md)
- [Staged publishing](./../guide/staged-publishing.md)
- [`publish()`](./publish.md), [`release()`](./release.md), [`trust()`](./trust.md)
- [Progress events](./progress-events.md)
