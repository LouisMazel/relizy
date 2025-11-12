[relizy](../globals.md) / expandPackagesToBumpWithDependents

# Function: expandPackagesToBumpWithDependents()

> **expandPackagesToBumpWithDependents**(`__namedParameters`): [`PackageToBump`](../interfaces/PackageToBump.md)[]

Defined in: [src/core/dependencies.ts:70](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/core/dependencies.ts#L70)

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
