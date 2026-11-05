---
title: social
description: Post the current release on Twitter (X) and Slack from the command line.
keywords: relizy social, social cli, twitter post, slack post, release announcement, slack-format, ai social posts
category: CLI Reference
tags: [cli, social, twitter, slack]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy social [options]
```

Posts the release once per enabled platform (`social.<platform>.enabled`): the versions of the `package.json` files and their changelog since the previous tags. `relizy release` runs the same step with the versions it just bumped. Setup of the platforms and shape of the posts: [Social Media](./../guide/social-media.md).

The command exits with code `0` when a post fails: the failure is shown in its output.

## Options

### --from

Start of the commits of the changelog (default: the previous release tag).

```bash
relizy social --from v1.2.0
```

### --to

End of the commits of the changelog (default: the tag of the current version).

```bash
relizy social --from v1.2.0 --to v1.3.0
```

### --ai / --no-ai

Turn the AI rewrite of the posts on or off for this run, whatever [`ai.social`](./../config/ai.md#social). See [AI-Enhanced Changelogs](./../guide/ai-changelog.md).

```bash
relizy social --ai
```

### --slack-format

`summary` or `full`: overrides [`social.slack.changelogFormat`](./../config/social.md#slack-changelogformat) for this run.

```bash
relizy social --slack-format full
```

## Global Options

These [global options](./commands.md) also apply: `--dry-run` (show the posts without posting them, the tweet with its length), `--ai-preview` (call the AI in a dry run), `--no-preview`, `--group` (only the given version groups), `--no-safety-check` (skip the check of the credentials and dependencies), `--config` and `--log-level`.

```bash
relizy social --dry-run --ai-preview
```

## Credentials

Twitter reads `TWITTER_API_KEY`, `TWITTER_API_KEY_SECRET`, `TWITTER_ACCESS_TOKEN` and `TWITTER_ACCESS_TOKEN_SECRET`; Slack reads `SLACK_WEBHOOK_URL`, or `SLACK_TOKEN` with `social.slack.channel`. Each one also has a `RELIZY_` variant: see [Tokens](./../config/overview.md#tokens).

## See Also

- [Social Media](./../guide/social-media.md)
- [Social Configuration](./../config/social.md)
- [`social()`](./../api/social.md)
