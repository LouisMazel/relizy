[relizy](../globals.md) / determineReleaseType

# Function: determineReleaseType()

> **determineReleaseType**(`__namedParameters`): `ReleaseType` \| `undefined`

Defined in: [src/core/version.ts:186](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/core/version.ts#L186)

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
