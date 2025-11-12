[relizy](../globals.md) / ProviderReleaseOptions

# Interface: ProviderReleaseOptions

Defined in: [src/types.ts:223](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L223)

## Properties

### bumpResult?

> `optional` **bumpResult**: [`BumpResult`](../type-aliases/BumpResult.md)

Defined in: [src/types.ts:253](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L253)

Bump result

***

### config?

> `optional` **config**: [`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

Defined in: [src/types.ts:239](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L239)

Use custom config

***

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:244](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L244)

Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)

#### Default

```ts
'relizy'
```

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:262](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L262)

Run without side effects

#### Default

```ts
false
```

***

### from?

> `optional` **from**: `string`

Defined in: [src/types.ts:227](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L227)

Start tag

***

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:257](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L257)

Set log level

***

### provider?

> `optional` **provider**: [`GitProvider`](../type-aliases/GitProvider.md)

Defined in: [src/types.ts:249](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L249)

Git provider

#### Default

```ts
'github'
```

***

### safetyCheck?

> `optional` **safetyCheck**: `boolean`

Defined in: [src/types.ts:267](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L267)

Skip safety check

#### Default

```ts
false
```

***

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:231](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L231)

End tag

***

### token?

> `optional` **token**: `string`

Defined in: [src/types.ts:235](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L235)

Git token (GitHub or GitLab)
