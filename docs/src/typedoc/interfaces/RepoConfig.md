[relizy](../globals.md) / RepoConfig

# Interface: RepoConfig

Defined in: [src/types.ts:422](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L422)

## Properties

### domain?

> `optional` **domain**: `string`

Defined in: [src/types.ts:426](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L426)

Git domain (e.g. `github.com`)

***

### provider?

> `optional` **provider**: [`GitProvider`](../type-aliases/GitProvider.md)

Defined in: [src/types.ts:439](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L439)

Git provider (e.g. `github` or `gitlab`)

#### Default

```ts
'github'
```

***

### repo?

> `optional` **repo**: `string`

Defined in: [src/types.ts:430](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L430)

Git repository (e.g. `user/repo`)

***

### token?

> `optional` **token**: `string`

Defined in: [src/types.ts:434](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L434)

Git token
