[relizy](../globals.md) / ChangelogOptions

# Interface: ChangelogOptions

Defined in: [src/types.ts:195](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L195)

## Extends

- [`ChangelogConfig`](ChangelogConfig.md)

## Properties

### bumpedPackages?

> `optional` **bumpedPackages**: [`PackageInfo`](PackageInfo.md)[]

Defined in: [src/types.ts:215](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L215)

Bumped packages

#### Default

```ts
undefined
```

---

### config?

> `optional` **config**: [`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

Defined in: [src/types.ts:220](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L220)

Use custom config

#### Default

```ts
undefined
```

---

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:230](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L230)

Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)

#### Default

```ts
'relizy'
```

---

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:210](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L210)

Run without side effects

#### Default

```ts
false
```

---

### formatCmd?

> `optional` **formatCmd**: `string`

Defined in: [src/types.ts:183](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L183)

Command to format the changelog (e.g. `prettier --write CHANGELOG.md`).

#### Default

```ts
undefined
```

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`formatCmd`](ChangelogConfig.md#formatcmd)

---

### from?

> `optional` **from**: `string`

Defined in: [src/types.ts:200](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L200)

Start tag

#### Default

```ts
undefined
```

---

### includeCommitBody?

> `optional` **includeCommitBody**: `boolean`

Defined in: [src/types.ts:193](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L193)

Include commit body in the changelog.

#### Default

```ts
true
```

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`includeCommitBody`](ChangelogConfig.md#includecommitbody)

---

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:225](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L225)

Set log level

#### Default

```ts
undefined
```

---

### rootChangelog?

> `optional` **rootChangelog**: `boolean`

Defined in: [src/types.ts:188](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L188)

Generate changelog at root level with all changes

#### Default

```ts
true
```

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`rootChangelog`](ChangelogConfig.md#rootchangelog)

---

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:205](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L205)

End tag

#### Default

```ts
undefined
```
