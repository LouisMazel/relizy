[relizy](../globals.md) / SocialOptions

# Interface: SocialOptions

Defined in: [src/types.ts:320](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L320)

## Properties

### bumpResult?

> `optional` **bumpResult**: [`BumpResult`](../type-aliases/BumpResult.md)

Defined in: [src/types.ts:341](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L341)

Bump result (contains release information)

***

### config?

> `optional` **config**: [`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

Defined in: [src/types.ts:332](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L332)

Use custom config

***

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:337](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L337)

Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)

#### Default

```ts
'relizy'
```

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:354](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L354)

Run without side effects

#### Default

```ts
false
```

***

### from?

> `optional` **from**: `string`

Defined in: [src/types.ts:324](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L324)

Start tag

***

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:349](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L349)

Set log level

***

### postedReleases?

> `optional` **postedReleases**: [`PostedRelease`](PostedRelease.md)[]

Defined in: [src/types.ts:345](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L345)

Posted releases (from provider-release step)

***

### safetyCheck?

> `optional` **safetyCheck**: `boolean`

Defined in: [src/types.ts:359](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L359)

Skip safety check

#### Default

```ts
false
```

***

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:328](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L328)

End tag
