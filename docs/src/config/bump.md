# Bump Configuration

Configure version bumping behavior.

## preid

Set prerelease identifier:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    preid: 'beta', // For pre-releases like 1.0.0-beta.1
  },
})
```

## Complete Example

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    preid: 'beta',
  },
})
```

Usage:

```bash
relizy bump --prerelease
# Results in: 1.0.0 → 1.0.0-beta.0
```
