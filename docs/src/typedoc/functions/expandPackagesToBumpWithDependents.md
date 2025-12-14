[relizy](../globals.md) / expandPackagesToBumpWithDependents

# Function: expandPackagesToBumpWithDependents()

> **expandPackagesToBumpWithDependents**(`__namedParameters`): [`PackageBase`](../interfaces/PackageBase.md)[]

Defined in: [src/core/dependencies.ts:65](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/core/dependencies.ts#L65)

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
