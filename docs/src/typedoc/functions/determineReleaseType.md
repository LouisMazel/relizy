[relizy](../globals.md) / determineReleaseType

# Function: determineReleaseType()

> **determineReleaseType**(`__namedParameters`): `ReleaseType` \| `undefined`

Defined in: [src/core/version.ts:186](https://github.com/LouisMazel/relizy/blob/e825440947cdf546c2bcfbd3c3752ac669c25476/src/core/version.ts#L186)

## Parameters

### \_\_namedParameters

#### commits?

`GitCommit`[]

#### currentVersion

`string`

#### force

`boolean`

#### preid

`string` \| `undefined`

#### releaseType

`ReleaseType`

#### types

`Record`\<`string`, `false` \| \{ `semver?`: `SemverBumpType`; `title`: `string`; \}\>

## Returns

`ReleaseType` \| `undefined`
