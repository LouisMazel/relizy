[relizy](../globals.md) / ProviderReleaseOptions

# Interface: ProviderReleaseOptions

Defined in: [src/types.ts:264](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L264)

## Properties

### bumpResult?

> `optional` **bumpResult**: [`BumpResultTruthy`](BumpResultTruthy.md)

Defined in: [src/types.ts:294](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L294)

Bump result

***

### config?

> `optional` **config**: [`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

Defined in: [src/types.ts:280](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L280)

Use custom config

***

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:285](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L285)

Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)

#### Default

```ts
'relizy'
```

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:303](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L303)

Run without side effects

#### Default

```ts
false
```

***

### force

> **force**: `boolean`

Defined in: [src/types.ts:313](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L313)

Generate changelog for all packages even if there are no commits

#### Default

```ts
false
```

***

### from?

> `optional` **from**: `string`

Defined in: [src/types.ts:268](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L268)

Start tag

***

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:298](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L298)

Set log level

***

### provider?

> `optional` **provider**: [`GitProvider`](../type-aliases/GitProvider.md)

Defined in: [src/types.ts:290](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L290)

Git provider

#### Default

```ts
'github'
```

***

### safetyCheck?

> `optional` **safetyCheck**: `boolean`

Defined in: [src/types.ts:308](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L308)

Skip safety check

#### Default

```ts
false
```

***

### suffix?

> `optional` **suffix**: `string`

Defined in: [src/types.ts:317](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L317)

Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)

***

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:272](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L272)

End tag

***

### token?

> `optional` **token**: `string`

Defined in: [src/types.ts:276](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L276)

Git token (GitHub or GitLab)
