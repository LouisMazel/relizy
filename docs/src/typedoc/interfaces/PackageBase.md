[relizy](../globals.md) / PackageBase

# Interface: PackageBase

Defined in: [src/types.ts:32](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L32)

PACAKGE TYPES

## Extends

- [`ReadPackage`](ReadPackage.md)

## Properties

### commits

> **commits**: `GitCommit`[]

Defined in: [src/types.ts:40](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L40)

Commits

***

### dependencies

> **dependencies**: `string`[]

Defined in: [src/types.ts:48](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L48)

Dependencies

***

### dependencyChain?

> `optional` **dependencyChain**: `string`[]

Defined in: [src/types.ts:56](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L56)

Dependency chain

***

### fromTag

> **fromTag**: `string`

Defined in: [src/types.ts:36](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L36)

From tag

***

### name

> **name**: `string`

Defined in: [src/types.ts:17](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L17)

Package name

#### Inherited from

[`ReadPackage`](ReadPackage.md).[`name`](ReadPackage.md#name)

***

### newVersion?

> `optional` **newVersion**: `string`

Defined in: [src/types.ts:44](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L44)

New version

***

### path

> **path**: `string`

Defined in: [src/types.ts:21](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L21)

Package path

#### Inherited from

[`ReadPackage`](ReadPackage.md).[`path`](ReadPackage.md#path)

***

### private

> **private**: `boolean`

Defined in: [src/types.ts:29](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L29)

Package path

#### Inherited from

[`ReadPackage`](ReadPackage.md).[`private`](ReadPackage.md#private)

***

### reason?

> `optional` **reason**: `"commits"` \| `"dependency"` \| `"graduation"`

Defined in: [src/types.ts:52](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L52)

Reason for bumping

***

### version

> **version**: `string`

Defined in: [src/types.ts:25](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L25)

Current version

#### Inherited from

[`ReadPackage`](ReadPackage.md).[`version`](ReadPackage.md#version)
