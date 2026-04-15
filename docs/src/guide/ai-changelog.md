---
title: AI-Enhanced Changelogs
description: Use Claude to turn raw commit-based changelogs into polished release notes and social media posts.
keywords: ai changelog, ai release notes, claude ai, ai social media, intelligent changelog, relizy ai, automated release notes
category: Guide
tags: [ai, changelog, release-notes, claude, social-media, automation]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## What it does

Relizy can pass your commit-based changelog through Claude to produce
cleaner, more readable content for:

- **GitHub / GitLab release notes** — commits get rewritten into
  end-user-facing prose while the compare link and contributor list stay
  untouched.
- **Twitter** — a short, plain-text announcement that fits within the
  character limit.
- **Slack** — a concise Slack-flavored markdown summary for your release
  channel.

Under the hood, Relizy:

1. Builds the raw changelog from your commits (as before).
2. Sends **only the body** to Claude with a target-specific system prompt.
3. Reassembles the final output: compare link + AI body + contributors
   (for provider releases), or pipes AI output into your template (for
   social).

The raw changelog remains the source of truth. PR/issue references,
commit scopes, and links are preserved exactly. Nothing is invented.

## When to enable it

Turn AI on when you want:

- Release notes that read like a human wrote them, without manual editing.
- Platform-appropriate social posts (short for Twitter, structured for
  Slack) from the same source.
- Consistent tone across every release.

AI is **off by default**. With it disabled, Relizy behaves exactly like
before. You can also toggle AI per-target or globally via the CLI.

## Setup

### 1. Install the Claude SDK

It's an optional peer dependency — you only need it when AI is enabled.

::: code-group

```bash [pnpm]
pnpm add -D @yoloship/claude-sdk
```

```bash [npm]
npm install -D @yoloship/claude-sdk
```

```bash [yarn]
yarn add -D @yoloship/claude-sdk
```

:::

### 2. Install the `claude` CLI binary

The SDK spawns the `claude` CLI under the hood, so the binary must be on `PATH`.

```bash
# npm (global) — works everywhere, recommended for CI
npm install -g @anthropic-ai/claude-code

# Homebrew (macOS)
brew install --cask claude-code

# Native installer
curl -fsSL https://claude.ai/install.sh | bash
```

In CI, add a step before running Relizy:

```yaml
- name: Install Claude Code CLI
  run: npm install -g @anthropic-ai/claude-code
```

### 3. Provide credentials

Export your Anthropic API key (recommended for CI):

```bash
export RELIZY_ANTHROPIC_API_KEY="sk-ant-..."
# or, if you prefer the vendor-standard name:
export ANTHROPIC_API_KEY="sk-ant-..."
```

If you use Claude Code's OAuth flow instead, export the token:

```bash
export RELIZY_CLAUDE_CODE_OAUTH_TOKEN="..."
# or
export CLAUDE_CODE_OAUTH_TOKEN="..."
```

Credentials can also live in your config file — see
[Credential resolution](/config/ai#credential-resolution).

### 4. Enable AI in your config

```ts
// relizy.config.ts
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

That's all — your next release will have AI-rewritten notes.

## Model

By default Relizy uses the `haiku` alias — fast and cheap, which is the
right profile for short rewrites. Pick a different alias or a fully
versioned id if you want more depth:

```ts
export default defineConfig({
  ai: {
    providers: {
      'claude-code': { model: 'sonnet' }, // or 'opus', or 'claude-sonnet-4-6'
    },
  },
})
```

See the full reference in [AI Configuration](/config/ai#model).

## Preview with `--dry-run`

In dry-run mode, the AI call **does** execute — that's the point of the
preview — but nothing is published. You'll see the rewritten output in
Relizy's log boxes, and the API calls to GitHub, GitLab, Twitter, and
Slack are skipped.

```bash
relizy release --patch --dry-run
```

In the output you'll see things like:

```
ℹ ✨ Rewriting release notes with AI (provider: claude-code)
ℹ ✅ AI rewrite done in 1240ms (612 → 431 chars)

┌────────────────────────────────────┐
│ [dry-run] Release Preview          │
│ Tag: v2.1.0                        │
│ ...rewritten body here...          │
└────────────────────────────────────┘
```

For deeper inspection, bump the log level:

```bash
relizy release --patch --dry-run --log-level verbose
```

This prints the full system prompt, the raw input, and the AI output for
every target.

## Per-target control

Each target is independent. Enable only what you need:

```ts
export default defineConfig({
  ai: {
    providerRelease: { enabled: true }, // GitHub/GitLab: ON
    social: {
      twitter: { enabled: true }, // Twitter: ON
      slack: { enabled: false }, // Slack: OFF (keep raw)
    },
  },
})
```

## CLI flags

Override config at runtime:

```bash
# Force AI on for this run (all applicable targets)
relizy release --patch --ai
relizy provider-release --ai
relizy social --ai

# Force AI off for this run
relizy release --patch --no-ai
```

`--ai` / `--no-ai` override whatever is in the config file for the
duration of the command.

## Customizing the output

### Extra guidelines — add rules on top of defaults

The most common case. Appended to every built-in prompt.

```ts
export default defineConfig({
  ai: {
    extraGuidelines: [
      'Lead with breaking changes when present.',
      'Never mention the internal codename "Phoenix".',
      'When scope is "api", start the line with "API:".',
    ].join('\n'),
  },
})
```

### System prompt overrides — take full control

Replace the built-in prompt for a specific target. You own everything
when you do this — the base prompt is not included.

```ts
export default defineConfig({
  ai: {
    systemPromptOverrides: {
      providerRelease: 'Write a blog-style post. Use H2 headers. Output language: {{language}}.',
      twitter: 'One hype tweet. Max {{maxLength}} chars. No hashtags.',
      // slack not set → built-in Slack prompt is used
    },
  },
})
```

Placeholders available: `{{language}}` everywhere, plus `{{maxLength}}`
for Twitter.

### Non-English output

```ts
export default defineConfig({
  ai: {
    language: 'fr',
    extraGuidelines: 'Garde les noms de packages et les références en anglais.',
  },
})
```

## Fallback behavior

If the AI call fails — network error, quota, invalid credentials — Relizy
decides based on `ai.fallback`:

| Mode              | Behavior                                                           |
| ----------------- | ------------------------------------------------------------------ |
| `'raw'` (default) | Log a warning and use the unmodified changelog. Release continues. |
| `'fail'`          | Re-throw with context. The release aborts.                         |

```ts
export default defineConfig({
  ai: {
    fallback: 'fail', // strict mode — don't ship raw when AI was expected
  },
})
```

Pick `'raw'` for most workflows. Pick `'fail'` in CI where AI-enhanced
content is contractual.

## Cost and latency

Claude Haiku (the default) is fast and inexpensive. A typical call for
release notes processes a few hundred tokens and completes in 1–3
seconds.

Counts per release:

- Provider release: **1 call** (or 1 per package in independent mode).
- Social: **1 call per enabled platform**.

Use `--dry-run` while you're tuning prompts to avoid spending on trial
runs that don't publish.

## Before / after

### Provider release — raw commits

```md
### 🚀 Enhancements

- **auth**: add OAuth2 PKCE flow support (abc1234)
- **api**: implement rate limiting middleware (#142)

### 🩹 Fixes

- **core**: fix memory leak in connection pool (def5678)

#### ⚠️ Breaking Changes

- **auth**: remove deprecated session-based auth (#138)
```

### Provider release — AI-rewritten

```md
### 🚀 Enhancements

- **auth**: Added OAuth2 PKCE flow support for public clients needing safer login (abc1234)
- **api**: Introduced rate-limiting middleware to protect endpoints from abuse (#142)

### 🩹 Fixes

- **core**: Fixed a memory leak in the connection pool that could build up under sustained load (def5678)

#### ⚠️ Breaking Changes

- **auth**: Removed deprecated session-based authentication (#138). Migrate to OAuth2 or token auth.
```

Compare link and contributors section are added back automatically around
this body — they never touch AI.

### Twitter — AI-rewritten (inside your template)

Template:

```
🚀 {{projectName}} {{newVersion}} is out!

{{changelog}}

{{releaseUrl}}
```

Result:

```
🚀 my-app 2.1.0 is out!

OAuth2 PKCE support for safer public-client login, rate-limiting to keep endpoints healthy, and a connection-pool memory leak is gone.

https://github.com/user/my-app/releases/tag/v2.1.0
```

### Slack — AI-rewritten

```
• *OAuth2 PKCE flow* — safer login for public clients
• *Rate-limiting middleware* — protects API endpoints
• *Memory leak fix* — connection pool under sustained load
```

## Troubleshooting

### "No authentication credential found"

No API key or OAuth token reached the provider. Check:

```bash
echo $RELIZY_ANTHROPIC_API_KEY
echo $ANTHROPIC_API_KEY
echo $CLAUDE_CODE_OAUTH_TOKEN
```

Or set it directly in config — see
[Credential resolution](/config/ai#credential-resolution).

### "@yoloship/claude-sdk is not installed"

Install it:

```bash
pnpm add -D @yoloship/claude-sdk
```

### "The `claude` CLI binary was not found on PATH"

The SDK needs the Claude Code CLI to run. Install it:

```bash
npm install -g @anthropic-ai/claude-code
```

In CI, add it as a step before running Relizy. See [Installation](/guide/installation#ai-enhanced-changelogs-optional).

### "Unknown AI provider"

You set `ai.provider` to something Relizy doesn't know. Today only
`'claude-code'` ships by default. See
[Adding a new AI provider](/config/ai#adding-a-new-ai-provider) if you
want to plug your own.

### The AI output isn't what I want

1. Preview with `--dry-run --log-level verbose` to see the exact prompt
   and input.
2. Start with `extraGuidelines` — it's the lightest lever.
3. Move to `systemPromptOverrides` for a target when you need full
   control.

### Rate limiting

The default `fallback: 'raw'` means a rate-limited request simply falls
back to the unmodified changelog. For heavy release cadence, consider:

- Using a lower-volume model or spacing releases.
- `--no-ai` for non-critical releases.

## Next steps

- [AI Configuration reference](/config/ai) — every option with types and defaults
- [Provider release CLI](/cli/provider-release) — command reference
- [Social CLI](/cli/social) — command reference
- [Twitter integration](/guide/twitter-integration) — Twitter-specific tuning
- [Slack integration](/guide/slack-integration) — Slack-specific tuning
