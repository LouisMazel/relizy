[relizy](../globals.md) / HookConfig

# Type Alias: HookConfig

> **HookConfig** = \{ \[K in \`$\{HookType\}:$\{HookStep\}\`\]?: string \| ((config: ResolvedRelizyConfig, dryRun: boolean) =\> any) \} & `object`

Defined in: [src/types.ts:796](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L796)

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
