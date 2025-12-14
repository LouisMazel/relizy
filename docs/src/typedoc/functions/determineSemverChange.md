[relizy](../globals.md) / determineSemverChange

# Function: determineSemverChange()

> **determineSemverChange**(`commits`, `types`): `"major"` \| `"minor"` \| `"patch"` \| `undefined`

Defined in: [src/core/version.ts:24](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/core/version.ts#L24)

## Parameters

### commits

`GitCommit`[]

### types

`NonNullable`\<[`RelizyConfig`](../interfaces/RelizyConfig.md)\[`"types"`\]\>

## Returns

`"major"` \| `"minor"` \| `"patch"` \| `undefined`
