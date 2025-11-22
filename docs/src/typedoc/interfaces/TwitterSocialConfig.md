[relizy](../globals.md) / TwitterSocialConfig

# Interface: TwitterSocialConfig

Defined in: [src/types.ts:550](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L550)

## Properties

### credentials?

> `optional` **credentials**: [`TwitterCredentials`](TwitterCredentials.md)

Defined in: [src/types.ts:570](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L570)

Twitter credentials (optional - falls back to environment variables)

***

### enabled?

> `optional` **enabled**: `boolean`

Defined in: [src/types.ts:555](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L555)

Enable Twitter posting

#### Default

```ts
false
```

***

### messageTemplate?

> `optional` **messageTemplate**: `string`

Defined in: [src/types.ts:566](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L566)

Custom message template
Available variables: {{projectName}}, {{version}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}

***

### onlyStable?

> `optional` **onlyStable**: `boolean`

Defined in: [src/types.ts:561](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L561)

Skip Twitter posting for prerelease versions (alpha, beta, rc, etc.)
Only stable versions will be posted to Twitter

#### Default

```ts
true
```
