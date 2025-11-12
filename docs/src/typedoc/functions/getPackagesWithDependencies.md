[relizy](../globals.md) / getPackagesWithDependencies

# Function: getPackagesWithDependencies()

> **getPackagesWithDependencies**(`packages`, `dependencyTypes`): [`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]

Defined in: [src/core/dependencies.ts:48](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/dependencies.ts#L48)

Transform packages array into PackageWithDeps with their workspace dependencies

## Parameters

### packages

[`PackageInfo`](../interfaces/PackageInfo.md)[]

### dependencyTypes

(`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[] | `undefined`

## Returns

[`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]
