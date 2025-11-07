[relizy](../globals.md) / ReleaseConfig

# Interface: ReleaseConfig

Defined in: [src/types.ts:342](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L342)

## Extended by

- [`ReleaseOptions`](ReleaseOptions.md)

## Properties

### changelog?

> `optional` **changelog**: `boolean`

Defined in: [src/types.ts:357](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L357)

Generate changelog files (CHANGELOG.md)

#### Default

```ts
true
```

---

### clean?

> `optional` **clean**: `boolean`

Defined in: [src/types.ts:377](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L377)

Determine if the working directory is clean and if it is not clean, exit

#### Default

```ts
false
```

---

### commit?

> `optional` **commit**: `boolean`

Defined in: [src/types.ts:347](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L347)

Commit changes and create tag

#### Default

```ts
true
```

---

### noVerify?

> `optional` **noVerify**: `boolean`

Defined in: [src/types.ts:372](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L372)

Skip git verification while committing by using --no-verify flag

#### Default

```ts
true
```

---

### providerRelease?

> `optional` **providerRelease**: `boolean`

Defined in: [src/types.ts:362](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L362)

Publish release to your repository (github or gitlab)

#### Default

```ts
true
```

---

### publish?

> `optional` **publish**: `boolean`

Defined in: [src/types.ts:367](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L367)

Publish release to your registry

#### Default

```ts
true
```

---

### push?

> `optional` **push**: `boolean`

Defined in: [src/types.ts:352](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L352)

Push changes to your repository (commit and tag(s))

#### Default

```ts
true
```
