[relizy](../globals.md) / executeHook

# Function: executeHook()

> **executeHook**(`hook`, `config`, `dryRun`, `params?`): `Promise`\<`any`\>

Defined in: [src/core/utils.ts:9](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/core/utils.ts#L9)

Execute a hook

## Parameters

### hook

`"error:release"` | `"error:publish"` | `"error:push"` | `"error:changelog"` | `"error:bump"` | `"error:commit-and-tag"` | `"error:provider-release"` | `"before:release"` | `"before:publish"` | `"before:push"` | `"before:changelog"` | `"before:bump"` | `"before:commit-and-tag"` | `"before:provider-release"` | `"success:release"` | `"success:publish"` | `"success:push"` | `"success:changelog"` | `"success:bump"` | `"success:commit-and-tag"` | `"success:provider-release"` | `"generate:changelog"`

### config

[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

### dryRun

`boolean`

### params?

`any`

## Returns

`Promise`\<`any`\>
