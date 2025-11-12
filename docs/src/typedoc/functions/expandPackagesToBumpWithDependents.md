[relizy](../globals.md) / expandPackagesToBumpWithDependents

# Function: expandPackagesToBumpWithDependents()

> **expandPackagesToBumpWithDependents**(`__namedParameters`): [`PackageToBump`](../interfaces/PackageToBump.md)[]

Defined in: [src/core/dependencies.ts:70](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/dependencies.ts#L70)

Recursively expand packages to bump with all their dependents (transitive)
Returns packages with reason for bumping and dependency chain for traceability

## Parameters

### \_\_namedParameters

#### allPackages

[`PackageInfo`](../interfaces/PackageInfo.md)[]

#### dependencyTypes

(`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[] \| `undefined`

#### packagesWithCommits

[`PackageWithCommits`](../interfaces/PackageWithCommits.md)[]

## Returns

[`PackageToBump`](../interfaces/PackageToBump.md)[]
