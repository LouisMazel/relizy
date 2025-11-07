# publish()

Publish packages to npm programmatically.

## Signature

```ts
function publish(options?: PublishOptions): Promise<void>
```

## Options

```ts
interface PublishOptions {
  packages?: string[]
  tag?: string
  access?: 'public' | 'restricted'
  dryRun?: boolean
  yes?: boolean
  config?: string
}
```

## Example

```ts
import { publish } from 'relizy'

await publish({
  packages: ['core', 'utils'],
  tag: 'latest',
  access: 'public',
})
```

## See Also

- [CLI reference](/cli/publish)
- [API usage](/api/usage)
