[relizy](../globals.md) / BumpResult

# Type Alias: BumpResult

> **BumpResult** = \{ `bumped`: `true`; `bumpedPackages`: [`PackageInfo`](../interfaces/PackageInfo.md)[]; `fromTag?`: `string`; `newVersion?`: `string`; `oldVersion?`: `string`; \} \| \{ `bumped`: `false`; \}

Defined in: [src/types.ts:43](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L43)

## Type Declaration

\{ `bumped`: `true`; `bumpedPackages`: [`PackageInfo`](../interfaces/PackageInfo.md)[]; `fromTag?`: `string`; `newVersion?`: `string`; `oldVersion?`: `string`; \}

### bumped

> **bumped**: `true`

Bumped

### bumpedPackages

> **bumpedPackages**: [`PackageInfo`](../interfaces/PackageInfo.md)[]

Bumped packages

### fromTag?

> `optional` **fromTag**: `string`

Tag name

### newVersion?

> `optional` **newVersion**: `string`

New version

### oldVersion?

> `optional` **oldVersion**: `string`

Old version

\{ `bumped`: `false`; \}

### bumped

> **bumped**: `false`

Bumped
