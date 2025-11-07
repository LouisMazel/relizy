# Bump Configuration

Configure version bumping behavior.

## preid

Set prerelease identifier:

```ts
export default {
  bump: {
    preid: 'beta', // For pre-releases like 1.0.0-beta.1
  },
}
```

## Complete Example

```ts
export default {
  bump: {
    preid: 'beta',
  },
}
```

Usage:

```bash
npx relizy bump --prerelease
# Results in: 1.0.0 → 1.0.0-beta.0
```
