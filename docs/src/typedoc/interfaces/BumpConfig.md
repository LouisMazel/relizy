[relizy](../globals.md) / BumpConfig

# Interface: BumpConfig

Defined in: [src/types.ts:117](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L117)

## Extended by

- [`BumpOptions`](BumpOptions.md)
- [`ReleaseOptions`](ReleaseOptions.md)

## Properties

### clean?

> `optional` **clean**: `boolean`

Defined in: [src/types.ts:131](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L131)

Check if there are any changes to commit before bumping.

#### Default

```ts
true
```

***

### dependencyTypes?

> `optional` **dependencyTypes**: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[]

Defined in: [src/types.ts:136](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L136)

Include dependencies when bumping.

#### Default

```ts
['dependencies']
```

***

### preid?

> `optional` **preid**: `string`

Defined in: [src/types.ts:126](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L126)

Prerelease identifier (e.g. 'beta', 'alpha')

***

### type?

> `optional` **type**: `ReleaseType`

Defined in: [src/types.ts:122](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L122)

Release type (e.g. 'major', 'minor', 'patch', 'prerelease', 'prepatch', 'preminor', 'premajor')

#### Default

```ts
'release'
```

***

### yes?

> `optional` **yes**: `boolean`

Defined in: [src/types.ts:141](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L141)

Skip confirmation prompt about bumping packages

#### Default

```ts
true
```
