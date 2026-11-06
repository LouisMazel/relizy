---
title: AI Configuration
description: Options of the AI rewrites of the provider release notes and of the social posts - provider, model, credentials, language, fallback, prompts and targets.
keywords: ai config, ai provider, claude-code, ai-sdk, model, anthropic api key, extraGuidelines, systemPromptOverrides, providerRelease ai, social ai
category: Configuration
tags: [config, ai, claude, ai-sdk, release-notes, social]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

Every AI rewrite is off by default: turn on the targets you want with [`providerRelease`](#providerrelease) and [`social`](#social). Setup of the providers, dry run and examples: [AI-Enhanced Changelogs](./../guide/ai-changelog.md).

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  ai: {
    language: 'en',
    providerRelease: { enabled: true },
    social: {
      twitter: { enabled: true },
      slack: { enabled: true },
    },
  },
})
```

## provider

- **Type:** `'claude-code' | 'ai-sdk'`
- **Default:** `'claude-code'`

- `claude-code`: Claude, through `@yoloship/claude-sdk` and the `claude` CLI.
- `ai-sdk`: any model of the [Vercel AI SDK](https://ai-sdk.dev/) (OpenAI, Google, Mistral, Anthropic...), through `ai` and the package of the provider.

## providers

Options of each provider, by name.

### claude-code {#providers-claude-code}

#### apiKey

- **Type:** `string`
- **Default:** `tokens.ai['claude-code'].apiKey`, read from `RELIZY_ANTHROPIC_API_KEY` or `ANTHROPIC_API_KEY`

Anthropic API key.

#### oauthToken

- **Type:** `string`
- **Default:** `tokens.ai['claude-code'].oauthToken`, read from `RELIZY_CLAUDE_CODE_OAUTH_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN`

Claude Code OAuth token.

The API key and the OAuth token are resolved each on its own (this option, else `tokens.ai`, else the environment), and both are given to the Claude SDK. The safety check fails when neither is set. See [Tokens](./overview.md#tokens).

#### model {#claude-code-model}

- **Type:** `string`
- **Default:** `'haiku'`

Alias (`haiku`, `sonnet`, `opus`) or versioned id of the Claude model.

### ai-sdk {#providers-ai-sdk}

#### model {#ai-sdk-model}

- **Type:** `LanguageModel`
- **Required** with `provider: 'ai-sdk'`

A model of a provider package, or a model id of the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) (`'openai/gpt-5-mini'`, with `AI_GATEWAY_API_KEY`). Relizy does not read the credentials of this provider: the provider package reads its own environment variable (`OPENAI_API_KEY` for `@ai-sdk/openai`), or the options of an instance you create:

```ts
import { createOpenAI } from '@ai-sdk/openai'
import { defineConfig } from 'relizy'

const openai = createOpenAI({ apiKey: process.env.MY_OPENAI_API_KEY })

export default defineConfig({
  ai: {
    provider: 'ai-sdk',
    providers: {
      'ai-sdk': { model: openai('gpt-5-mini') },
    },
  },
})
```

#### reasoning

- **Type:** the `reasoning` option of `generateText()` of `ai` (`'provider-default'`, `'none'`, `'low'`, `'medium'`, `'high'`...)
- **Default:** not sent, the default of the provider applies

Reasoning effort, for the models that support it. A lower effort makes the rewrite faster and cheaper.

## language

- **Type:** `string`
- **Default:** `'en'`

Language of the output, as an ISO 639-1 code (`fr`) or an English name (`French`). Only the prose is translated: the code, the identifiers, the package names and the section headings stay as they are. To translate the headings, set the `title` of the [`types`](./changelog.md#types).

## fallback

- **Type:** `'raw' | 'fail'`
- **Default:** `'raw'`

When a call fails (network, quota, credentials):

- `raw`: warn, and keep the text without AI. With several versions in a post, a version missing from the output also keeps its raw changelog.
- `fail`: throw. `relizy provider-release` and `relizy social` fail with code `1`; in `relizy release`, the step is marked as failed and the release goes on, as for any failed provider release or post.

## extraGuidelines

- **Type:** `string | { global?: string, providerRelease?: string, twitter?: string, slack?: string, teams?: string }`

Directives appended to the built-in prompts. A string applies to every target. With an object, `global` applies to every target, then `providerRelease`, `twitter`, `slack` or `teams` to its target:

```ts
export default defineConfig({
  ai: {
    extraGuidelines: {
      global: 'Never mention the internal codename "Phoenix".',
      slack: 'Mention the team owning each change when the scope tells it.',
      twitter: 'Add the #opensource hashtag.',
    },
  },
})
```

## systemPromptOverrides

- **Type:** `{ providerRelease?: string, twitter?: string, slack?: string, teams?: string }`

Replaces the whole built-in prompt of a target: the base prompt, the prompt of the platform and the `extraGuidelines` are not sent for it. Prefer `extraGuidelines` to add rules.

Placeholders:

- <code v-pre>{{language}}</code>: [`language`](#language);
- <code v-pre>{{maxLength}}</code>: the length budget of the post. On Twitter, what the template leaves within `social.twitter.postMaxLength`. On Slack, `social.slack.postMaxLength`, else 2500 in `summary` format; in `full` format without `postMaxLength`, there is no budget and the placeholder is left as is.

The model receives the changelog in a `<changelog>` tag, after a `<release-context>` tag (project, version, previous version and kind of release, when known). When a post announces several versions, each changelog is sent in a `<release id="..." title="...">` element, and the instructions to answer one `<release id="...">` element per version are always appended, overridden prompt or not.

```ts
export default defineConfig({
  ai: {
    systemPromptOverrides: {
      twitter: 'Write one tweet of at most {{maxLength}} characters, in {{language}}, without hashtag.',
    },
  },
})
```

## providerRelease

### enabled {#providerrelease-enabled}

- **Type:** `boolean`
- **Default:** `false`

Rewrite the body of the GitHub and GitLab releases: the changes only, the compare link and the contributors are kept as generated. One call per provider release (one per package of an `independent` release).

A [version group](./monorepo.md#groups) can override it with its own `ai.providerRelease`, e.g. to create the releases of an `independent` group without AI:

```ts
export default defineConfig({
  ai: { providerRelease: { enabled: true } },
  monorepo: {
    groups: [
      { name: 'main', versionMode: 'selective', packages: ['packages/*'] },
      { name: 'tooling', versionMode: 'independent', packages: ['tooling/*'], ai: { providerRelease: { enabled: false } } },
    ],
  },
})
```

## social

### twitter {#social-twitter}

- **Type:** `{ enabled?: boolean }`
- **Default:** `{ enabled: false }`

Rewrite the changelog of the tweet as plain text, within its length budget. Only when `social.twitter.enabled` is also `true`.

### slack {#social-slack}

- **Type:** `{ enabled?: boolean }`
- **Default:** `{ enabled: false }`

Rewrite the changelog of the Slack message. The model writes standard markdown (never Slack mrkdwn), that Relizy converts with the [`changelog`](./social.md#slack-changelog) of the message: 3 to 8 bullets in `summary` format, every change in `full` format. Only when `social.slack.enabled` is also `true`.

### teams {#social-teams}

- **Type:** `{ enabled?: boolean }`
- **Default:** `{ enabled: false }`

Rewrite the changelog of the Teams cards as 3 to 8 short bullets (bold, italic and links only, as a card renders them). Only when `social.teams.enabled` is also `true` and [`social.teams.changelog`](./social.md#teams-changelog) is `'summary'`.

One call per enabled platform and per release, even when the post announces several versions.

## CLI

`--ai` and `--no-ai` of `relizy release`, `relizy provider-release` and `relizy social` turn every target on or off for the run. A dry run never calls the AI, unless `--ai-preview`: see [Dry Run](./../guide/ai-changelog.md#dry-run).
