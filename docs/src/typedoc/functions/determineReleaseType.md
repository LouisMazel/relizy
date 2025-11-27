[relizy](../globals.md) / determineReleaseType

# Function: determineReleaseType()

> **determineReleaseType**(`__namedParameters`): `ReleaseType` \| `undefined`

Defined in: [src/core/version.ts:186](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/core/version.ts#L186)

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
