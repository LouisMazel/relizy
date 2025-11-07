# providerRelease()

Create GitHub/GitLab releases programmatically.

## Signature

```ts
function providerRelease(options?: ProviderReleaseOptions): Promise<void>
```

## Options

```ts
interface ProviderReleaseOptions {
  packages?: string[]
  draft?: boolean
  prerelease?: boolean
  yes?: boolean
  config?: string
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

- [CLI reference](/cli/provider-release)
- [API usage](/api/usage)
