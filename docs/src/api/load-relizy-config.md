# loadRelizyConfig()

Load Relizy configuration programmatically.

## Signature

```ts
async function loadRelizyConfig(options?: {
  configName?: string
  baseConfig?: RelizyConfig
  overrides?: Partial<RelizyConfig>
}): Promise<ResolvedRelizyConfig>
```

## Example

```ts
import { loadRelizyConfig } from 'relizy'

const config = await loadRelizyConfig({
  configName: 'relizy',
  overrides: {
    bump: {
      type: 'prerelease',
    },
  },
})
```

## See Also

- [API usage](usage.md)
