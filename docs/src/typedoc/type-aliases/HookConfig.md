[relizy](../globals.md) / HookConfig

# Type Alias: HookConfig

> **HookConfig** = \{ \[K in \`$\{HookType\}:$\{HookStep\}\`\]?: string \| ((config: ResolvedRelizyConfig, dryRun: boolean) =\> any) \} & `object`

Defined in: [src/types.ts:530](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L530)

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
