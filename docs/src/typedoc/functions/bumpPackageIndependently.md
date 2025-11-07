[relizy](../globals.md) / bumpPackageIndependently

# Function: bumpPackageIndependently()

> **bumpPackageIndependently**(`__namedParameters`): \{ `bumped`: `true`; `newVersion`: `string`; `oldVersion`: `string`; \} \| \{ `bumped`: `false`; \}

Defined in: [src/core/version.ts:391](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/core/version.ts#L391)

## Parameters

### \_\_namedParameters

#### dryRun

`boolean`

#### pkg

[`PackageToBump`](../interfaces/PackageToBump.md) & [`PackageInfo`](../interfaces/PackageInfo.md)

## Returns

\{ `bumped`: `true`; `newVersion`: `string`; `oldVersion`: `string`; \} \| \{ `bumped`: `false`; \}
