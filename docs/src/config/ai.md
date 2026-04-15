---
title: AI Configuration
description: Full reference for configuring AI-enhanced changelogs, release notes, and social media announcements.
keywords: ai config, ai configuration, claude config, ai provider, relizy ai settings, ai changelog config, ai release notes config
category: Configuration
tags: [config, ai, claude, provider, release-notes, social-media]
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
  provider?: 'claude-code'
  providers?: {
    'claude-code'?: {
      apiKey?: string
      oauthToken?: string
      model?: string
    }
  }
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

| Field                            | Default         |
| -------------------------------- | --------------- |
| `provider`                       | `'claude-code'` |
| `providers['claude-code'].model` | `'haiku'`       |
| `language`                       | `'en'`          |
| `fallback`                       | `'raw'`         |
| `providerRelease.enabled`        | `false`         |
| `social.twitter.enabled`         | `false`         |
| `social.slack.enabled`           | `false`         |

## `provider`

- **Type:** `'claude-code'`
- **Default:** `'claude-code'`

The AI provider to use. Today only `'claude-code'` ships with Relizy, powered
by [`@yoloship/claude-sdk`](https://www.npmjs.com/package/@yoloship/claude-sdk).
The provider layer is pluggable — see [Adding a new provider](#adding-a-new-ai-provider).

## `providers['claude-code']`

### `apiKey`

- **Type:** `string`
- **Default:** `process.env.RELIZY_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY`

Anthropic API key. Usually supplied via environment variable — see
[Credential resolution](#credential-resolution).

### `oauthToken`

- **Type:** `string`
- **Default:** `process.env.RELIZY_CLAUDE_CODE_OAUTH_TOKEN || process.env.CLAUDE_CODE_OAUTH_TOKEN`

Claude Code OAuth token, used when you are signed in with `claude login`
rather than an API key.

### `model`

- **Type:** `string`
- **Default:** `'haiku'`

Claude model alias or id. The Claude CLI accepts short aliases:

- `'haiku'` — fastest, cheapest (default, recommended)
- `'sonnet'` — balanced quality/cost
- `'opus'` — highest quality, slower, more expensive
- Or a fully versioned id like `'claude-sonnet-4-6'`

```ts
export default defineConfig({
  ai: {
    providers: {
      'claude-code': { model: 'sonnet' },
    },
  },
})
```

## Credential resolution

Credentials are resolved in this order; the **first match wins**:

1. `config.ai.providers['claude-code'].apiKey` / `.oauthToken`
2. `config.tokens.ai['claude-code'].apiKey` / `.oauthToken`
3. `process.env.RELIZY_ANTHROPIC_API_KEY` → `process.env.ANTHROPIC_API_KEY`
4. `process.env.RELIZY_CLAUDE_CODE_OAUTH_TOKEN` → `process.env.CLAUDE_CODE_OAUTH_TOKEN`

The `RELIZY_`-prefixed variants let you scope credentials without clashing
with other tools that also read `ANTHROPIC_API_KEY`.

```ts
// Option 1: inline in ai.providers
export default defineConfig({
  ai: {
    providers: {
      'claude-code': { apiKey: 'sk-ant-...' },
    },
  },
})

// Option 2: grouped with other tokens
export default defineConfig({
  tokens: {
    ai: {
      'claude-code': { apiKey: 'sk-ant-...' },
    },
  },
})

// Option 3 (recommended for CI): env var only, no config needed
// export RELIZY_ANTHROPIC_API_KEY=sk-ant-...
```

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
Anthropic had a hiccup. Use `'fail'` in strict CI where AI-enhanced content
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
    providerRelease: { enabled: true },
    social: {
      twitter: { enabled: true },
      slack: { enabled: true },
    },
  },
})
```

With `RELIZY_ANTHROPIC_API_KEY` (or `ANTHROPIC_API_KEY`) set in the
environment, nothing else is required.

### GitHub + Twitter only, strict CI mode

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  ai: {
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
    language: 'fr',
    providers: {
      'claude-code': { model: 'sonnet' },
    },
    providerRelease: { enabled: true },
    social: {
      slack: { enabled: true },
    },
  },
})
```

## Adding a new AI provider

The `ai` system is a small registry of providers behind a single interface.
Adding a second provider means:

### 1. Implement `AIProvider`

Create `src/core/ai/providers/my-provider.ts`:

```ts
import type { ResolvedRelizyConfig } from '../../config'
import type { AIGenerateRequest, AIProvider } from '../provider'

export const myProvider: AIProvider = {
  name: 'my-provider',

  async safetyCheck(config) {
    // Throw an actionable error when auth or dependencies are missing.
  },

  async generate(config, request) {
    // Call your model with request.systemPrompt + request.prompt.
    // Honor request.maxLength for Twitter-like targets.
    // Return the trimmed output.
  },
}
```

### 2. Register it

In `src/core/ai/registry.ts`:

```ts
import { myProvider } from './providers/my-provider'

const providers = {
  'claude-code': claudeCodeProvider,
  'my-provider': myProvider,
}
```

### 3. Extend types

In `src/types.ts`:

```ts
export type AIProviderName = 'claude-code' | 'my-provider'

export interface AIConfig {
  providers?: {
    'claude-code'?: ClaudeCodeProviderOptions
    'my-provider'?: MyProviderOptions
  }
  // ...
}
```

That's it — the engine, call-sites, and CLI flags work unchanged.

## See also

- [AI-Enhanced Changelogs guide](/guide/ai-changelog) — getting started walkthrough
- [Provider release CLI](/cli/provider-release) — `--ai` / `--no-ai` flags
- [Social CLI](/cli/social) — social-specific flags
- [Social config](/config/social) — Twitter/Slack settings
