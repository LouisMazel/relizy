# publish

Publish packages to npm registry.

## Usage

```bash
npx relizy publish [options]
```

## What It Does

The `publish` command:

1. ✅ Builds packages (if build script exists)
2. ✅ Publishes to npm registry
3. ✅ Handles authentication
4. ❌ Does NOT bump versions
5. ❌ Does NOT create tags

## Options

### --packages

Publish specific packages:

```bash
npx relizy publish --packages core,utils
```

### --tag

Publish with npm dist-tag:

```bash
npx relizy publish --tag beta
```

### --access

Set package access:

```bash
# Public package
npx relizy publish --access public

# Private package
npx relizy publish --access restricted
```

### --dry-run

Test publish without actually publishing:

```bash
npx relizy publish --dry-run
```

### --yes

Skip confirmations:

```bash
npx relizy publish --yes
```

## Examples

### Basic Publish

```bash
npx relizy publish

# Publishes current version to npm
```

### Beta Release

```bash
npx relizy publish --tag beta

# Publish as beta version
# npm install my-package@beta
```

### Monorepo

```bash
npx relizy publish

# Publishes all packages in monorepo
```

### Specific Packages

```bash
npx relizy publish --packages core

# Only publish @myorg/core
```

## Authentication

### NPM Token

```bash
export NPM_TOKEN=your_token_here
npx relizy publish
```

### .npmrc

```ini
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

## See Also

- [release](/cli/release) - Full release workflow
- [Installation](/guide/installation) - Setup NPM authentication
