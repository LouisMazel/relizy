---
title: Configuration
description: The relizy.config.ts file, its sections, the top-level options, the tokens and their environment variables, and how to keep several configs.
keywords: relizy config, relizy.config.ts, configuration reference, defineConfig, tokens, environment variables, GITHUB_TOKEN, NPM_TOKEN, multiple configs, --config, projectName, repo, scopeMap, safetyCheck, signTags, logLevel
category: Configuration
tags: [config, configuration, reference, tokens]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Config File

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*'],
  },
})
```

The config is loaded with [c12](https://github.com/unjs/c12) from the root of the project and merged with the defaults. Supported files:

- `relizy.config.ts` (recommended, typed by `defineConfig`), `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`
- `relizy.config.json`, `.yaml`, `.yml`, `.toml`
- the `relizy` field of the root `package.json`

A standalone package needs no config. A monorepo needs `monorepo.versionMode` and `monorepo.packages`, or `monorepo.groups` (see [Monorepo](./monorepo.md)). Run `relizy init` to generate the file.

An array of the config replaces the default one instead of being merged with it: `bump.dependencyTypes: ['peerDependencies']` does not keep `dependencies`.

## Sections

| Key                                                                                                                                                            | Page                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `monorepo`                                                                                                                                                     | [Monorepo](./monorepo.md)               |
| `bump`                                                                                                                                                         | [Bump](./bump.md)                       |
| `changelog`, `types`, `excludeAuthors`, `noAuthors`, `hideAuthorEmail`                                                                                         | [Changelog](./changelog.md)             |
| `publish`                                                                                                                                                      | [Publish](./publish.md)                 |
| `release`                                                                                                                                                      | [Release](./release.md)                 |
| `templates`                                                                                                                                                    | [Templates](./commit-templates.md)      |
| `ai`                                                                                                                                                           | [AI](./ai.md)                           |
| `social`                                                                                                                                                       | [Social](./social.md)                   |
| `prComment`                                                                                                                                                    | [PR Comment](./pr-comment.md)           |
| `hooks`                                                                                                                                                        | [Hooks](./hooks.md)                     |
| `commitlint`                                                                                                                                                   | [Commitlint](./../commitlint/config.md) |
| `projectName`, `cwd`, `from`, `to`, `newVersion`, `logLevel`, `safetyCheck`, `signTags`, `scopeMap`, `repo`, `tokens`, `detectRewrittenTags`, `onRewrittenTag` | This page                               |

## projectName

- **Type:** `string`
- **Default:** the `name` of the root `package.json`

Name of the project in the social posts, the release titles and the AI prompts.

## cwd

- **Type:** `string`
- **Default:** `process.cwd()`

Root of the project: where the config, the packages, the git repository and the package manager are read.

## from / to

- **Type:** `string`
- **Default:** `from`: the last release tag; `to`: the tag of the new version, else `HEAD`
- **CLI:** `--from <ref>`, `--to <ref>`

Git range of the commits read by the changelog, the provider release and the social posts.

## newVersion

- **Type:** `string`

Declared in the types, not read by the commands: the new versions come from the bump.

## logLevel

- **Type:** `'silent' | 'error' | 'warning' | 'normal' | 'default' | 'debug' | 'trace' | 'verbose'`
- **Default:** `'default'`
- **CLI:** `--log-level <level>`

`verbose` shows the logs of each step, `debug` how relizy resolves the config, the tags and the versions.

## safetyCheck

- **Type:** `boolean`
- **Default:** `true`
- **CLI:** `--no-safety-check`

Global switch of the checks run before writing anything: the tokens and the registry authentication (`publish`, also gated by [`publish.safetyCheck`](./publish.md#safetycheck)), the provider token (`provider-release`), the social credentials (`social`), and in `relizy release` the branch being up to date with its remote.

## signTags

- **Type:** `boolean`
- **Default:** `false`

Sign the release tags with GPG (`git tag -s`).

## scopeMap

- **Type:** `Record<string, string>`
- **Default:** `{}`

Renames the scopes of the commits in the changelogs (`{ ui: 'components' }`). Its keys are also allowed scopes for [`relizy commitlint`](./../commitlint/rules.md#scope-enum).

## repo

- **Type:** `{ provider?: 'github' | 'gitlab' | 'bitbucket', domain?: string, repo?: string }`
- **Default:** resolved from the `repository` field of the closest `package.json`, else from the `origin` remote

The repository of the links of the changelogs and of the provider releases. Set it for a self-hosted instance, or when neither the `repository` field nor the remote is usable. When set, it replaces the detected one entirely.

| Key        | Effect                                                        |
| ---------- | ------------------------------------------------------------- |
| `provider` | `github`, `gitlab` or `bitbucket`, detected from the domain   |
| `domain`   | Host of the repository (`github.com`, `gitlab.mycompany.com`) |
| `repo`     | `owner/name`                                                  |

```ts
export default defineConfig({
  repo: { provider: 'gitlab', domain: 'gitlab.mycompany.com', repo: 'team/project' },
})
```

## tokens

The credentials of the commands. Each key falls back to the first environment variable set, in this order (a `.env` file at the root is loaded):

| Key                                   | Environment variables                                                     | Used by                              |
| ------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------ |
| `tokens.registry`                     | `RELIZY_NPM_TOKEN`, `NPM_TOKEN`, `NODE_AUTH_TOKEN`                        | `publish` (npm, pnpm, bun)           |
| `tokens.github`                       | `RELIZY_GITHUB_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`                         | GitHub releases, PR comment          |
| `tokens.gitlab`                       | `RELIZY_GITLAB_TOKEN`, `GITLAB_TOKEN`, `GITLAB_API_TOKEN`, `CI_JOB_TOKEN` | GitLab releases, MR comment, push    |
| `tokens.twitter.apiKey`               | `RELIZY_TWITTER_API_KEY`, `TWITTER_API_KEY`                               | Twitter (X)                          |
| `tokens.twitter.apiKeySecret`         | `RELIZY_TWITTER_API_KEY_SECRET`, `TWITTER_API_KEY_SECRET`                 | Twitter (X)                          |
| `tokens.twitter.accessToken`          | `RELIZY_TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN`                     | Twitter (X)                          |
| `tokens.twitter.accessTokenSecret`    | `RELIZY_TWITTER_ACCESS_TOKEN_SECRET`, `TWITTER_ACCESS_TOKEN_SECRET`       | Twitter (X)                          |
| `tokens.slack`                        | `RELIZY_SLACK_TOKEN`, `SLACK_TOKEN`                                       | Slack (bot token)                    |
| `tokens.ai['claude-code'].apiKey`     | `RELIZY_ANTHROPIC_API_KEY`, `ANTHROPIC_API_KEY`                           | AI, `claude-code` provider           |
| `tokens.ai['claude-code'].oauthToken` | `RELIZY_CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`               | AI, `claude-code` provider           |
| `social.slack.webhookUrl`             | `RELIZY_SLACK_WEBHOOK_URL`, `SLACK_WEBHOOK_URL`                           | Slack (webhook, wins over the token) |

A more specific setting wins over these keys:

- registry: `publish.registries[].token`, then `tokens.registry` (set by `--publish-token`)
- provider: `tokens.github` or `tokens.gitlab` (both set by `--token`)
- Twitter and Slack: `social.twitter.credentials` and `social.slack.credentials`, see [Social](./social.md)
- AI: `ai.providers['claude-code'].apiKey` and `oauthToken`, see [AI](./ai.md)

Keep the tokens out of the config file: set the environment variables in the CI (see [CI/CD](./../guide/ci-cd.md)).

## detectRewrittenTags

- **Type:** `boolean`
- **Default:** `true`

Detect a `from` tag no longer reachable from `to` (the history was rebased after the tag was created) and recover, instead of reading the whole diverged range. See [Rewritten Tags](./../guide/rewritten-tags.md).

## onRewrittenTag

- **Type:** `'prompt' | 'ephemeral' | 'rebind' | 'error'`
- **Default:** `prompt` in an interactive terminal, `ephemeral` otherwise (`--yes`, CI, no TTY)

What to do with a rewritten tag: ask, use the equivalent reachable commit for this run, move the local tag onto it (no push), or fail. See [Rewritten Tags](./../guide/rewritten-tags.md).

## Multiple Configs

Several configs can coexist, named `relizy.<name>.config.ts`, and are selected with `--config` (the name without `.config.<ext>`):

```bash
relizy release                             # relizy.config.ts
relizy release --config relizy.standalone  # relizy.standalone.config.ts
```

```ts
// relizy.standalone.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: { access: 'public' },
})
```

The programmatic API takes the same name in `configName` (`release({ configName: 'relizy.standalone' })`), and `relizy commitlint --config <name>` lints with the scopes of that config. A missing config file given with `--config` is an error.

To release packages with different version modes (a `selective` set and an `independent` one) from the same repository, use [version groups](./../guide/version-groups.md) instead of two configs: a single run bumps, publishes and tags every package with the right dependency versions.
