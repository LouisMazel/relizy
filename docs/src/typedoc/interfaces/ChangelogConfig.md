[relizy](../globals.md) / ChangelogConfig

# Interface: ChangelogConfig

Defined in: [src/types.ts:174](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L174)

## Extended by

- [`ChangelogOptions`](ChangelogOptions.md)
- [`ReleaseOptions`](ReleaseOptions.md)

## Properties

### formatCmd?

> `optional` **formatCmd**: `string`

Defined in: [src/types.ts:178](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L178)

Command to format the changelog (e.g. `prettier --write CHANGELOG.md`).

***

### includeCommitBody?

> `optional` **includeCommitBody**: `boolean`

Defined in: [src/types.ts:188](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L188)

Include commit body in the changelog.

#### Default

```ts
true
```

***

### rootChangelog?

> `optional` **rootChangelog**: `boolean`

Defined in: [src/types.ts:183](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L183)

Generate changelog at root level with all changes

#### Default

```ts
true
```
