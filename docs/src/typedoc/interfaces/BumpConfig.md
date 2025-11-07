[relizy](../globals.md) / BumpConfig

# Interface: BumpConfig

Defined in: [src/types.ts:117](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L117)

## Extended by

- [`BumpOptions`](BumpOptions.md)
- [`ReleaseOptions`](ReleaseOptions.md)

## Properties

### clean?

> `optional` **clean**: `boolean`

Defined in: [src/types.ts:132](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L132)

Check if there are any changes to commit before bumping.

#### Default

```ts
true
```

---

### dependencyTypes?

> `optional` **dependencyTypes**: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[]

Defined in: [src/types.ts:137](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L137)

Include dependencies when bumping.

#### Default

```ts
['dependencies']
```

---

### preid?

> `optional` **preid**: `string`

Defined in: [src/types.ts:127](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L127)

Prerelease identifier (e.g. 'beta', 'alpha')

#### Default

```ts
undefined
```

---

### type?

> `optional` **type**: `ReleaseType`

Defined in: [src/types.ts:122](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L122)

Release type (e.g. 'major', 'minor', 'patch', 'prerelease', 'prepatch', 'preminor', 'premajor')

#### Default

```ts
'release'
```

---

### yes?

> `optional` **yes**: `boolean`

Defined in: [src/types.ts:142](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L142)

Skip confirmation prompt about bumping packages

#### Default

```ts
true
```
