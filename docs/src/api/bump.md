# bump()

Bump package versions programmatically.

## Signature

```ts
function bump(options: BumpOptions): Promise<BumpResult>
```

## Options

```ts
interface BumpOptions {
  releaseType?: 'major' | 'minor' | 'patch'
  packages?: string[]
  dryRun?: boolean
  yes?: boolean
  config?: string
}
```

## Returns

```ts
interface BumpResult {
  oldVersion: string
  newVersion: string
  packages?: PackageInfo[]
}
```

## Example

```ts
import { bump } from 'relizy'

const result = await bump({
  releaseType: 'minor',
})

console.log(`Bumped from ${result.oldVersion} to ${result.newVersion}`)
```

## See Also

- [CLI reference](/cli/bump)
- [API usage](/api/usage)
