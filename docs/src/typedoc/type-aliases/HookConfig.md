[relizy](../globals.md) / HookConfig

# Type Alias: HookConfig

> **HookConfig** = \{ \[K in \`$\{HookType\}:$\{HookStep\}\`\]?: string \| ((config: ResolvedRelizyConfig, dryRun: boolean) =\> any) \} & `object`

Defined in: [src/types.ts:449](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L449)

Hooks configuration
Useful to run custom scripts before, after a step or on error

## Type Declaration

### generate:changelog()?

> `optional` **generate:changelog**: (`config`, `dryRun`, `params`) => `string` \| `void` \| `null` \| `undefined` \| `Promise`\<`string` \| `void` \| `null` \| `undefined`\>

#### Parameters

##### config

[`ResolvedRelizyConfig`](ResolvedRelizyConfig.md)

##### dryRun

`boolean`

##### params

###### changelog

`string`

###### commits

`GitCommit`[]

#### Returns

`string` \| `void` \| `null` \| `undefined` \| `Promise`\<`string` \| `void` \| `null` \| `undefined`\>
