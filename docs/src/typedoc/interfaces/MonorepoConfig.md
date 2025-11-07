[relizy](../globals.md) / MonorepoConfig

# Interface: MonorepoConfig

Defined in: [src/types.ts:90](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L90)

## Properties

### ignorePackageNames?

> `optional` **ignorePackageNames**: `string`[]

Defined in: [src/types.ts:103](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L103)

Package names to ignore.

#### Default

```ts
[]
```

---

### packages

> **packages**: `string`[]

Defined in: [src/types.ts:98](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L98)

Glob pattern matching for packages to bump.

---

### versionMode

> **versionMode**: [`VersionMode`](../type-aliases/VersionMode.md)

Defined in: [src/types.ts:94](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L94)

Version mode for the monorepo.
