---
title: AI Configuration
description: Configure Vercel AI SDK providers for AI-enhanced changelogs, release notes, and social media announcements.
keywords: ai config, ai configuration, vercel ai sdk, ai provider, relizy ai settings, ai changelog config, ai release notes config
category: Configuration
tags: [config, ai, provider, release-notes, social-media]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Overview

The `ai` section of your Relizy config controls AI-enhanced changelogs. Every
AI feature is **opt-in**: disabling the section (or leaving `enabled: false`
on every target) restores the original changelog output byte-for-byte.

## Shape

```ts
interface AIConfig {
  provider?: AIProviderName
  model?: string
  apiKey?: string
  providerOptions?: Record<string, unknown>
  language?: string
  fallback?: 'raw' | 'fail'
  extraGuidelines?: string
  systemPromptOverrides?: {
    providerRelease?: string
    twitter?: string
    slack?: string
  }
  providerRelease?: { enabled?: boolean }
  social?: {
    twitter?: { enabled?: boolean }
    slack?: { enabled?: boolean }
  }
}
```

## Defaults

Relizy ships with sensible defaults that you can override selectively.

| Field                     | Default |
| ------------------------- | ------- |
| `provider`                | None    |
| `model`                   | None    |
| `language`                | `'en'`  |
| `fallback`                | `'raw'` |
| `providerRelease.enabled` | `false` |
| `social.twitter.enabled`  | `false` |
| `social.slack.enabled`    | `false` |

## `provider` and `model`

Set both fields when you enable an AI target. `provider` selects an official
Vercel AI SDK text provider, and `model` is the model ID accepted by that
provider. Relizy passes model IDs through without maintaining a model list.

Supported provider IDs are `anthropic`, and `google`.

Install `ai` and the selected `@ai-sdk/*` adapter in your project. Both are
optional peers of Relizy, and Relizy loads only the selected adapter.
The current AI SDK 7 packages require Node.js 22 or newer; Relizy itself still
runs on Node.js 20 when you do not enable AI.

```bash
pnpm add -D ai @ai-sdk/anthropic
```

```ts
export default defineConfig({
  ai: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    providerRelease: { enabled: true },
  },
})
```

## `apiKey` and credentials

`ai.apiKey` supplies the selected provider's API key. Relizy checks credentials
in this order: `ai.apiKey`, `tokens.ai`, `ai.providerOptions.apiKey`,
then provider environment variables. For each recognized environment variable,
Relizy checks its `RELIZY_`-prefixed form first. Providers that use cloud
identity or local runtimes can use their standard environment and
`providerOptions` instead of an API key.

```ts
export default defineConfig({
  ai: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    apiKey: process.env.RELIZY_ANTHROPIC_AI_API_KEY,
  },
  tokens: {
    ai: process.env.ANTHROPIC_AI_API_KEY,
  },
})
```

For CI, use the provider's standard environment variable or the corresponding
`RELIZY_`-prefixed name. This keeps secrets out of the config file.

## `providerOptions`

- **Type:** `Record<string, unknown>`
- **Default:** `undefined`

Pass provider factory settings such as a base URL, region, or project ID. The
options depend on the selected adapter; check that adapter's Vercel AI SDK
documentation for supported fields.

## `language`

- **Type:** `string`
- **Default:** `'en'`

Output language for the AI. ISO 639-1 code or English name both work —
the value is substituted into the system prompt as-is.

```ts
export default defineConfig({
  ai: { language: 'fr' },
})
```

## `fallback`

- **Type:** `'raw' | 'fail'`
- **Default:** `'raw'`

How Relizy reacts when an AI call fails (network, quota, invalid credentials).

| Value    | Behavior                                            |
| -------- | --------------------------------------------------- |
| `'raw'`  | Log a warning and use the unmodified changelog body |
| `'fail'` | Re-throw the error — the release stops              |

`'raw'` is safe for most workflows — a release should not fail because
the selected AI provider has an outage. Use `'fail'` in strict CI where AI-enhanced content
is non-negotiable.

## `extraGuidelines`

- **Type:** `string`
- **Default:** `undefined`

Free-form directives appended to every built-in prompt. This is the right
place to add tone, vocabulary, or project-specific rules without rewriting
the whole prompt.

```ts
export default defineConfig({
  ai: {
    extraGuidelines: [
      'Never mention the internal project codename "Phoenix".',
      'When a commit scope is "api", prefix the line with "API:".',
    ].join('\n'),
  },
})
```

## `systemPromptOverrides`

- **Type:** `{ providerRelease?, twitter?, slack? }`
- **Default:** `undefined`

Fully replace the built-in prompt for a single target. When set for a
target, the base prompt, platform prompt, and `extraGuidelines` are all
ignored for that target — the override owns the full instruction.

Supports the same placeholders as built-in prompts: `{{language}}` and,
for Twitter, `{{maxLength}}`.

```ts
export default defineConfig({
  ai: {
    systemPromptOverrides: {
      providerRelease: 'Rewrite the changelog as a blog post with headers.',
      twitter: 'Write one hype tweet, max {{maxLength}} chars, no hashtags.',
      // slack left untouched — uses the built-in prompt
    },
  },
})
```

::: warning
Overrides replace **everything**. If you only want to add rules on top of
the defaults, use `extraGuidelines` instead.
:::

## `providerRelease.enabled`

- **Type:** `boolean`
- **Default:** `false`

Turns AI rewriting on for GitHub and GitLab release bodies. The compare
link (top) and contributors section (bottom) never pass through AI — only
the middle "changes" body.

```ts
export default defineConfig({
  ai: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    providerRelease: { enabled: true },
  },
})
```

## `social.twitter.enabled` / `social.slack.enabled`

- **Type:** `boolean`
- **Default:** `false`

Turns AI rewriting on per social platform. Twitter receives a plain-text
output capped at `social.twitter.postMaxLength`; Slack receives a short
Slack-flavored markdown block.

```ts
export default defineConfig({
  ai: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    social: {
      twitter: { enabled: true },
      slack: { enabled: false }, // keep Slack raw
    },
  },
})
```

## Complete examples

### Minimal — all targets on

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  ai: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    providerRelease: { enabled: true },
    social: {
      twitter: { enabled: true },
      slack: { enabled: true },
    },
  },
})
```

With `ai`, the selected adapter, and the provider API key configured, Relizy
rewrites enabled targets.

### GitHub + Twitter only, strict CI mode

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  ai: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    fallback: 'fail',
    providerRelease: { enabled: true },
    social: {
      twitter: { enabled: true },
    },
    extraGuidelines: 'Lead with breaking changes when present.',
  },
})
```

### French output with a custom model

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  ai: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    language: 'fr',
    providerRelease: { enabled: true },
    social: {
      slack: { enabled: true },
    },
  },
})
```

## Provider support

Relizy supports the official Vercel AI SDK text-provider adapters listed in
[`provider` and `model`](#provider-and-model). Each adapter is an optional peer
dependency; install only the adapter you select. Model availability and model
IDs are managed by the provider, not by Relizy.

## See also

- [AI-Enhanced Changelogs guide](/guide/ai-changelog) — getting started walkthrough
- [Provider release CLI](/cli/provider-release) — `--ai` / `--no-ai` flags
- [Social CLI](/cli/social) — social-specific flags
- [Social config](/config/social) — Twitter/Slack settings
