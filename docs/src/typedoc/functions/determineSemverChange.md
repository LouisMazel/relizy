[relizy](../globals.md) / determineSemverChange

# Function: determineSemverChange()

> **determineSemverChange**(`commits`, `types`): `"major"` \| `"minor"` \| `"patch"` \| `undefined`

Defined in: [src/core/version.ts:24](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/core/version.ts#L24)

## Parameters

### commits

`GitCommit`[]

### types

`NonNullable`\<[`RelizyConfig`](../interfaces/RelizyConfig.md)\[`"types"`\]\>

## Returns

`"major"` \| `"minor"` \| `"patch"` \| `undefined`
