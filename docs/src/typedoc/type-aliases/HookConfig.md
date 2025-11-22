[relizy](../globals.md) / HookConfig

# Type Alias: HookConfig

> **HookConfig** = \{ \[K in \`$\{HookType\}:$\{HookStep\}\`\]?: string \| ((config: ResolvedRelizyConfig, dryRun: boolean) =\> any) \} & `object`

Defined in: [src/types.ts:796](https://github.com/LouisMazel/relizy/blob/e825440947cdf546c2bcfbd3c3752ac669c25476/src/types.ts#L796)

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
