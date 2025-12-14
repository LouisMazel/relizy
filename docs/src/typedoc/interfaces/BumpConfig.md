[relizy](../globals.md) / BumpConfig

# Interface: BumpConfig

Defined in: [src/types.ts:149](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L149)

## Extended by

- [`BumpOptions`](BumpOptions.md)
- [`ReleaseOptions`](ReleaseOptions.md)

## Properties

### clean?

> `optional` **clean**: `boolean`

Defined in: [src/types.ts:163](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L163)

Check if there are any changes to commit before bumping.

#### Default

```ts
true
```

***

### dependencyTypes?

> `optional` **dependencyTypes**: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[]

Defined in: [src/types.ts:168](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L168)

Include dependencies when bumping.

#### Default

```ts
['dependencies']
```

***

### preid?

> `optional` **preid**: `string`

Defined in: [src/types.ts:158](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L158)

Prerelease identifier (e.g. 'beta', 'alpha')

***

### type?

> `optional` **type**: `ReleaseType`

Defined in: [src/types.ts:154](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L154)

Release type (e.g. 'major', 'minor', 'patch', 'prerelease', 'prepatch', 'preminor', 'premajor')

#### Default

```ts
'release'
```

***

### yes?

> `optional` **yes**: `boolean`

Defined in: [src/types.ts:173](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L173)

Skip confirmation prompt about bumping packages

#### Default

```ts
true
```
