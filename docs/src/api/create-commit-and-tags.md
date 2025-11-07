# createCommitAndTags()

Create a commit and tags programmatically.

## Signature

```ts
function createCommitAndTags(options?: {
  config?: ResolvedRelizyConfig
  noVerify?: boolean
  bumpedPackages?: PackageInfo[]
  newVersion?: string
  dryRun?: boolean
  logLevel?: LogLevel
}): Promise<string[]> // Array of created tags
```

## Example

```ts
import { createCommitAndTags, loadRelizyConfig } from 'relizy'

const config = await loadRelizyConfig()

await createCommitAndTags({
  config,
  noVerify: false,
  bumpedPackages: [],
  newVersion: '1.0.0',
  dryRun: false,
  logLevel: 'info',
})
```

## See Also

- [API usage](usage.md)
