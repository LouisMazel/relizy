[relizy](../globals.md) / bumpPackageIndependently

# Function: bumpPackageIndependently()

> **bumpPackageIndependently**(`__namedParameters`): \{ `bumped`: `true`; `newVersion`: `string`; `oldVersion`: `string`; \} \| \{ `bumped`: `false`; \}

Defined in: [src/core/version.ts:391](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/version.ts#L391)

## Parameters

### \_\_namedParameters

#### dryRun

`boolean`

#### pkg

[`PackageToBump`](../interfaces/PackageToBump.md) & [`PackageInfo`](../interfaces/PackageInfo.md)

## Returns

\{ `bumped`: `true`; `newVersion`: `string`; `oldVersion`: `string`; \} \| \{ `bumped`: `false`; \}
