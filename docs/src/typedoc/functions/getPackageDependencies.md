[relizy](../globals.md) / getPackageDependencies

# Function: getPackageDependencies()

> **getPackageDependencies**(`__namedParameters`): `string`[]

Defined in: [src/core/dependencies.ts:9](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/core/dependencies.ts#L9)

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
