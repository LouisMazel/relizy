[relizy](../globals.md) / ProviderReleaseOptions

# Interface: ProviderReleaseOptions

Defined in: [src/types.ts:233](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L233)

## Properties

### bumpResult?

> `optional` **bumpResult**: [`BumpResult`](../type-aliases/BumpResult.md)

Defined in: [src/types.ts:268](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L268)

Bump result

#### Default

```ts
undefined
```

---

### config?

> `optional` **config**: [`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

Defined in: [src/types.ts:253](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L253)

Use custom config

#### Default

```ts
undefined
```

---

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:258](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L258)

Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)

#### Default

```ts
'relizy'
```

---

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:278](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L278)

Run without side effects

#### Default

```ts
false
```

---

### from?

> `optional` **from**: `string`

Defined in: [src/types.ts:238](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L238)

Start tag

#### Default

```ts
undefined
```

---

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:273](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L273)

Set log level

#### Default

```ts
undefined
```

---

### provider?

> `optional` **provider**: [`GitProvider`](../type-aliases/GitProvider.md)

Defined in: [src/types.ts:263](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L263)

Git provider

#### Default

```ts
'github'
```

---

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:243](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L243)

End tag

#### Default

```ts
undefined
```

---

### token?

> `optional` **token**: `string`

Defined in: [src/types.ts:248](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L248)

GitHub/GitLab token

#### Default

```ts
undefined
```
