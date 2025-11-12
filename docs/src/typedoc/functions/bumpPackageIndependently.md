[relizy](../globals.md) / bumpPackageIndependently

# Function: bumpPackageIndependently()

> **bumpPackageIndependently**(`__namedParameters`): \{ `bumped`: `true`; `newVersion`: `string`; `oldVersion`: `string`; \} \| \{ `bumped`: `false`; \}

Defined in: [src/core/version.ts:391](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/core/version.ts#L391)

## Parameters

### \_\_namedParameters

#### dryRun

`boolean`

#### pkg

[`PackageToBump`](../interfaces/PackageToBump.md) & [`PackageInfo`](../interfaces/PackageInfo.md)

## Returns

\{ `bumped`: `true`; `newVersion`: `string`; `oldVersion`: `string`; \} \| \{ `bumped`: `false`; \}
