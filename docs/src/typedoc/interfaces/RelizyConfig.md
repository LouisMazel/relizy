[relizy](../globals.md) / RelizyConfig

# Interface: RelizyConfig

Defined in: [src/types.ts:458](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L458)

## Extends

- `Partial`\<`Omit`\<`IChangelogConfig`, `"output"` \| `"templates"` \| `"publish"`\>\>

## Properties

### bump?

> `optional` **bump**: [`BumpConfig`](BumpConfig.md)

Defined in: [src/types.ts:487](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L487)

Bump config

***

### changelog?

> `optional` **changelog**: [`ChangelogConfig`](ChangelogConfig.md)

Defined in: [src/types.ts:495](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L495)

Changelog config

***

### cwd?

> `optional` **cwd**: `string`

Defined in: [src/types.ts:463](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L463)

Current working directory

#### Default

```ts
process.cwd()
```

#### Overrides

`Partial.cwd`

***

### excludeAuthors?

> `optional` **excludeAuthors**: `string`[]

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:47

#### Inherited from

`Partial.excludeAuthors`

***

### from?

> `optional` **from**: `string`

Defined in: [src/types.ts:467](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L467)

Start tag

#### Overrides

`Partial.from`

***

### hideAuthorEmail?

> `optional` **hideAuthorEmail**: `boolean`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:48

#### Inherited from

`Partial.hideAuthorEmail`

***

### hooks?

> `optional` **hooks**: [`HookConfig`](../type-aliases/HookConfig.md)

Defined in: [src/types.ts:503](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L503)

Hooks config

***

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:508](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L508)

Set log level

#### Default

```ts
'default'
```

***

### monorepo?

> `optional` **monorepo**: [`MonorepoConfig`](MonorepoConfig.md)

Defined in: [src/types.ts:475](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L475)

Monorepo config

***

### newVersion?

> `optional` **newVersion**: `string`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:33

#### Inherited from

`Partial.newVersion`

***

### noAuthors?

> `optional` **noAuthors**: `boolean`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:46

#### Inherited from

`Partial.noAuthors`

***

### publish?

> `optional` **publish**: [`PublishConfig`](../type-aliases/PublishConfig.md)

Defined in: [src/types.ts:491](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L491)

Publish config

***

### release?

> `optional` **release**: [`ReleaseConfig`](ReleaseConfig.md)

Defined in: [src/types.ts:499](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L499)

Release config

***

### repo?

> `optional` **repo**: [`RepoConfig`](RepoConfig.md)

Defined in: [src/types.ts:479](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L479)

Repo config

#### Overrides

`Partial.repo`

***

### safetyCheck?

> `optional` **safetyCheck**: `boolean`

Defined in: [src/types.ts:513](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L513)

The safety check will verify if tokens or others required for release are set (depends on the release options)

#### Default

```ts
true
```

***

### scopeMap?

> `optional` **scopeMap**: `Record`\<`string`, `string`\>

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:28

#### Inherited from

`Partial.scopeMap`

***

### signTags?

> `optional` **signTags**: `boolean`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:34

#### Inherited from

`Partial.signTags`

***

### templates?

> `optional` **templates**: [`TemplatesConfig`](TemplatesConfig.md)

Defined in: [src/types.ts:483](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L483)

Templates config

***

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:471](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L471)

End tag

#### Overrides

`Partial.to`

***

### tokens?

> `optional` **tokens**: `Partial`\<`Record`\<`RepoProvider`, `string`\>\>

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:30

#### Inherited from

`Partial.tokens`

***

### types?

> `optional` **types**: `Record`\<`string`, `boolean` \| \{ `semver?`: `SemverBumpType`; `title`: `string`; \}\>

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:24

#### Inherited from

`Partial.types`
