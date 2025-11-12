[relizy](../globals.md) / getPackagesWithDependencies

# Function: getPackagesWithDependencies()

> **getPackagesWithDependencies**(`packages`, `dependencyTypes`): [`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]

Defined in: [src/core/dependencies.ts:48](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/core/dependencies.ts#L48)

Transform packages array into PackageWithDeps with their workspace dependencies

## Parameters

### packages

[`PackageInfo`](../interfaces/PackageInfo.md)[]

### dependencyTypes

(`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[] | `undefined`

## Returns

[`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]
