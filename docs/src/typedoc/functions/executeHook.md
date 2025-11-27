[relizy](../globals.md) / executeHook

# Function: executeHook()

> **executeHook**(`hook`, `config`, `dryRun`, `params?`): `Promise`\<`any`\>

Defined in: [src/core/utils.ts:9](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/core/utils.ts#L9)

Execute a hook

## Parameters

### hook

`"error:release"` | `"error:publish"` | `"error:push"` | `"error:changelog"` | `"error:social"` | `"error:bump"` | `"error:commit-and-tag"` | `"error:provider-release"` | `"error:twitter"` | `"error:slack"` | `"before:release"` | `"before:publish"` | `"before:push"` | `"before:changelog"` | `"before:social"` | `"before:bump"` | `"before:commit-and-tag"` | `"before:provider-release"` | `"before:twitter"` | `"before:slack"` | `"success:release"` | `"success:publish"` | `"success:push"` | `"success:changelog"` | `"success:social"` | `"success:bump"` | `"success:commit-and-tag"` | `"success:provider-release"` | `"success:twitter"` | `"success:slack"` | `"generate:changelog"`

### config

[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

### dryRun

`boolean`

### params?

`any`

## Returns

`Promise`\<`any`\>
