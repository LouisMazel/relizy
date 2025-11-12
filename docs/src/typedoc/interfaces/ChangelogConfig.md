[relizy](../globals.md) / ChangelogConfig

# Interface: ChangelogConfig

Defined in: [src/types.ts:174](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L174)

## Extended by

- [`ChangelogOptions`](ChangelogOptions.md)
- [`ReleaseOptions`](ReleaseOptions.md)

## Properties

### formatCmd?

> `optional` **formatCmd**: `string`

Defined in: [src/types.ts:178](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L178)

Command to format the changelog (e.g. `prettier --write CHANGELOG.md`).

***

### includeCommitBody?

> `optional` **includeCommitBody**: `boolean`

Defined in: [src/types.ts:188](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L188)

Include commit body in the changelog.

#### Default

```ts
true
```

***

### rootChangelog?

> `optional` **rootChangelog**: `boolean`

Defined in: [src/types.ts:183](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L183)

Generate changelog at root level with all changes

#### Default

```ts
true
```
