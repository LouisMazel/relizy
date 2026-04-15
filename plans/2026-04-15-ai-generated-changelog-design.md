# AI-generated changelog for `provider-release` and `social`

**Status:** Design approved, ready for implementation planning
**Date:** 2026-04-15

## Summary

Add an opt-in AI layer that rewrites changelog content before it is published
to GitHub/GitLab releases, Twitter, and Slack. The SDK
[`@yoloship/claude-sdk`](https://www.npmjs.com/package/@yoloship/claude-sdk)
drives Claude Code with a tailored system prompt per target. The raw changelog
remains the source of truth; AI only rewrites the human-readable body, never
the compare link, contributor list, PR/issue references, or URLs.

## Goals

- Publish clearer, more readable release notes and social posts without
  hand-editing.
- Keep the feature fully opt-in and plug-and-play: disabling it restores today's
  behavior byte-for-byte.
- Isolate AI concerns in one module so adding a new target (LinkedIn, Discord)
  later is a matter of adding a prompt + call-site.
- Never let a Claude failure break a release.

## Non-goals

- No automatic translation of the raw changelog file on disk (`CHANGELOG.md`
  stays deterministic).
- No multi-turn / interactive sessions — one-shot calls only.
- No content moderation or fact-checking beyond the system prompt directives.

## Configuration

A new root `ai` section on `RelizyConfig`. The design is **provider-agnostic**:
`ai.provider` picks the implementation, and provider-specific options live in
`ai.providers[<name>]`. Today we ship one provider (`'claude-code'`); new
providers (OpenAI, Gemini, a local model, etc.) plug in without touching
call-sites or the engine.

```ts
type AIProviderName = 'claude-code' // widened as new providers are added

interface AIConfig {
  /** Which provider to use. @default 'claude-code' */
  provider?: AIProviderName
  /** Provider-specific options, keyed by provider name. */
  providers?: {
    'claude-code'?: ClaudeCodeProviderOptions
    // Future:
    // 'openai'?: OpenAIProviderOptions
    // 'gemini'?: GeminiProviderOptions
  }
  /** Output language (ISO 639-1). @default 'en' */
  language?: string
  /** Behavior when the provider call fails. @default 'raw' */
  fallback?: 'raw' | 'fail'
  /** Extra directives appended to every system prompt. */
  extraGuidelines?: string
  /** Full replacement of the built-in system prompts. */
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

interface ClaudeCodeProviderOptions {
  /** Anthropic API key. Fallback: ANTHROPIC_API_KEY, RELIZY_ANTHROPIC_API_KEY. */
  apiKey?: string
  /** Claude Code OAuth token. Fallback: CLAUDE_CODE_OAUTH_TOKEN. */
  oauthToken?: string
  /** Claude model id. @default 'claude-haiku-4-5-20251001' */
  model?: string
}
```

`TokensConfig` gains a generic `ai` slot so auth credentials stay grouped with
other tokens, provider-keyed:

```ts
interface TokensConfig {
  // ... existing fields
  ai?: {
    'claude-code'?: { apiKey?: string, oauthToken?: string }
    // Future providers add their own keyed entry.
  }
}
```

**Resolution order for Claude Code auth** (first match wins):

1. `config.ai.providers['claude-code'].apiKey` / `.oauthToken`
2. `config.tokens.ai['claude-code'].apiKey` / `.oauthToken`
3. `process.env.ANTHROPIC_API_KEY` / `RELIZY_ANTHROPIC_API_KEY`
4. `process.env.CLAUDE_CODE_OAUTH_TOKEN`

Each future provider defines its own resolution order in its module; the
engine never knows about provider-specific env vars.

## Markdown module refactor

`src/core/markdown.ts` currently builds the full changelog inside
`generateMarkDown`. We split it into three exported, composable builders and
make `generateMarkDown` an assembler. Output must remain byte-identical for
existing callers (verified by `markdown.spec.ts`).

```ts
export function buildCompareLink(args: {
  config: ResolvedRelizyConfig
  from: string
  to: string
  isFirstCommit: boolean
}): string // '' when not applicable (minified, no repo, etc.)

export function buildChangelogBody(args: {
  commits: GitCommit[]
  config: ResolvedRelizyConfig
  minify?: boolean
}): string // `### <Type>` sections + `#### ⚠️ Breaking Changes` if any

export async function buildContributors(args: {
  commits: GitCommit[]
  config: ResolvedRelizyConfig
}): Promise<string> // '' when minified, no authors, or noAuthors is set
```

`generateMarkDown` becomes:

```ts
const title = `## ${changelogTitle}`
const compareLink = buildCompareLink({ })
const body = buildChangelogBody({ commits, config, minify })
const contributors = minify ? '' : await buildContributors({ commits, config })

return convert([title, compareLink, body, contributors].filter(Boolean).join('\n\n').trim(), true)
```

This refactor is a prerequisite for the AI integration: it lets us feed only
the body to Claude and recompose deterministically.

## AI engine and provider abstraction

### Provider interface

A minimal contract every provider must implement, declared in
`src/core/ai/provider.ts`:

```ts
export interface AIGenerateRequest {
  systemPrompt: string
  prompt: string
  /** Hard upper bound on output length, when meaningful (e.g. Twitter). */
  maxLength?: number
}

export interface AIProvider {
  /** Stable name used in config (`ai.provider`). */
  readonly name: string
  /**
   * Validate that the provider can run with the given config.
   * Must throw an actionable error if auth, deps, or config are missing.
   * Called from `aiSafetyCheck`.
   */
  safetyCheck: (config: ResolvedRelizyConfig) => void | Promise<void>
  /** Execute a one-shot generation. Returns the final trimmed output. */
  generate: (
    config: ResolvedRelizyConfig,
    request: AIGenerateRequest,
  ) => Promise<string>
}
```

Registry in `src/core/ai/registry.ts`:

```ts
import { claudeCodeProvider } from './providers/claude-code'

const providers: Record<string, AIProvider> = {
  [claudeCodeProvider.name]: claudeCodeProvider,
  // Future providers register here.
}

export function getAIProvider(config: ResolvedRelizyConfig): AIProvider {
  const name = config.ai?.provider ?? 'claude-code'
  const provider = providers[name]
  if (!provider) {
    throw new Error(`Unknown AI provider: "${name}". Available: ${Object.keys(providers).join(', ')}`)
  }
  return provider
}
```

Adding a new provider is: implement `AIProvider`, add its options type to
`AIConfig['providers']`, register it. No engine changes, no call-site
changes.

### Engine: `src/core/ai/index.ts`

```ts
export function aiSafetyCheck(args: { config: ResolvedRelizyConfig }): Promise<void>

export async function generateAIProviderReleaseBody(args: {
  config: ResolvedRelizyConfig
  rawBody: string
}): Promise<string>

export async function generateAISocialChangelog(args: {
  config: ResolvedRelizyConfig
  rawBody: string
  platform: 'twitter' | 'slack'
  maxLength?: number // twitter only
}): Promise<string>
```

Engine contract for the two `generateAI*` functions:

1. Resolve the provider via `getAIProvider(config)`.
2. Build the system prompt: base + platform-specific + `extraGuidelines`
   (when set); fully replaced by `systemPromptOverrides[platform]` when
   provided.
3. Call `provider.generate(config, { systemPrompt, prompt: rawBody, maxLength })`.
4. On success: return the provider output.
5. On error: if `fallback: 'raw'` → warn + return `rawBody`; if
   `fallback: 'fail'` → re-throw with context.

The engine is provider-agnostic — it never imports `@yoloship/claude-sdk`.
Only the Claude provider module does.

### Claude Code provider: `src/core/ai/providers/claude-code.ts`

Implements `AIProvider` with `name = 'claude-code'`:

- `safetyCheck`: verifies an auth credential is resolvable (per the order
  above) and that `@yoloship/claude-sdk` is installed (dynamic import like
  `twitter-api-v2` / `@slack/web-api`).
- `generate`: dynamically imports `claudeRun` from `@yoloship/claude-sdk`,
  maps our `AIGenerateRequest` to its options (`{ prompt, systemPrompt, model }`
  and `{ apiKey | oauthToken }` as the second argument), returns
  `result.output.trim()`.

Dry-run does **not** skip the provider call — the whole point of dry-run is
to preview the AI output. Only the downstream publish step is skipped.

### System prompts

Stored as exported constants in `src/core/ai-prompts.ts` (testable and
inspectable). Structure:

- `BASE_PROMPT` — always included first:

  > You receive a markdown changelog generated from conventional commits.
  > Never invent changes that are not present in the input. Never include
  > compare links, contributor lists, or release metadata — only the content
  > provided. Preserve PR/issue references (#123), commit hashes, commit
  > scopes (**scope:**), and markdown links exactly. Respond with the final
  > content only — no preamble, no surrounding code block, no explanation.
  > Output language: {{language}}.

- `PROVIDER_RELEASE_PROMPT`:

  > Format: markdown with `###` sections per type (Features, Bug Fixes, etc.)
  > matching the input. Merge redundant items. Rewrite for end-user clarity
  > (not "fix: typo in var name" but "Fixed X"). Preserve the `⚠️` markers on
  > breaking items and the `#### ⚠️ Breaking Changes` section if present.
  > Purely internal commits (chore, refactor with no visible impact) may be
  > dropped unless explicitly typed as visible. Tone: professional, concise,
  > public release notes.

- `TWITTER_PROMPT`:

  > Format: plain text — no markdown (leading `#` becomes a hashtag on
  > Twitter). Strict max length: {{maxLength}} characters. You produce only
  > the changelog content — the outer template handles project name, version,
  > and URLs. Surface 1 to 3 highlights, not an exhaustive list. Tone:
  > enthusiastic but not cringy, 1-2 emoji max. No hashtags unless the user
  > supplies them.

- `SLACK_PROMPT`:
  > Format: simple Slack-compatible markdown (`*bold*`, `_italic_`, `-` lists).
  > Length is flexible but synthetic — 3 to 8 bullets. Tone: internal team,
  > factual. Lead with breaking changes when present.

Final prompt = `BASE_PROMPT` + platform prompt + (`extraGuidelines` when set),
with `{{language}}` and `{{maxLength}}` substituted. If
`systemPromptOverrides[platform]` is set, it replaces the entire assembled
prompt (the override author takes full responsibility).

## Call-site integration

### `src/core/github.ts` and `src/core/gitlab.ts`

Both `*Unified` and `*IndependentMode` functions replace the current
`generateChangelog(...)` + `.split('\n').slice(2).join('\n')` pattern with:

```ts
const compareLink = buildCompareLink({ config, from, to, isFirstCommit })
const body = buildChangelogBody({ commits, config })
const contributors = await buildContributors({ commits, config })

const finalBody = config.ai?.providerRelease?.enabled
  ? await generateAIProviderReleaseBody({ config, rawBody: body })
  : body

const releaseBody = [compareLink, finalBody, contributors]
  .filter(Boolean)
  .join('\n\n')
```

Compare link and contributors never pass through Claude — their content
(URLs, `@handles`) stays deterministic.

### `src/commands/social.ts`

The existing call to `generateChangelog({ minify: true })` is replaced by a
direct call to `buildChangelogBody({ commits, config, minify: true })`. Per
platform:

```ts
const rawBody = buildChangelogBody({ commits: rootPackage.commits, config, minify: true })

const twitterChangelog = config.ai?.social?.twitter?.enabled
  ? await generateAISocialChangelog({
      config,
      rawBody,
      platform: 'twitter',
      maxLength: config.social.twitter.postMaxLength,
    })
  : rawBody

const slackChangelog = config.ai?.social?.slack?.enabled
  ? await generateAISocialChangelog({ config, rawBody, platform: 'slack' })
  : rawBody
```

The platform-specific output is then passed as `{{changelog}}` into the
existing template, so `projectName`, `{{newVersion}}`, `{{releaseUrl}}`, and
`{{changelogUrl}}` variables keep working.

## CLI

New flag on `provider-release`, `social`, and `release`:

- `--ai` — force-enable AI on all applicable targets for this run.
- `--no-ai` — force-disable AI on all applicable targets for this run.

When set, it overrides `config.ai.providerRelease.enabled` and
`config.ai.social.{twitter,slack}.enabled` simultaneously. Finer-grained
control stays in the config file. Intentionally a single toggle to keep CLI
surface small — matches the existing `--dry-run` / `--force` ergonomics.

## Safety check

`aiSafetyCheck` is called from `providerReleaseSafetyCheck` and
`socialSafetyCheck` when any relevant `ai.*.enabled` is true. It:

1. Resolves the active provider via `getAIProvider(config)`.
2. Delegates to `provider.safetyCheck(config)` — each provider validates
   its own auth and dependencies and throws actionable errors.

The engine has zero provider-specific knowledge at this layer.

## Dependencies

> **SDK source available locally.** The full source, tests, and docs for
> `@yoloship/claude-sdk` live on this machine at
> `../yolo.ship/packages/claude-sdk/` (sibling to the `relizy/` checkout).
> Implementers should read it directly to confirm exact option names,
> event shapes, error classes, and auth handling rather than guessing.
> Key entry points: `src/` (implementation), `docs/` (usage guides),
> `README.md` (API overview), `playground.ts` (working examples).

- Add `@yoloship/claude-sdk` as an **optional peer dependency** in
  `package.json`. Users opt in by installing it alongside Relizy. The import
  is dynamic (inside the Claude provider module) so missing package + a
  different (or disabled) provider is a no-op. Future providers follow the
  same pattern: each provider's SDK stays an optional peer dep, loaded only
  when that provider is selected.

## Testing

- **`markdown.spec.ts`** — add isolated cases for `buildCompareLink`,
  `buildChangelogBody`, `buildContributors`. Existing `generateMarkDown`
  assertions must still pass unchanged.
- **`ai/engine.spec.ts` (new)** — provider-agnostic: prompt assembly (base
  - platform + extra + override), `{{language}}` / `{{maxLength}}`
    substitution, fallback `'raw'` vs `'fail'`, registry lookup (unknown
    provider error), `aiSafetyCheck` delegation. Uses a fake in-memory
    provider — never touches a real SDK.
- **`ai/providers/claude-code.spec.ts` (new)** — provider-specific: auth
  resolution order, dynamic SDK import, mapping of `AIGenerateRequest` to
  `claudeRun` options. `@yoloship/claude-sdk` is mocked.
- **`github.spec.ts` / `gitlab.spec.ts`** — with SDK mocked: assert compare
  link (first line) and contributors section (last block) survive unchanged
  when AI is enabled; only the middle body is replaced.
- **`social.spec.ts`** — SDK mocked, assert Twitter gets `maxLength`, Slack
  does not, and each platform triggers its own call.

All SDK calls are mocked; no network in CI.

## Documentation

All changes in `docs/src/`:

- **New** `docs/src/guide/ai-changelog.md` — primary guide. What it does,
  when to enable, auth setup, model selection, cost/latency note
  (Haiku default), customizing prompts, `extraGuidelines` recipe,
  before/after examples per target, fallback behavior, troubleshooting.
- **Update** `docs/src/guide/getting-started.md` — AI listed in features.
- **Update** `docs/src/guide/installation.md` — `ANTHROPIC_API_KEY` env,
  optional SDK install command.
- **Update** `docs/src/cli/provider-release.md` — `--ai` / `--no-ai`
  flags + example.
- **Update** `docs/src/cli/social.md` — same.
- **Update** `docs/src/cli/release.md` — same.
- **Update** `docs/src/config/overview.md` — `ai` section entry.
- **New** `docs/src/config/ai.md` — full `AIConfig` reference with a
  worked example for each platform, plus an explicit
  **"Adding a new AI provider"** section documenting the `AIProvider`
  interface and registry pattern (so contributors can plug new providers
  without reading the source).
- **Update** `docs/src/guide/twitter-integration.md` and
  `slack-integration.md` — AI subsection showing tuning via
  `extraGuidelines`.
- **Update** `docs/.vitepress/config.mts` — sidebar entries for the new
  pages.

Documentation must be clear and example-heavy: every config option gets a
snippet, every CLI flag gets a command line, every prompt override gets a
worked before/after.

## Edge cases and open decisions resolved

- **Empty changelog.** When `buildChangelogBody` returns empty (e.g.
  `emptyChangelogContent`), we skip the AI call entirely and let the raw
  empty-state string flow through.
- **Twitter length overrun.** The system prompt enforces `maxLength`, but
  we still truncate defensively in the Twitter post path as a safety net
  (existing `postMaxLength` behavior is preserved).
- **Independent mode, many packages.** Each package release triggers its
  own AI call (sequential, following the existing loop). This is acceptable
  for Haiku latency; a future optimization could batch.
- **`dry-run`.** Claude is called; only the publish step is skipped. The
  AI output appears in the existing `logger.box` preview.

## Rollout

Single PR covering: markdown refactor → `ai/` engine + provider interface +
Claude Code provider + prompts → call-site integration → CLI flags → tests
→ docs. The feature ships disabled by default; no migration needed for
existing users. Adding further providers later is purely additive (new
module in `ai/providers/`, registry entry, options type, docs entry) — no
breaking change to the `ai.*` config shape.
