# release()

Execute a complete release workflow programmatically.

## Signature

```ts
function release(options: ReleaseOptions): Promise<void>
```

## Options

```ts
interface ReleaseOptions {
  // Release type
  releaseType?: 'major' | 'minor' | 'patch'

  // Git operations
  commit?: boolean
  tag?: boolean
  push?: boolean
  noGitChecks?: boolean

  // Publishing
  publish?: boolean
  providerRelease?: boolean

  // Monorepo
  packages?: string[]

  // Behavior
  yes?: boolean
  dryRun?: boolean
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug'

  // Configuration
  config?: string
}
```

## Example

```ts
import { release } from 'relizy'

await release({
  releaseType: 'minor',
  commit: true,
  tag: true,
  push: true,
  publish: true,
  providerRelease: true,
})
```

## See Also

- [CLI reference](/cli/release)
- [API usage](/api/usage)
