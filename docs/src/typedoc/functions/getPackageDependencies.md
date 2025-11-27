[relizy](../globals.md) / getPackageDependencies

# Function: getPackageDependencies()

> **getPackageDependencies**(`__namedParameters`): `string`[]

Defined in: [src/core/dependencies.ts:9](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/core/dependencies.ts#L9)

Get workspace dependencies of a package (only dependencies and peerDependencies, not devDependencies)

## Parameters

### \_\_namedParameters

#### allPackageNames

`Set`\<`string`\>

#### dependencyTypes

(`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[] \| `undefined`

#### packagePath

`string`

## Returns

`string`[]
