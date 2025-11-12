[relizy](../globals.md) / executeHook

# Function: executeHook()

> **executeHook**(`hook`, `config`, `dryRun`, `params?`): `Promise`\<`any`\>

Defined in: [src/core/utils.ts:8](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/core/utils.ts#L8)

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
