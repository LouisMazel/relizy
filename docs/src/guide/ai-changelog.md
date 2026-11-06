---
title: AI-Enhanced Changelogs
description: Rewrite the GitHub/GitLab release notes and the social posts with AI (Claude Code or any Vercel AI SDK model), from the changelog Relizy generates.
keywords: ai changelog, ai release notes, claude code, anthropic, ai sdk, openai, gemini, ai social posts, ai-preview, relizy ai
category: Guide
tags: [guide, ai, changelog, release-notes, claude, ai-sdk, social]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## What It Does

Relizy generates the changelog from the commits, then a model rewrites it for each target you turn on:

| Target                               | Output                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| GitHub / GitLab release notes        | Markdown for the users: each change explained, the headings and references kept                           |
| [Twitter](./social-media.md#twitter) | Plain text, the most visible changes, within the length budget of the tweet                               |
| [Slack](./social-media.md#slack)     | Standard markdown, converted to Slack mrkdwn by Relizy, short or complete following its `changelogFormat` |

Only the changes are sent: the compare link, the contributors, the titles, the versions and the URLs are added by Relizy around the rewrite. The built-in prompts make the model:

- never invent a change, and keep every change of the release notes;
- keep the section headings of your [`types`](./../config/changelog.md#types) (text, emojis and order), the PR and issue references, the scopes and the links;
- keep the code blocks of the commit bodies (migration examples) and the breaking changes first;
- translate the prose only, never the code, the option or package names, in the [`language`](./../config/ai.md#language) you set;
- treat the commits as data: an instruction written in a commit message is rewritten like any other text, never followed.

Before the changelog, the model gets the context of the release: the project (or the package), the version, the previous one and the kind of release (`major release`, `prerelease (beta)`...). A social post only gets the project and the version, and a post of several versions gets none.

## Setup

Pick a provider:

| Provider                | Models                                                                                       | Requirements                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `claude-code` (default) | Claude (`haiku` by default)                                                                  | `@yoloship/claude-sdk`, the `claude` CLI, an Anthropic API key or a Claude Code OAuth token |
| `ai-sdk`                | Any model of the [Vercel AI SDK](https://ai-sdk.dev/): OpenAI, Google, Mistral, Anthropic... | `ai` and the package of the provider                                                        |

### Claude Code

1. Install the SDK, an optional peer dependency of Relizy:

   ```bash
   pnpm add -D @yoloship/claude-sdk
   ```

2. Install the `claude` CLI, which the SDK runs (in CI too, before Relizy):

   ```bash
   npm install -g @anthropic-ai/claude-code
   # or: brew install --cask claude-code
   # or: curl -fsSL https://claude.ai/install.sh | bash
   ```

3. Set `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` (or their `RELIZY_` variants): see [Tokens](./../config/overview.md#tokens) and [`providers['claude-code']`](./../config/ai.md#providers-claude-code).

Pick the model with [`providers['claude-code'].model`](./../config/ai.md#claude-code-model): `haiku` (fast and cheap, enough for these rewrites), `sonnet`, `opus` or a versioned id.

### Vercel AI SDK

1. Install `ai` and the [package of your provider](https://ai-sdk.dev/providers/ai-sdk-providers):

   ```bash
   pnpm add -D ai @ai-sdk/openai
   ```

2. Set the model:

   ```ts
   import { openai } from '@ai-sdk/openai'
   import { defineConfig } from 'relizy'

   export default defineConfig({
     ai: {
       provider: 'ai-sdk',
       providers: {
         'ai-sdk': { model: openai('gpt-5-mini'), reasoning: 'low' },
       },
     },
   })
   ```

3. Set the variable your provider package reads (`OPENAI_API_KEY` for `@ai-sdk/openai`, `GOOGLE_GENERATIVE_AI_API_KEY` for `@ai-sdk/google`): Relizy does not handle these credentials. See [`providers['ai-sdk']`](./../config/ai.md#providers-ai-sdk).

## Turn It On

Each target is independent:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  ai: {
    providerRelease: { enabled: true },
    social: {
      twitter: { enabled: true },
      slack: { enabled: false },
    },
  },
})
```

A social target also needs its platform (`social.twitter.enabled`, `social.slack.enabled`). A [version group](./../config/monorepo.md#groups) can override `ai.providerRelease`, e.g. to skip the AI for the many releases of an `independent` group (see [`providerRelease`](./../config/ai.md#providerrelease)).

`--ai` and `--no-ai` turn every target on or off for a run:

```bash
relizy release --ai
relizy provider-release --no-ai
relizy social --ai
```

With a target on, the safety check of the command checks the provider (credentials, packages, `claude` CLI) before anything is written.

## Dry Run

A dry run does **not** call the AI: each call costs. The release notes and the posts keep their raw text, and the output tells which rewrite is simulated:

```text
✨ The notes of v2.1.0: AI rewrite simulated (claude-code not called in dry run, see --ai-preview)
```

To see the real rewrites without releasing, add the global `--ai-preview`: the AI is called (it costs), and its output is shown in the previews of the dry run.

```bash
relizy release --dry-run --ai-preview
```

`--log-level verbose` also prints the system prompt and the input of each call, and the output of the model when it is called.

In a release, each rewrite is shown with its duration, its tokens and, with `claude-code`, its cost. The [summary of the release](./../config/release.md#report) adds up the calls.

## Calls and Cost

- Provider release: one call per release created, so one per package of an `independent` release.
- Social posts: one call per platform with AI, even when the post announces several versions: each version is sent in its own element and read back, a version missing from the output keeps its raw changelog.
- Dry run: no call, unless `--ai-preview`.

## Customize the Output

Add rules to the built-in prompts with [`extraGuidelines`](./../config/ai.md#extraguidelines), for every target or for one:

```ts
export default defineConfig({
  ai: {
    language: 'fr',
    extraGuidelines: {
      global: 'Keep the package names and the references in English.',
      twitter: 'Add the #opensource hashtag.',
    },
  },
})
```

Replace the prompt of a target with [`systemPromptOverrides`](./../config/ai.md#systempromptoverrides) when you need full control: the built-in rules are then not sent for it.

When a call fails, [`fallback`](./../config/ai.md#fallback) keeps the raw text (`raw`, default, with a warning) or stops the command (`fail`).

## Example

Release notes generated from the commits:

```md
### 🚀 Enhancements

- **auth:** Add OAuth2 PKCE flow support ([#142](https://github.com/acme/app/pull/142))

  Public clients can no longer keep a secret. `createClient({ pkce: true })` enables it.

### 🩹 Fixes

- **core:** Fix memory leak in connection pool ([#145](https://github.com/acme/app/pull/145))
```

The same notes rewritten by the model, for example:

```md
### 🚀 Enhancements

- **auth:** Public clients can now sign in safely with the OAuth2 PKCE flow: pass `pkce: true` to `createClient` ([#142](https://github.com/acme/app/pull/142))

### 🩹 Fixes

- **core:** The connection pool no longer leaks memory under sustained load ([#145](https://github.com/acme/app/pull/145))
```

## Troubleshooting

| Error                                                         | Fix                                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `No authentication credential found for claude-code provider` | Set an Anthropic API key or a Claude Code OAuth token                                   |
| `@yoloship/claude-sdk is not installed`                       | `pnpm add -D @yoloship/claude-sdk`                                                      |
| ``The `claude` CLI binary was not found on PATH``             | Install the `claude` CLI, in CI too                                                     |
| `No model configured for the ai-sdk provider`                 | Set `ai.providers['ai-sdk'].model`                                                      |
| `ai is not installed`                                         | `pnpm add -D ai` and the package of your provider                                       |
| `Unknown AI provider`                                         | `ai.provider` is `'claude-code'` or `'ai-sdk'`                                          |
| `AI generation failed, falling back to raw body`              | The error of the provider follows (credentials of the provider package, quota, network) |

When the output is not what you want: check the prompt with `--dry-run --log-level verbose`, the output with `--dry-run --ai-preview`, then add `extraGuidelines` before overriding the prompt.

## See Also

- [AI Configuration](./../config/ai.md)
- [Social Media](./social-media.md)
- [`relizy provider-release`](./../cli/provider-release.md)
- [`relizy social`](./../cli/social.md)
