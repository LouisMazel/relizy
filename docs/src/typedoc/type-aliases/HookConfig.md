[relizy](../globals.md) / HookConfig

# Type Alias: HookConfig

> **HookConfig** = \{ \[K in \`$\{HookType\}:$\{HookStep\}\`\]?: string \| ((config: ResolvedRelizyConfig, dryRun: boolean) =\> any) \} & `object`

Defined in: [src/types.ts:449](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L449)

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
