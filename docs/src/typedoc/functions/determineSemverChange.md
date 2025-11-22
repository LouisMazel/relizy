[relizy](../globals.md) / determineSemverChange

# Function: determineSemverChange()

> **determineSemverChange**(`commits`, `types`): `"major"` \| `"minor"` \| `"patch"` \| `undefined`

Defined in: [src/core/version.ts:24](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/core/version.ts#L24)

## Parameters

### commits

`GitCommit`[]

### types

`NonNullable`\<[`RelizyConfig`](../interfaces/RelizyConfig.md)\[`"types"`\]\>

## Returns

`"major"` \| `"minor"` \| `"patch"` \| `undefined`
