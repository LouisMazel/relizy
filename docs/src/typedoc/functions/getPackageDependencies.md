[relizy](../globals.md) / getPackageDependencies

# Function: getPackageDependencies()

> **getPackageDependencies**(`packagePath`, `allPackageNames`, `dependencyTypes`): `string`[]

Defined in: [src/core/dependencies.ts:20](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/dependencies.ts#L20)

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
