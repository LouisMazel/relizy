[relizy](../globals.md) / expandPackagesToBumpWithDependents

# Function: expandPackagesToBumpWithDependents()

> **expandPackagesToBumpWithDependents**(`__namedParameters`): [`PackageBase`](../interfaces/PackageBase.md)[]

Defined in: [src/core/dependencies.ts:65](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/core/dependencies.ts#L65)

Recursively expand packages to bump with all their dependents (transitive)
Returns packages with reason for bumping and dependency chain for traceability

## Parameters

### \_\_namedParameters

#### allPackages

[`PackageBase`](../interfaces/PackageBase.md)[]

#### packagesWithCommits

[`PackageBase`](../interfaces/PackageBase.md)[]

## Returns

[`PackageBase`](../interfaces/PackageBase.md)[]
