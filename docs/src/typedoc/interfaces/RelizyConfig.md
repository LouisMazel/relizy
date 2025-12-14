[relizy](../globals.md) / RelizyConfig

# Interface: RelizyConfig

Defined in: [src/types.ts:543](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L543)

Relizy configuration

## See

https://louismazel.github.io/relizy/config/overview

## Extends

- `Partial`\<`Omit`\<`IChangelogConfig`, `"output"` \| `"templates"` \| `"publish"` \| `"types"`\>\>

## Properties

### bump?

> `optional` **bump**: [`BumpConfig`](BumpConfig.md)

Defined in: [src/types.ts:577](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L577)

Bump config

***

### changelog?

> `optional` **changelog**: [`ChangelogConfig`](ChangelogConfig.md)

Defined in: [src/types.ts:585](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L585)

Changelog config

***

### cwd?

> `optional` **cwd**: `string`

Defined in: [src/types.ts:553](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L553)

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

Defined in: [src/types.ts:557](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L557)

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

Defined in: [src/types.ts:593](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L593)

Hooks config

***

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:598](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L598)

Set log level

#### Default

```ts
'default'
```

***

### monorepo?

> `optional` **monorepo**: [`MonorepoConfig`](MonorepoConfig.md)

Defined in: [src/types.ts:565](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L565)

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

Defined in: [src/types.ts:581](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L581)

Publish config

***

### release?

> `optional` **release**: [`ReleaseConfig`](ReleaseConfig.md)

Defined in: [src/types.ts:589](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L589)

Release config

***

### repo?

> `optional` **repo**: [`RepoConfig`](RepoConfig.md)

Defined in: [src/types.ts:569](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L569)

Repo config

#### Overrides

`Partial.repo`

***

### safetyCheck?

> `optional` **safetyCheck**: `boolean`

Defined in: [src/types.ts:603](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L603)

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

### templates?

> `optional` **templates**: [`TemplatesConfig`](TemplatesConfig.md)

Defined in: [src/types.ts:573](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L573)

Templates config

***

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:561](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L561)

End tag

#### Overrides

`Partial.to`

***

### tokens?

> `optional` **tokens**: `Partial`\<`Record`\<`RepoProvider`, `string`\>\>

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.5.1/node\_modules/changelogen/dist/index.d.mts:30

#### Inherited from

`Partial.tokens`

***

### types?

> `optional` **types**: `Record`\<`string`, `false` \| \{ `semver?`: `SemverBumpType`; `title`: `string`; \}\>

Defined in: [src/types.ts:544](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/types.ts#L544)
