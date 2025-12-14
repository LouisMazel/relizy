[relizy](../globals.md) / ReleaseConfig

# Interface: ReleaseConfig

Defined in: [src/types.ts:394](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L394)

## Extended by

- [`ReleaseOptions`](ReleaseOptions.md)

## Properties

### changelog?

> `optional` **changelog**: `boolean`

Defined in: [src/types.ts:409](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L409)

Generate changelog files (CHANGELOG.md)

#### Default

```ts
true
```

***

### clean?

> `optional` **clean**: `boolean`

Defined in: [src/types.ts:429](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L429)

Determine if the working directory is clean and if it is not clean, exit

#### Default

```ts
false
```

***

### commit?

> `optional` **commit**: `boolean`

Defined in: [src/types.ts:399](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L399)

Commit changes and create tag

#### Default

```ts
true
```

***

### gitTag?

> `optional` **gitTag**: `boolean`

Defined in: [src/types.ts:434](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L434)

Create tag

#### Default

```ts
true
```

***

### noVerify?

> `optional` **noVerify**: `boolean`

Defined in: [src/types.ts:424](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L424)

Skip git verification while committing by using --no-verify flag

#### Default

```ts
true
```

***

### providerRelease?

> `optional` **providerRelease**: `boolean`

Defined in: [src/types.ts:414](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L414)

Publish release to your repository (github or gitlab)

#### Default

```ts
true
```

***

### publish?

> `optional` **publish**: `boolean`

Defined in: [src/types.ts:419](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L419)

Publish release to your registry

#### Default

```ts
true
```

***

### push?

> `optional` **push**: `boolean`

Defined in: [src/types.ts:404](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L404)

Push changes to your repository (commit and tag(s))

#### Default

```ts
true
```
