---
title: Staged Publishing
description: Upload the versions to the npm staging area and approve them with one 2FA before they are installable - what is staged, per package manager, how to approve, releases from a CI, the outputs and the troubleshooting.
metaDescription: 'Staged publishing on npm with Relizy: publish.staged, approve all the versions with one 2FA (relizy stage approve), CI releases, outputs and troubleshooting.'
keywords: npm staged publishing, npm stage publish, npm stage approve, publish.staged, publish.approve, approve staged versions, 2FA, E_STAGE_REQUIRED, previously staged, relizy stage, trusted publishing
category: Guide
tags: [guide, npm, publish, staging, security, 2fa, ci-cd]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Why Stage

With a direct publish, a version is installable the moment `npm publish` ends: whoever holds the token or the CI job can ship code to your users. With **staged publishing** (npm, since May 2026), the version is uploaded to a staging area first. npm scans it for malware (`validating`), then a maintainer approves it with 2FA, on their machine or on npmjs.com. Only then is it installable.

It is the human gate between a CI and your users: the CI can stage, never approve. It is optional and off by default. Relizy handles both sides: [`publish.staged`](./../config/publish.md#staged) stages, and [`publish.approve`](./../config/publish.md#approve) and [`relizy stage`](./../cli/stage.md) approve, with **one 2FA code for all the versions**.

::: tip
Without staging, the unattended path is [trusted publishing](./trusted-publishing.md) with direct publish. Staging adds the human approval on top, and is the way forward for tokens: see [Moving off npm tokens](./npm-token-migration.md).
:::

## What Is Staged

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    // Stable releases staged, prereleases published directly
    staged: { tags: ['latest'] },
  },
})
```

| Value                 | What is staged                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `false` (the default) | Nothing, the versions are published directly                                                                                    |
| `true`                | Every version, except the canaries                                                                                              |
| `{ tags, packages }`  | The versions that match **every** filter given: dist-tags (`['latest']`), names or globs (`['@scope/core', '@scope/plugin-*']`) |

`relizy publish --staged` and `relizy release --staged` decide for one run, `--no-staged` turns it off for one run.

- **Canaries**: `staged: true` never stages a [canary](./prereleases.md#canaries-and-staged-publishing): a canary has no push and is run again often, and an unapproved stage blocks the next run on the same commit with `E409`. A canary is staged only when `tags` lists its tag, or with `--staged` on its run.
- **Registries**: only npmjs stages. A version published to another registry (GitHub Packages, a private registry) is published directly, and Relizy says it once per run. Mix them with `packages` and [`registries[].packageFilter`](./../config/publish.md#registries).
- **The tag is fixed when staging.** Staged and published versions share one version index: a version already staged cannot be published, nor staged again.
- **Dry run**: `--dry-run` shows which versions would be staged, and nothing is uploaded.

Until it is approved, a staged version is not on the package page, not in `npm view` and not installable. `released` stays `true` in the report (bumped, tagged, pushed), but Relizy never presents a staged version as installable: no install command, no link to its npm page, and the [social posts](./social-media.md) wait for the approval.

## Per Package Manager

| Package manager             | How the version is staged                                                  |
| --------------------------- | -------------------------------------------------------------------------- |
| npm                         | `npm stage publish` (npm 11.15.0 or later)                                 |
| pnpm 11.3 and later         | `pnpm stage publish`                                                       |
| pnpm before 11.3, yarn, bun | Pack with the package manager, upload the tarball with `npm stage publish` |

The fallback packs the package with its own package manager (`workspace:` and `catalog:` dependencies are resolved as for a publish), then uploads the tarball with npm from the root of the project, so the token and the scoped registries of the root `.npmrc` apply. It needs npm 11.15.0 or later on the machine: Relizy checks it before the bump, and tells the version found, the version needed and how to upgrade.

The limits of the fallback:

- a tarball upload runs no `prepublishOnly`, `publish` nor `postpublish` script of the package. `prepack` and `postpack` run during the pack;
- `publish.args` is appended to the upload command: give arguments that suit `npm stage publish`;
- a dry run packs the package, so `prepack` and `prepare` scripts run;
- `--otp` is never passed: staging asks for no code, the approval does.

The same fallback lets bun and yarn classic publish with [trusted publishing](./trusted-publishing.md#package-managers), which they cannot do by themselves. With a token, they keep their own publish command.

## Approving

A staged version is installable once approved. Approving needs **your own npm login and an interactive 2FA**: npm accepts neither a CI token nor an OIDC token, so a CI never approves.

### In the Release

After the push and the provider release, `relizy release` runs its `approve` step, driven by [`publish.approve`](./../config/publish.md#approve):

- `'prompt'` (the default): in an interactive terminal, "Approve the N staged versions now?", then one 2FA code. An application answers through `onPrompt`, see [`release()`](./../api/release.md). Without a terminal and without handler, the step is skipped.
- `true` (`--approve`): approves without asking. npm still asks for the code.
- `false` (`--no-approve`): the step is skipped, approve later.

The step is skipped in a CI and under trusted publishing, whatever the value. A canary staged on purpose is approved right after the publish, as it has no push. `relizy publish` run alone approves right after the publish. A declined prompt, a cancelled code or a failed approval never fails the release: it is published and tagged, and the report lists what still awaits approval and the command to finish.

Once approved, the install command, the npm pages, the summary, the PR comment and the posts follow, as for a direct publish.

### With `relizy stage`

```bash
relizy stage list
relizy stage approve --all
relizy stage approve @scope/core @scope/cli
relizy stage reject @scope/core
```

See [`relizy stage`](./../cli/stage.md). What to know:

- **One 2FA for the batch.** The versions are approved dependencies first. Relizy tries without code first: npm then offers its web 2FA (next point). A code is asked only when npm needs one, then reused, and asked again only when npm stops accepting it; `--otp` gives it upfront.
- **`validating`**: npm scans each version for malware before it can be approved. Relizy waits for it (up to 5 minutes), then skips the version: run the command again later.
- **A dependency not approved**: a version whose workspace dependency was not approved is skipped, so nothing installable depends on a version that is not.
- **Web 2FA**: relizy prints the page of npm's web 2FA (an application gets it in `onWebAuth`), where you validate with your security key, passkey or code, waits for the validation and goes on. Check **skip 2FA for the next 5 minutes** on the page: one validation then covers the whole batch, otherwise each version asks again. An application without `onWebAuth` gets the `web-auth` reason and the address of the page.
- **Your login, not a token**: `NPM_TOKEN`, `NODE_AUTH_TOKEN` and `RELIZY_NPM_TOKEN` are blanked for these commands, and npm runs from a neutral directory, so no token nor project `.npmrc` hides your login. A token set as `NPM_CONFIG_//registry.npmjs.org/:_authToken` is not covered.

### On npmjs.com

The staged versions are also approved in the "Staged Packages" tab of your account settings on [npmjs.com](https://www.npmjs.com/settings), up to 100 versions with one 2FA.

## Releases From a CI

A CI stages and never approves. The release succeeds, its `approve` step is skipped with the reason `ci`, and the summary says how to approve.

```yaml
# GitHub Actions
- uses: relizy/action@v2
  id: release
  with:
    args: --staged
- if: steps.release.outputs.staged == 'true'
  run: |
    echo "Awaiting approval: ${{ steps.release.outputs.awaiting_approval }}"
```

When the run staged something, the outputs and the dotenv variables are:

| Output              | dotenv variable            | Content                                                   |
| ------------------- | -------------------------- | --------------------------------------------------------- |
| `staged`            | `RELIZY_STAGED`            | `true`                                                    |
| `stage_ids`         | `RELIZY_STAGE_IDS`         | The ids of the stages, comma-separated                    |
| `awaiting_approval` | `RELIZY_AWAITING_APPROVAL` | The `name@version` not approved yet, comma-separated      |
| `publish_auth`      | `RELIZY_PUBLISH_AUTH`      | How the publish authenticated: `oidc`, `token` or `npmrc` |

A run that does not stage has none of them, and its outputs are the same as without staging: test `staged == 'true'`, an absent output means nothing was staged. `dist_tags` lists the tags of the staged versions too, and `install` only the installable packages.

The summary of the run and of the PR comment has an "Awaiting approval" block with `relizy stage approve --all` and the web page. Then approve from your machine, or from an application: [`stage()`](./../api/stage.md) and the [flow of an application](./../api/stage.md#an-application-flow). With the [action](./github-actions.md#staged-releases) or the [component](./gitlab-ci.md#staged-releases), `--staged` goes through `args`.

`success:publish` and the other [hooks](./../config/hooks.md) fire as for a direct publish, also for a run that only staged.

## Troubleshooting

### `E_STAGE_REQUIRED`

npm refuses a direct publish: the token (a stage-only token) or the trusted publisher configuration only allows staging. With trusted publishing, npm says `OIDC permission denied for this action` (observed with pnpm): Relizy reads it the same way. Relizy fails before asking any one-time password, with the package, the tag and the fixes: stage this tag (`publish.staged`, `--staged`), or allow direct publish (`relizy trust` with direct publish for this workflow, or a token allowed to publish). It never turns the publish into a stage by itself: "installable" would silently become "awaiting approval".

### `E409 ... Cannot stage previously published version`

The version is already staged and awaits approval (a previous run staged it, or you stage the same version twice): npm answers `Cannot stage previously published version` to a second stage, and `previously staged` to a direct publish over it. npm says the same of a version already published: Relizy reads the package page to tell them apart, and fails with the right fix. Approve it or reject it: `relizy stage approve` or `relizy stage reject`. With [`skipExistingVersions`](./../config/publish.md#skipexistingversions), the package is skipped with the reason `already staged`, and counted in the approval of the release.

### The Code Is Refused in a Batch

A 2FA code is valid for a short time. Relizy asks again when npm refuses it, then retries the version. Pass a fresh code with `--otp`, or approve in smaller batches.

### A Package at `0.0.0-stage`

Staging a package that does not exist yet on npm creates a placeholder version `0.0.0-stage`. A local npm session or a stage-only token can do it; trusted publishing cannot create a package. Publish the first version from your machine, then run [`relizy trust`](./../cli/trust.md).

### The Package Manager Says It Published

`pnpm publish` can print success and exit `0` against a configuration that only allows staging, with no marker Relizy could read: it cannot tell the version was only staged. Stage the tag (`publish.staged`), or allow direct publish.

### Not Authenticated, or Refused in a CI

`relizy stage` and the approval fail in a CI, under trusted publishing, and without `npm login`: "staged versions can only be listed and approved from your npm login". Run `npm login`, then the command again.

## See Also

- [`publish.staged`](./../config/publish.md#staged) and [`publish.approve`](./../config/publish.md#approve)
- [`relizy stage`](./../cli/stage.md), [`relizy trust`](./../cli/trust.md)
- [Trusted publishing](./trusted-publishing.md), [Moving off npm tokens](./npm-token-migration.md)
- [`stage()`](./../api/stage.md), [Progress events](./../api/progress-events.md)
- [npm: staged publishing](https://docs.npmjs.com/staged-publishing)
