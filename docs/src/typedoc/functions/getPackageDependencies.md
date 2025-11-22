[relizy](../globals.md) / getPackageDependencies

# Function: getPackageDependencies()

> **getPackageDependencies**(`__namedParameters`): `string`[]

Defined in: [src/core/dependencies.ts:9](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/core/dependencies.ts#L9)

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
