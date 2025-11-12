---
title: Migration guide
description: From @maz-ui/changelogen-monorepo 4.3.1 to relizy
keywords: migration guide, changelogen migration, upgrade to relizy, migration from changelogen, relizy migration
category: Guide
tags: [guide, migration, upgrade, changelogen]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Environment variables

- `CHANGELOGEN_TOKENS_GITHUB` -> `RELIZY_GITHUB_TOKEN`
- `CHANGELOGEN_TOKENS_GITLAB` -> `RELIZY_GITLAB_TOKEN`

## Configuration File

- `changelog.config.ts` -> `relizy.config.ts`
- `changelog.config.js` -> `relizy.config.js`
- `changelog.config.json` -> `relizy.config.json`
- `changelog.config.yaml` -> `relizy.config.yaml`
- `changelog.config.toml` -> `relizy.config.toml`

## CLI

- `changelog` -> `relizy`
- `changelog --config changelog release` -> `relizy --config changelog release`

## Configuration Changes

### safetyCheck

Added new option `safetyCheck` to verify if tokens or others required for release are set (depends on the release options)

Disable it with `relizy release --no-safety-check`

Or in your config file

```ts
export default defineConfig({
  safetyCheck: false
})
```

### monorepo

Because Relizy is working now working with standalone packages, the `monorepo` option is not needed anymore.

If you using relizy in the some folder of your package, you don't need to specify a monorepo config.
By default relizy will use the package.json of the current folder.

### bump

#### `bump.yes`

Before the default value was `true`, now it is `false`.

To avoid any mistake, by default the CLI will ask you to confirm the version bump.

Use `relizy release --yes` to skip the confirmation (useful for CI/CD).

### changelog

#### `changelog.includeCommitBody`

Before the default value was `false`, now it is `true`.

Now, by default the changelog will include the commit body.
