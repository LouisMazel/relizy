[relizy](../globals.md) / RepoConfig

# Interface: RepoConfig

Defined in: [src/types.ts:503](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L503)

## Properties

### domain?

> `optional` **domain**: `string`

Defined in: [src/types.ts:507](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L507)

Git domain (e.g. `github.com`)

***

### provider?

> `optional` **provider**: [`GitProvider`](../type-aliases/GitProvider.md)

Defined in: [src/types.ts:520](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L520)

Git provider (e.g. `github` or `gitlab`)

#### Default

```ts
'github'
```

***

### repo?

> `optional` **repo**: `string`

Defined in: [src/types.ts:511](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L511)

Git repository (e.g. `user/repo`)

***

### token?

> `optional` **token**: `string`

Defined in: [src/types.ts:515](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L515)

Git token
