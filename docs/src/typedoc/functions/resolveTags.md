[relizy](../globals.md) / resolveTags

# Function: resolveTags()

> **resolveTags**\<`S`, `NewVersion`\>(`__namedParameters`): `Promise`\<[`ResolvedTags`](../interfaces/ResolvedTags.md)\>

Defined in: [src/core/tags.ts:228](https://github.com/LouisMazel/relizy/blob/e825440947cdf546c2bcfbd3c3752ac669c25476/src/core/tags.ts#L228)

## Type Parameters

### S

`S` *extends* [`Step`](../type-aliases/Step.md)

### NewVersion

`NewVersion` = `S` *extends* `"bump"` ? `undefined` : `string`

## Parameters

### \_\_namedParameters

#### config

[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

#### newVersion

`NewVersion`

#### pkg

[`ReadPackage`](../interfaces/ReadPackage.md)

#### step

`S`

## Returns

`Promise`\<[`ResolvedTags`](../interfaces/ResolvedTags.md)\>
