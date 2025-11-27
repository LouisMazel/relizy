[relizy](../globals.md) / RepoConfig

# Interface: RepoConfig

Defined in: [src/types.ts:737](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L737)

## Properties

### domain?

> `optional` **domain**: `string`

Defined in: [src/types.ts:741](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L741)

Git domain (e.g. `github.com`)

***

### provider?

> `optional` **provider**: [`GitProvider`](../type-aliases/GitProvider.md)

Defined in: [src/types.ts:754](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L754)

Git provider (e.g. `github` or `gitlab`)

#### Default

```ts
'github'
```

***

### repo?

> `optional` **repo**: `string`

Defined in: [src/types.ts:745](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L745)

Git repository (e.g. `user/repo`)

***

### token?

> `optional` **token**: `string`

Defined in: [src/types.ts:749](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L749)

Git token
