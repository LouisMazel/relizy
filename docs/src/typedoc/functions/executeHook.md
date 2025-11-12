[relizy](../globals.md) / executeHook

# Function: executeHook()

> **executeHook**(`hook`, `config`, `dryRun`, `params?`): `Promise`\<`any`\>

Defined in: [src/core/utils.ts:8](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/utils.ts#L8)

Execute a hook

## Parameters

### hook

`"error:release"` | `"error:publish"` | `"error:push"` | `"error:changelog"` | `"error:bump"` | `"error:commit-and-tag"` | `"error:provider-release"` | `"before:release"` | `"before:publish"` | `"before:push"` | `"before:changelog"` | `"before:bump"` | `"before:commit-and-tag"` | `"before:provider-release"` | `"after:release"` | `"after:publish"` | `"after:push"` | `"after:changelog"` | `"after:bump"` | `"after:commit-and-tag"` | `"after:provider-release"` | `"generate:changelog"`

### config

[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

### dryRun

`boolean`

### params?

`any`

## Returns

`Promise`\<`any`\>
