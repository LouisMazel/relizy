# changelog()

Generate changelogs programmatically.

## Signature

```ts
function changelog(options?: ChangelogOptions): Promise<void>
```

## Options

```ts
interface ChangelogOptions {
  from?: string
  to?: string
  packages?: string[]
  output?: 'markdown' | 'json'
  config?: string
}
```

## Example

```ts
import { changelog } from 'relizy'

await changelog({
  from: 'v1.0.0',
  to: 'HEAD',
})
```

## See Also

- [CLI reference](/cli/changelog)
- [API usage](/api/usage)
