[relizy](../globals.md) / getPackagesWithDependencies

# Function: getPackagesWithDependencies()

> **getPackagesWithDependencies**(`packages`, `dependencyTypes`): [`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]

Defined in: [src/core/dependencies.ts:48](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/core/dependencies.ts#L48)

Transform packages array into PackageWithDeps with their workspace dependencies

## Parameters

### packages

[`PackageInfo`](../interfaces/PackageInfo.md)[]

### dependencyTypes

(`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[] | `undefined`

## Returns

[`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]
