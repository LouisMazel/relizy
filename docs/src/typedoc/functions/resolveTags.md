[relizy](../globals.md) / resolveTags

# Function: resolveTags()

> **resolveTags**\<`S`, `NewVersion`\>(`__namedParameters`): `Promise`\<[`ResolvedTags`](../interfaces/ResolvedTags.md)\>

Defined in: [src/core/tags.ts:491](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/core/tags.ts#L491)

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
