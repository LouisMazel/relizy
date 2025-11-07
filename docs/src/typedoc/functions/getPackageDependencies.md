[relizy](../globals.md) / getPackageDependencies

# Function: getPackageDependencies()

> **getPackageDependencies**(`packagePath`, `allPackageNames`, `dependencyTypes`): `string`[]

Defined in: [src/core/dependencies.ts:20](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/core/dependencies.ts#L20)

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
