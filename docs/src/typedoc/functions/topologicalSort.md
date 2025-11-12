[relizy](../globals.md) / topologicalSort

# Function: topologicalSort()

> **topologicalSort**(`packages`): [`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]

Defined in: [src/core/dependencies.ts:137](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/dependencies.ts#L137)

Topological sort of packages based on their dependencies
Ensures dependencies are processed before dependents

## Parameters

### packages

[`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]

## Returns

[`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]
