[relizy](../globals.md) / findPackagesWithCommitsAndCalculateVersions

# Function: findPackagesWithCommitsAndCalculateVersions()

> **findPackagesWithCommitsAndCalculateVersions**(`__namedParameters`): `Promise`\<[`PackageInfo`](../interfaces/PackageInfo.md) & [`PackageToBump`](../interfaces/PackageToBump.md)[]\>

Defined in: [src/core/version.ts:737](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/version.ts#L737)

## Parameters

### \_\_namedParameters

#### config

[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

#### force

`boolean`

#### packages

[`PackageInfo`](../interfaces/PackageInfo.md)[]

#### suffix

`string` \| `undefined`

## Returns

`Promise`\<[`PackageInfo`](../interfaces/PackageInfo.md) & [`PackageToBump`](../interfaces/PackageToBump.md)[]\>
