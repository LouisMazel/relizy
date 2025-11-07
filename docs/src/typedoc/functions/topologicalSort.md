[relizy](../globals.md) / topologicalSort

# Function: topologicalSort()

> **topologicalSort**(`packages`): [`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]

Defined in: [src/core/dependencies.ts:137](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/core/dependencies.ts#L137)

Topological sort of packages based on their dependencies
Ensures dependencies are processed before dependents

## Parameters

### packages

[`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]

## Returns

[`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]
