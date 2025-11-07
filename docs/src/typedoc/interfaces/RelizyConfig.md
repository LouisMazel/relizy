[relizy](../globals.md) / RelizyConfig

# Interface: RelizyConfig

Defined in: [src/types.ts:460](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L460)

## Extends

- `Partial`\<`Omit`\<`IChangelogConfig`, `"output"` \| `"templates"` \| `"publish"`\>\>

## Properties

### bump?

> `optional` **bump**: [`BumpConfig`](BumpConfig.md)

Defined in: [src/types.ts:491](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L491)

#### Default

```ts
undefined
```

---

### changelog?

> `optional` **changelog**: [`ChangelogConfig`](ChangelogConfig.md)

Defined in: [src/types.ts:499](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L499)

#### Default

```ts
undefined
```

---

### cwd?

> `optional` **cwd**: `string`

Defined in: [src/types.ts:465](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L465)

Current working directory

#### Default

```ts
process.cwd()
```

#### Overrides

`Partial.cwd`

---

### excludeAuthors?

> `optional` **excludeAuthors**: `string`[]

Defined in: node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/index.d.mts:47

#### Inherited from

`Partial.excludeAuthors`

---

### from?

> `optional` **from**: `string`

Defined in: [src/types.ts:470](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L470)

Start tag

#### Default

```ts
undefined
```

#### Overrides

`Partial.from`

---

### hideAuthorEmail?

> `optional` **hideAuthorEmail**: `boolean`

Defined in: node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/index.d.mts:48

#### Inherited from

`Partial.hideAuthorEmail`

---

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:507](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L507)

#### Default

```ts
undefined
```

---

### monorepo?

> `optional` **monorepo**: [`MonorepoConfig`](MonorepoConfig.md)

Defined in: [src/types.ts:479](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L479)

#### Default

```ts
undefined
```

---

### newVersion?

> `optional` **newVersion**: `string`

Defined in: node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/index.d.mts:33

#### Inherited from

`Partial.newVersion`

---

### noAuthors?

> `optional` **noAuthors**: `boolean`

Defined in: node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/index.d.mts:46

#### Inherited from

`Partial.noAuthors`

---

### publish?

> `optional` **publish**: [`PublishConfig`](../type-aliases/PublishConfig.md)

Defined in: [src/types.ts:495](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L495)

#### Default

```ts
undefined
```

---

### release?

> `optional` **release**: [`ReleaseConfig`](ReleaseConfig.md)

Defined in: [src/types.ts:503](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L503)

#### Default

```ts
undefined
```

---

### repo?

> `optional` **repo**: [`RepoConfig`](RepoConfig.md)

Defined in: [src/types.ts:483](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L483)

#### Default

```ts
undefined
```

#### Overrides

`Partial.repo`

---

### scopeMap?

> `optional` **scopeMap**: `Record`\<`string`, `string`\>

Defined in: node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/index.d.mts:28

#### Inherited from

`Partial.scopeMap`

---

### signTags?

> `optional` **signTags**: `boolean`

Defined in: node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/index.d.mts:34

#### Inherited from

`Partial.signTags`

---

### templates?

> `optional` **templates**: [`TemplatesConfig`](TemplatesConfig.md)

Defined in: [src/types.ts:487](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L487)

#### Default

```ts
undefined
```

---

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:475](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L475)

End tag

#### Default

```ts
undefined
```

#### Overrides

`Partial.to`

---

### tokens?

> `optional` **tokens**: `Partial`\<`Record`\<`RepoProvider`, `string`\>\>

Defined in: node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/index.d.mts:30

#### Inherited from

`Partial.tokens`

---

### types?

> `optional` **types**: `Record`\<`string`, `boolean` \| \{ `semver?`: `SemverBumpType`; `title`: `string`; \}\>

Defined in: node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/index.d.mts:24

#### Inherited from

`Partial.types`
