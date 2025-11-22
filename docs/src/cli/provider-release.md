---
title: provider-release
description: Create releases on GitHub, GitLab, and Bitbucket.
keywords: relizy provider release, github release, gitlab release, bitbucket release, git release, release notes
category: CLI Reference
tags: [cli, provider-release, github, gitlab, bitbucket, releases]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy provider-release [options]
```

## What It Does

The `provider-release` command:

1. ✅ Creates a release on GitHub/GitLab
2. ✅ Uses changelog as release notes
3. ✅ Attaches git tag
4. ❌ Does NOT bump versions
5. ❌ Does NOT publish to npm

## Options

### --from

Start release from specific tag:

```bash
relizy provider-release --from v1.0.0
```

### --to

End release at specific tag:

```bash
relizy provider-release --to v2.0.0
```

### --token

```bash
relizy provider-release --token your_token
```

### --provider

```bash
relizy provider-release --provider github
```

### GitHub Release

```bash
relizy provider-release --provider github --token your_token

# Creates release at:
# https://github.com/user/repo/releases/tag/v1.0.0
```

### GitLab Release

```bash
relizy provider-release --provider gitlab --token your_token

# Creates release at:
# https://gitlab.com/user/repo/-/releases/v1.0.0
```

### Pre-release

```bash
relizy provider-release --prerelease

# Mark as pre-release (beta, alpha, rc)
```

## Bitbucket Support

Bitbucket is partially supported with some limitations:

::: warning Bitbucket Limitations
Bitbucket Cloud does not provide an API for creating releases. When using Bitbucket:

- **Release creation is skipped** - No releases will be created
- **Git tags are still created** - During the commit step
- **All other features work** - Versioning, changelog, publishing, and social media posting

Relizy will detect Bitbucket automatically and show a warning that release creation is skipped.
:::

```bash
# With Bitbucket, this skips release creation but everything else works
relizy provider-release --provider bitbucket

# You can still use the full release workflow
relizy release --patch
# ✅ Versions bumped
# ✅ Changelog generated
# ✅ Git tag created
# ⚠️  Release creation skipped (Bitbucket limitation)
# ✅ Published to npm
# ✅ Posted to social media
```

### Bitbucket Workarounds

While you can't create releases via API, you can still:

1. **Use Git tags** - Tags are created and pushed normally
2. **View tags on Bitbucket** - At `https://bitbucket.org/user/repo/commits/tag/v1.0.0`
3. **Use Bitbucket Pipelines** - Automate the release workflow
4. **Social media announcements** - Keep users informed via Twitter/Slack

## Authentication

### GitHub

```bash
relizy provider-release --provider github --token ghp_xxxxx --prerelease
```

Create token at: Settings → Developer settings → Personal access tokens

### GitLab

```bash
relizy provider-release --provider gitlab --token glpat-xxxxx
```

Create token at: Settings → Access Tokens

## See Also

- [release](/cli/release) - Full release workflow
- [CI/CD Setup](/guide/ci-cd) - Automate provider releases
