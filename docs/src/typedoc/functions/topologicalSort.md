[relizy](../globals.md) / topologicalSort

# Function: topologicalSort()

> **topologicalSort**(`packages`): [`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]

Defined in: [src/core/dependencies.ts:137](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/core/dependencies.ts#L137)

Topological sort of packages based on their dependencies
Ensures dependencies are processed before dependents

## Parameters

### packages

[`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]

## Returns

[`PackageWithDeps`](../interfaces/PackageWithDeps.md)[]
