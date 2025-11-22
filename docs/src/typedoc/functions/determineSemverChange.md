[relizy](../globals.md) / determineSemverChange

# Function: determineSemverChange()

> **determineSemverChange**(`commits`, `types`): `"major"` \| `"minor"` \| `"patch"` \| `undefined`

Defined in: [src/core/version.ts:24](https://github.com/LouisMazel/relizy/blob/e825440947cdf546c2bcfbd3c3752ac669c25476/src/core/version.ts#L24)

## Parameters

### commits

`GitCommit`[]

### types

`Record`\<`string`, `false` \| \{ `semver?`: `SemverBumpType`; `title`: `string`; \}\>

## Returns

`"major"` \| `"minor"` \| `"patch"` \| `undefined`
