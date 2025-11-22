[relizy](../globals.md) / RelizyConfig

# Interface: RelizyConfig

Defined in: [src/types.ts:809](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L809)

Relizy configuration

## See

https://louismazel.github.io/relizy/config/overview

## Extends

- `Partial`\<`Omit`\<`IChangelogConfig`, `"output"` \| `"templates"` \| `"publish"` \| `"types"` \| `"tokens"`\>\>

## Properties

### bump?

> `optional` **bump**: [`BumpConfig`](BumpConfig.md)

Defined in: [src/types.ts:843](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L843)

Bump config

***

### changelog?

> `optional` **changelog**: [`ChangelogConfig`](ChangelogConfig.md)

Defined in: [src/types.ts:851](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L851)

Changelog config

***

### cwd?

> `optional` **cwd**: `string`

Defined in: [src/types.ts:819](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L819)

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

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.5.1/node\_modules/changelogen/dist/index.d.mts:47

#### Inherited from

`Partial.excludeAuthors`

***

### from?

> `optional` **from**: `string`

Defined in: [src/types.ts:823](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L823)

Start tag

#### Overrides

`Partial.from`

***

### hideAuthorEmail?

> `optional` **hideAuthorEmail**: `boolean`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.5.1/node\_modules/changelogen/dist/index.d.mts:48

#### Inherited from

`Partial.hideAuthorEmail`

***

### hooks?

> `optional` **hooks**: [`HookConfig`](../type-aliases/HookConfig.md)

Defined in: [src/types.ts:867](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L867)

Hooks config

***

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:872](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L872)

Set log level

#### Default

```ts
'default'
```

***

### monorepo?

> `optional` **monorepo**: [`MonorepoConfig`](MonorepoConfig.md)

Defined in: [src/types.ts:831](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L831)

Monorepo config

***

### newVersion?

> `optional` **newVersion**: `string`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.5.1/node\_modules/changelogen/dist/index.d.mts:33

#### Inherited from

`Partial.newVersion`

***

### noAuthors?

> `optional` **noAuthors**: `boolean`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.5.1/node\_modules/changelogen/dist/index.d.mts:46

#### Inherited from

`Partial.noAuthors`

***

### publish?

> `optional` **publish**: [`PublishConfig`](../type-aliases/PublishConfig.md)

Defined in: [src/types.ts:847](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L847)

Publish config

***

### release?

> `optional` **release**: [`ReleaseConfig`](ReleaseConfig.md)

Defined in: [src/types.ts:855](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L855)

Release config

***

### repo?

> `optional` **repo**: [`RepoConfig`](RepoConfig.md)

Defined in: [src/types.ts:835](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L835)

Repo config

#### Overrides

`Partial.repo`

***

### safetyCheck?

> `optional` **safetyCheck**: `boolean`

Defined in: [src/types.ts:877](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L877)

The safety check will verify if tokens or others required for release are set (depends on the release options)

#### Default

```ts
true
```

***

### scopeMap?

> `optional` **scopeMap**: `Record`\<`string`, `string`\>

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.5.1/node\_modules/changelogen/dist/index.d.mts:28

#### Inherited from

`Partial.scopeMap`

***

### signTags?

> `optional` **signTags**: `boolean`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.5.1/node\_modules/changelogen/dist/index.d.mts:34

#### Inherited from

`Partial.signTags`

***

### social?

> `optional` **social**: [`SocialConfig`](SocialConfig.md)

Defined in: [src/types.ts:859](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L859)

Social media configuration

***

### templates?

> `optional` **templates**: [`TemplatesConfig`](TemplatesConfig.md)

Defined in: [src/types.ts:839](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L839)

Templates config

***

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:827](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L827)

End tag

#### Overrides

`Partial.to`

***

### tokens?

> `optional` **tokens**: [`Tokens`](Tokens.md)

Defined in: [src/types.ts:863](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L863)

API tokens configuration

***

### types?

> `optional` **types**: `Record`\<`string`, `false` \| \{ `semver?`: `SemverBumpType`; `title`: `string`; \}\>

Defined in: [src/types.ts:810](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L810)
