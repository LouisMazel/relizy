# provider-release

Create releases on GitHub or GitLab.

## Usage

```bash
npx relizy provider-release [options]
```

## What It Does

The `provider-release` command:

1. ✅ Creates a release on GitHub/GitLab
2. ✅ Uses changelog as release notes
3. ✅ Attaches git tag
4. ❌ Does NOT bump versions
5. ❌ Does NOT publish to npm

## Options

### --packages

Create releases for specific packages:

```bash
npx relizy provider-release --packages core
```

### --draft

Create as draft release:

```bash
npx relizy provider-release --draft
```

### --prerelease

Mark as pre-release:

```bash
npx relizy provider-release --prerelease
```

### --yes

Skip confirmations:

```bash
npx relizy provider-release --yes
```

## Examples

### GitHub Release

```bash
export GITHUB_TOKEN=your_token
npx relizy provider-release

# Creates release at:
# https://github.com/user/repo/releases/tag/v1.0.0
```

### GitLab Release

```bash
export GITLAB_TOKEN=your_token
npx relizy provider-release

# Creates release at:
# https://gitlab.com/user/repo/-/releases/v1.0.0
```

### Draft Release

```bash
npx relizy provider-release --draft

# Create release as draft for review
```

### Pre-release

```bash
npx relizy provider-release --prerelease

# Mark as pre-release (beta, alpha, rc)
```

## Authentication

### GitHub

```bash
export GITHUB_TOKEN=ghp_xxxxx
```

Create token at: Settings → Developer settings → Personal access tokens

### GitLab

```bash
export GITLAB_TOKEN=glpat-xxxxx
```

Create token at: Settings → Access Tokens

## See Also

- [release](/cli/release) - Full release workflow
- [CI/CD Setup](/guide/ci-cd) - Automate provider releases
