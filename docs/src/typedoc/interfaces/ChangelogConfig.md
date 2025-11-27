[relizy](../globals.md) / ChangelogConfig

# Interface: ChangelogConfig

Defined in: [src/types.ts:206](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L206)

## Extended by

- [`ChangelogOptions`](ChangelogOptions.md)
- [`ReleaseOptions`](ReleaseOptions.md)

## Properties

### formatCmd?

> `optional` **formatCmd**: `string`

Defined in: [src/types.ts:210](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L210)

Command to format the changelog (e.g. `prettier --write CHANGELOG.md`).

***

### includeCommitBody?

> `optional` **includeCommitBody**: `boolean`

Defined in: [src/types.ts:220](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L220)

Include commit body in the changelog.

#### Default

```ts
true
```

***

### rootChangelog?

> `optional` **rootChangelog**: `boolean`

Defined in: [src/types.ts:215](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L215)

Generate changelog at root level with all changes

#### Default

```ts
true
```
