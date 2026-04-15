# PRD: AI-Generated Changelog

## Overview

Add an opt-in AI layer that rewrites changelog content before publishing to GitHub/GitLab releases, Twitter, and Slack. The SDK `@yoloship/claude-sdk` drives Claude Code with tailored system prompts per target. The raw changelog remains the source of truth; AI only rewrites the human-readable body, never compare links, contributor lists, PR/issue references, or URLs. The feature ships disabled by default — disabling it restores current behavior byte-for-byte.

## Goals

- Publish clearer, more readable release notes and social posts without hand-editing
- Keep the feature fully opt-in: disabling restores today's behavior byte-for-byte
- Isolate AI concerns in one module so adding a new target or provider is purely additive
- Never let a Claude failure break a release (fallback to raw content by default)
- Provider-agnostic design: `claude-code` ships first, new providers plug in without touching call-sites

## Quality Gates

These commands must pass for every user story:

- `pnpm health`

## User Stories

### US-001: Markdown module refactor — extract composable builders

As a developer, I want `generateMarkDown` split into `buildCompareLink`, `buildChangelogBody`, and `buildContributors` so that the AI layer can rewrite only the body while keeping deterministic sections untouched.

**Acceptance Criteria:**

- [ ] `buildCompareLink({ config, from, to, isFirstCommit })` is exported from `src/core/markdown.ts` and returns the compare link string (empty when not applicable)
- [ ] `buildChangelogBody({ commits, config, minify? })` is exported and returns the `### <Type>` sections including `#### ⚠️ Breaking Changes` when present
- [ ] `buildContributors({ commits, config })` is exported as async and returns the contributors block (empty when minified, no authors, or `noAuthors`)
- [ ] `generateMarkDown` assembles output from these three builders: `[title, compareLink, body, contributors].filter(Boolean).join('\n\n').trim()`
- [ ] All existing `markdown.spec.ts` assertions pass unchanged (byte-identical output)
- [ ] New unit tests cover `buildCompareLink`, `buildChangelogBody`, and `buildContributors` in isolation

### US-002: AI types and configuration schema

As a developer, I want the `AIConfig`, `ClaudeCodeProviderOptions`, and `AIProvider` interface defined so that the engine and providers have a typed contract.

**Acceptance Criteria:**

- [ ] `AIConfig` type added to `src/types.ts` with fields: `provider`, `providers`, `language`, `fallback`, `extraGuidelines`, `systemPromptOverrides`, `providerRelease`, `social`
- [ ] `ClaudeCodeProviderOptions` type added with `apiKey`, `oauthToken`, `model` fields
- [ ] `AIProviderName` type defined as `'claude-code'` (union, widened later)
- [ ] `TokensConfig` gains `ai?: { 'claude-code'?: { apiKey?: string, oauthToken?: string } }` slot
- [ ] `ResolvedRelizyConfig` includes the optional `ai` section
- [ ] `AIProvider` interface defined in `src/core/ai/provider.ts` with `name`, `safetyCheck`, and `generate` members
- [ ] `AIGenerateRequest` interface defined with `systemPrompt`, `prompt`, `maxLength?`
- [ ] TypeScript compiles cleanly

### US-003: AI system prompts

As a developer, I want system prompts stored as exported constants so they are testable, inspectable, and overridable.

**Acceptance Criteria:**

- [ ] `src/core/ai-prompts.ts` exports `BASE_PROMPT`, `PROVIDER_RELEASE_PROMPT`, `TWITTER_PROMPT`, `SLACK_PROMPT` as string constants
- [ ] `BASE_PROMPT` includes `{{language}}` placeholder and directives about preserving references, no preamble, no code blocks
- [ ] `TWITTER_PROMPT` includes `{{maxLength}}` placeholder and plain-text format directive
- [ ] `SLACK_PROMPT` specifies Slack-compatible markdown format
- [ ] `PROVIDER_RELEASE_PROMPT` specifies markdown with `###` sections and breaking change preservation
- [ ] Unit tests verify each prompt contains its required placeholders

### US-004: AI provider registry and Claude Code provider

As a developer, I want a provider registry and the Claude Code provider implementation so that the engine resolves providers by name and the Claude Code provider handles auth, SDK import, and generation.

**Acceptance Criteria:**

- [ ] `src/core/ai/registry.ts` exports `getAIProvider(config)` that returns the provider matching `config.ai.provider` (default `'claude-code'`)
- [ ] `getAIProvider` throws with available provider names when provider is unknown
- [ ] `src/core/ai/providers/claude-code.ts` implements `AIProvider` with `name = 'claude-code'`
- [ ] `safetyCheck` verifies auth credential is resolvable in order: `config.ai.providers['claude-code']` → `config.tokens.ai['claude-code']` → env vars (`ANTHROPIC_API_KEY` / `RELIZY_ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN`)
- [ ] `safetyCheck` verifies `@yoloship/claude-sdk` is importable (dynamic import) and throws actionable error if missing
- [ ] `generate` dynamically imports `claudeRun` from `@yoloship/claude-sdk`, maps `AIGenerateRequest` to SDK options, returns `result.output.trim()`
- [ ] Auth resolution matches the SDK's expected option names (verified by reading `../yolo.ship/packages/claude-sdk/`)
- [ ] `@yoloship/claude-sdk` added as optional peer dependency in `package.json`
- [ ] Unit tests with mocked SDK cover: auth resolution order, dynamic import, request mapping, output trimming

### US-005: AI engine — safety check, generation, and fallback

As a developer, I want the AI engine to assemble prompts, delegate to providers, and handle failures so that call-sites have a simple API.

**Acceptance Criteria:**

- [ ] `src/core/ai/index.ts` exports `aiSafetyCheck({ config })`, `generateAIProviderReleaseBody({ config, rawBody })`, and `generateAISocialChangelog({ config, rawBody, platform, maxLength? })`
- [ ] Prompt assembly: base + platform prompt + `extraGuidelines` (when set), with `{{language}}` and `{{maxLength}}` substituted
- [ ] `systemPromptOverrides[platform]` fully replaces the assembled prompt when provided
- [ ] On provider error with `fallback: 'raw'`: warns and returns `rawBody`
- [ ] On provider error with `fallback: 'fail'`: re-throws with context
- [ ] `aiSafetyCheck` resolves provider via registry and delegates to `provider.safetyCheck`
- [ ] Engine never imports `@yoloship/claude-sdk` directly — only the provider does
- [ ] Unit tests with a fake in-memory provider cover: prompt assembly, placeholder substitution, fallback modes, override behavior, safety check delegation, unknown provider error

### US-006: Call-site integration — provider releases (GitHub + GitLab)

As a release manager, I want GitHub and GitLab releases to use AI-rewritten bodies when `ai.providerRelease.enabled` is true so that published release notes are clearer.

**Acceptance Criteria:**

- [ ] `src/core/github.ts`: both unified and independent mode functions use `buildCompareLink`, `buildChangelogBody`, `buildContributors` instead of `generateChangelog` + `.split().slice().join()` pattern
- [ ] When `config.ai?.providerRelease?.enabled`, the body is passed through `generateAIProviderReleaseBody`; otherwise used raw
- [ ] Compare link and contributors never pass through the AI — assembled around the (possibly rewritten) body
- [ ] `src/core/gitlab.ts`: same integration pattern as GitHub
- [ ] `providerReleaseSafetyCheck` calls `aiSafetyCheck` when `ai.providerRelease.enabled` is true
- [ ] Unit tests (with mocked SDK): compare link and contributors survive unchanged when AI is enabled; only body is replaced
- [ ] Existing github/gitlab test assertions continue to pass

### US-007: Call-site integration — social (Twitter + Slack)

As a release manager, I want Twitter and Slack posts to use AI-rewritten content when enabled so that social announcements are engaging and well-formatted.

**Acceptance Criteria:**

- [ ] `src/commands/social.ts`: uses `buildChangelogBody({ commits, config, minify: true })` instead of `generateChangelog({ minify: true })`
- [ ] When `config.ai?.social?.twitter?.enabled`, content is passed through `generateAISocialChangelog` with `platform: 'twitter'` and `maxLength: config.social.twitter.postMaxLength`
- [ ] When `config.ai?.social?.slack?.enabled`, content is passed through `generateAISocialChangelog` with `platform: 'slack'` (no maxLength)
- [ ] Platform-specific output is used as `{{changelog}}` in existing templates — `projectName`, `{{newVersion}}`, URLs keep working
- [ ] `socialSafetyCheck` calls `aiSafetyCheck` when any social AI is enabled
- [ ] Empty changelog body (`emptyChangelogContent`) skips the AI call entirely
- [ ] Unit tests (with mocked SDK): Twitter gets `maxLength`, Slack does not; each platform triggers its own provider call

### US-008: CLI flags — `--ai` and `--no-ai`

As a CLI user, I want `--ai` and `--no-ai` flags on `provider-release`, `social`, and `release` commands so that I can override AI config for a single run.

**Acceptance Criteria:**

- [ ] `--ai` flag added to `provider-release`, `social`, and `release` commands in `src/cli.ts`
- [ ] `--ai` force-enables AI on all applicable targets for the run
- [ ] `--no-ai` force-disables AI on all applicable targets for the run
- [ ] Flags override `config.ai.providerRelease.enabled` and `config.ai.social.{twitter,slack}.enabled`
- [ ] When neither flag is set, config values are used as-is
- [ ] Unit tests verify flag override logic

### US-009: Documentation

As a user, I want comprehensive documentation for the AI changelog feature so that I can configure, use, and troubleshoot it.

**Acceptance Criteria:**

- [ ] New `docs/src/guide/ai-changelog.md`: what it does, when to enable, auth setup, model selection, cost note (Haiku default), prompt customization, `extraGuidelines` recipes, before/after examples per target, fallback behavior, troubleshooting
- [ ] New `docs/src/config/ai.md`: full `AIConfig` reference with worked examples per platform, "Adding a new AI provider" section documenting `AIProvider` interface and registry pattern
- [ ] Updated `docs/src/guide/getting-started.md`: AI listed in features
- [ ] Updated `docs/src/guide/installation.md`: `ANTHROPIC_API_KEY` env, optional SDK install
- [ ] Updated `docs/src/cli/provider-release.md`: `--ai` / `--no-ai` flags with examples
- [ ] Updated `docs/src/cli/social.md`: same
- [ ] Updated `docs/src/cli/release.md`: same
- [ ] Updated `docs/src/config/overview.md`: `ai` section entry
- [ ] Updated `docs/src/guide/twitter-integration.md` and `slack-integration.md`: AI subsection with `extraGuidelines` tuning
- [ ] Updated `docs/.vitepress/config.mts`: sidebar entries for new pages
- [ ] Every config option has a code snippet, every CLI flag has a command example, every prompt override has a before/after

## Functional Requirements

- FR-1: The AI feature must be fully opt-in — disabled by default, no behavior change for existing users
- FR-2: The system must support a provider-agnostic design where `ai.provider` selects the implementation
- FR-3: Auth credentials must resolve in order: inline config → tokens config → environment variables
- FR-4: `@yoloship/claude-sdk` must be a dynamic import — missing package with AI disabled is a no-op
- FR-5: System prompts must be composable: base + platform + extraGuidelines, with full override support
- FR-6: Compare links, contributor lists, PR/issue references, and URLs must never pass through AI
- FR-7: On AI failure with `fallback: 'raw'`, the raw changelog must be used with a warning
- FR-8: On AI failure with `fallback: 'fail'`, the error must be re-thrown with context
- FR-9: Dry-run must call the AI provider (to preview output) — only the publish step is skipped
- FR-10: Empty changelog body must skip the AI call entirely
- FR-11: Twitter output must respect `postMaxLength` (enforced in prompt + defensive truncation)
- FR-12: In independent mode, each package release triggers its own AI call sequentially

## Non-Goals

- No modification of the raw `CHANGELOG.md` file on disk — it stays deterministic
- No multi-turn or interactive AI sessions — one-shot calls only
- No content moderation or fact-checking beyond system prompt directives
- No automatic translation (language is set once in config)
- No batching of AI calls for independent mode packages (future optimization)
- No providers beyond `claude-code` in this PR

## Technical Considerations

- The `@yoloship/claude-sdk` source is available at `../yolo.ship/packages/claude-sdk/` — read it to confirm exact option names, event shapes, and auth handling
- Dynamic import pattern follows existing precedent (`twitter-api-v2`, `@slack/web-api`)
- The markdown refactor (US-001) is a prerequisite for all AI integration stories
- Provider model defaults to `claude-haiku-4-5-20251001` for cost/latency optimization

## Success Metrics

- All existing tests pass unchanged after markdown refactor
- AI-enabled release notes are clearer and more user-friendly than raw conventional commit output
- Disabling AI produces byte-identical output to current behavior
- No release failures caused by AI provider errors (fallback works)
- New providers can be added with: one module, one registry entry, one type addition, one docs entry

## Open Questions

- Should independent mode batch AI calls in a future optimization PR?
- Should `CHANGELOG.md` on-disk rewriting be considered for a v2?
