[relizy](../globals.md) / ReleaseConfig

# Interface: ReleaseConfig

Defined in: [src/types.ts:436](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L436)

## Extended by

- [`ReleaseOptions`](ReleaseOptions.md)

## Properties

### changelog?

> `optional` **changelog**: `boolean`

Defined in: [src/types.ts:451](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L451)

Generate changelog files (CHANGELOG.md)

#### Default

```ts
true
```

***

### clean?

> `optional` **clean**: `boolean`

Defined in: [src/types.ts:471](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L471)

Determine if the working directory is clean and if it is not clean, exit

#### Default

```ts
false
```

***

### commit?

> `optional` **commit**: `boolean`

Defined in: [src/types.ts:441](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L441)

Commit changes and create tag

#### Default

```ts
true
```

***

### gitTag?

> `optional` **gitTag**: `boolean`

Defined in: [src/types.ts:476](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L476)

Create tag

#### Default

```ts
true
```

***

### noVerify?

> `optional` **noVerify**: `boolean`

Defined in: [src/types.ts:466](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L466)

Skip git verification while committing by using --no-verify flag

#### Default

```ts
true
```

***

### providerRelease?

> `optional` **providerRelease**: `boolean`

Defined in: [src/types.ts:456](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L456)

Publish release to your repository (github or gitlab)

#### Default

```ts
true
```

***

### publish?

> `optional` **publish**: `boolean`

Defined in: [src/types.ts:461](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L461)

Publish release to your registry

#### Default

```ts
true
```

***

### push?

> `optional` **push**: `boolean`

Defined in: [src/types.ts:446](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L446)

Push changes to your repository (commit and tag(s))

#### Default

```ts
true
```

***

### social?

> `optional` **social**: `boolean`

Defined in: [src/types.ts:481](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L481)

Post release announcements to social media platforms

#### Default

```ts
false
```
