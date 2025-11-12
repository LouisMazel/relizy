[relizy](../globals.md) / getPackageDependencies

# Function: getPackageDependencies()

> **getPackageDependencies**(`packagePath`, `allPackageNames`, `dependencyTypes`): `string`[]

Defined in: [src/core/dependencies.ts:20](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/core/dependencies.ts#L20)

Get workspace dependencies of a package (only dependencies and peerDependencies, not devDependencies)

## Parameters

### packagePath

`string`

### allPackageNames

`Set`\<`string`\>

### dependencyTypes

(`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[] | `undefined`

## Returns

`string`[]
