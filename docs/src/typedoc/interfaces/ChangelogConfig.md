[relizy](../globals.md) / ChangelogConfig

# Interface: ChangelogConfig

Defined in: [src/types.ts:178](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L178)

## Extended by

- [`ChangelogOptions`](ChangelogOptions.md)
- [`ReleaseOptions`](ReleaseOptions.md)

## Properties

### formatCmd?

> `optional` **formatCmd**: `string`

Defined in: [src/types.ts:183](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L183)

Command to format the changelog (e.g. `prettier --write CHANGELOG.md`).

#### Default

```ts
undefined
```

---

### includeCommitBody?

> `optional` **includeCommitBody**: `boolean`

Defined in: [src/types.ts:193](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L193)

Include commit body in the changelog.

#### Default

```ts
true
```

---

### rootChangelog?

> `optional` **rootChangelog**: `boolean`

Defined in: [src/types.ts:188](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L188)

Generate changelog at root level with all changes

#### Default

```ts
true
```
