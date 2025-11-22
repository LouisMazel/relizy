[relizy](../globals.md) / determineReleaseType

# Function: determineReleaseType()

> **determineReleaseType**(`__namedParameters`): `ReleaseType` \| `undefined`

Defined in: [src/core/version.ts:186](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/core/version.ts#L186)

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
