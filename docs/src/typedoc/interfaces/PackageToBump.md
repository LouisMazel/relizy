[relizy](../globals.md) / PackageToBump

# Interface: PackageToBump

Defined in: [src/core/dependencies.ts:11](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/core/dependencies.ts#L11)

## Extends

- [`PackageInfo`](PackageInfo.md)

## Properties

### commits

> **commits**: `GitCommit`[]

Defined in: [src/core/dependencies.ts:14](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/core/dependencies.ts#L14)

---

### currentVersion

> **currentVersion**: `string`

Defined in: [src/types.ts:22](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L22)

Current version

#### Inherited from

[`PackageInfo`](PackageInfo.md).[`currentVersion`](PackageInfo.md#currentversion)

---

### dependencyChain?

> `optional` **dependencyChain**: `string`[]

Defined in: [src/core/dependencies.ts:13](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/core/dependencies.ts#L13)

---

### fromTag?

> `optional` **fromTag**: `string`

Defined in: [src/types.ts:30](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L30)

Tag name

#### Inherited from

[`PackageInfo`](PackageInfo.md).[`fromTag`](PackageInfo.md#fromtag)

---

### name

> **name**: `string`

Defined in: [src/types.ts:14](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L14)

Package name

#### Inherited from

[`PackageInfo`](PackageInfo.md).[`name`](PackageInfo.md#name)

---

### path

> **path**: `string`

Defined in: [src/types.ts:18](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L18)

Package path

#### Inherited from

[`PackageInfo`](PackageInfo.md).[`path`](PackageInfo.md#path)

---

### reason

> **reason**: `"commits"` \| `"dependency"`

Defined in: [src/core/dependencies.ts:12](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/core/dependencies.ts#L12)

---

### version

> **version**: `string`

Defined in: [src/types.ts:26](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L26)

New version

#### Inherited from

[`PackageInfo`](PackageInfo.md).[`version`](PackageInfo.md#version)
