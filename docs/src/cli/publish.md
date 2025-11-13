---
title: publish
description: Publish packages to npm registry.
keywords: relizy publish, npm publish, package publishing, npm registry, monorepo publish
category: CLI Reference
tags: [cli, publish, npm, registry, monorepo]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy publish [options]
```

## What It Does

The `publish` command:

1. ✅ Builds packages (if build script exists)
2. ✅ Publishes to npm registry
3. ✅ Handles authentication
4. ❌ Does NOT bump versions
5. ❌ Does NOT create tags

## Options

### --tag

Publish with npm dist-tag:

```bash
relizy publish --tag beta
```

### --access

Set package access:

```bash
# Public package
relizy publish --access public

# Private package
relizy publish --access restricted
```

### --otp

Provide one-time password for 2FA:

```bash
relizy publish --otp 123456
```

### --build-cmd

Provide build command:

```bash
relizy publish --build-cmd pnpm build
```

### --registry

Provide custom registry URL:

```bash
relizy publish --registry https://my-registry.com
```

### --dry-run

Test publish without actually publishing:

```bash
relizy publish --dry-run
```

## Examples

### Basic Publish

```bash
relizy publish

# Publishes current version to npm
```

### Beta Release

```bash
relizy publish --tag beta

# Publish as beta version
# npm install my-package@beta
```

### Monorepo

```bash
relizy publish

# Publishes all packages in monorepo
```

## Authentication

### NPM Token

```bash
export NODE_AUTH_TOKEN=your_npm_token_here
relizy publish
```

### .env

```ini
NODE_AUTH_TOKEN=your_npm_token_here
```

### .npmrc

```ini
//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}
```

## See Also

- [release](/cli/release) - Full release workflow
- [Installation](/guide/installation) - Setup NPM authentication
