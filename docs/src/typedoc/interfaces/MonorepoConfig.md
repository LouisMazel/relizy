[relizy](../globals.md) / MonorepoConfig

# Interface: MonorepoConfig

Defined in: [src/types.ts:122](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L122)

## Properties

### ignorePackageNames?

> `optional` **ignorePackageNames**: `string`[]

Defined in: [src/types.ts:135](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L135)

Package names to ignore.

#### Default

```ts
[]
```

***

### packages

> **packages**: `string`[]

Defined in: [src/types.ts:130](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L130)

Glob pattern matching for packages to bump.

***

### versionMode

> **versionMode**: [`VersionMode`](../type-aliases/VersionMode.md)

Defined in: [src/types.ts:126](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L126)

Version mode for the monorepo.
