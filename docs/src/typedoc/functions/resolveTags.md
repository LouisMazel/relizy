[relizy](../globals.md) / resolveTags

# Function: resolveTags()

> **resolveTags**\<`S`, `NewVersion`\>(`__namedParameters`): `Promise`\<[`ResolvedTags`](../interfaces/ResolvedTags.md)\>

Defined in: [src/core/tags.ts:491](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/core/tags.ts#L491)

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
