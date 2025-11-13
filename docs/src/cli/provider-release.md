---
title: provider-release
description: Create releases on GitHub or GitLab.
keywords: relizy provider release, github release, gitlab release, git release, release notes
category: CLI Reference
tags: [cli, provider-release, github, gitlab, releases]
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
