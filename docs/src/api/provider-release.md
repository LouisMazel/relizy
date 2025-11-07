# providerRelease()

Create GitHub/GitLab releases programmatically.

## Signature

```ts
function providerRelease(options?: ProviderReleaseOptions): Promise<void>
```

## Options

```ts
export interface ProviderReleaseOptions {
  from?: string
  to?: string
  token?: string
  config?: ResolvedRelizyConfig
  configName?: string
  provider?: GitProvider
  bumpResult?: BumpResult
  logLevel?: LogLevel
  dryRun?: boolean
}
```

## Example

```ts
import { providerRelease } from 'relizy'

await providerRelease({
  draft: false,
  prerelease: false,
})
```

## See Also

- [CLI reference](../cli/provider-release.md)
- [API usage](usage.md)
