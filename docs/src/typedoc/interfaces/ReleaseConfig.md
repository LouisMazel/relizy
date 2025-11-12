[relizy](../globals.md) / ReleaseConfig

# Interface: ReleaseConfig

Defined in: [src/types.ts:322](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L322)

## Extended by

- [`ReleaseOptions`](ReleaseOptions.md)

## Properties

### changelog?

> `optional` **changelog**: `boolean`

Defined in: [src/types.ts:337](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L337)

Generate changelog files (CHANGELOG.md)

#### Default

```ts
true
```

***

### clean?

> `optional` **clean**: `boolean`

Defined in: [src/types.ts:357](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L357)

Determine if the working directory is clean and if it is not clean, exit

#### Default

```ts
false
```

***

### commit?

> `optional` **commit**: `boolean`

Defined in: [src/types.ts:327](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L327)

Commit changes and create tag

#### Default

```ts
true
```

***

### noVerify?

> `optional` **noVerify**: `boolean`

Defined in: [src/types.ts:352](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L352)

Skip git verification while committing by using --no-verify flag

#### Default

```ts
true
```

***

### providerRelease?

> `optional` **providerRelease**: `boolean`

Defined in: [src/types.ts:342](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L342)

Publish release to your repository (github or gitlab)

#### Default

```ts
true
```

***

### publish?

> `optional` **publish**: `boolean`

Defined in: [src/types.ts:347](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L347)

Publish release to your registry

#### Default

```ts
true
```

***

### push?

> `optional` **push**: `boolean`

Defined in: [src/types.ts:332](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L332)

Push changes to your repository (commit and tag(s))

#### Default

```ts
true
```
