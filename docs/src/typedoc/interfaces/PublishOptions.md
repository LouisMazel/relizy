[relizy](../globals.md) / PublishOptions

# Interface: PublishOptions

Defined in: [src/types.ts:402](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L402)

## Extends

- [`PublishConfig`](../type-aliases/PublishConfig.md)

## Properties

### access?

> `optional` **access**: `"public"` \| `"restricted"`

Defined in: [src/types.ts:378](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L378)

NPM access level (e.g. `public` or `restricted`)

#### Inherited from

`PublishConfig.access`

***

### args?

> `optional` **args**: `string`[]

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.5.1/node\_modules/changelogen/dist/index.d.mts:37

#### Inherited from

`PublishConfig.args`

***

### buildCmd?

> `optional` **buildCmd**: `string`

Defined in: [src/types.ts:390](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L390)

Command to build your packages before publishing (e.g. `pnpm build`)

#### Inherited from

`PublishConfig.buildCmd`

***

### bumpResult?

> `optional` **bumpResult**: [`BumpResultTruthy`](BumpResultTruthy.md)

Defined in: [src/types.ts:415](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L415)

Bump result

***

### config?

> `optional` **config**: [`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

Defined in: [src/types.ts:411](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L411)

Use custom config

***

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:424](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L424)

Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)

#### Default

```ts
'relizy'
```

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:407](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L407)

Run without side effects

#### Default

```ts
false
```

***

### force?

> `optional` **force**: `boolean`

Defined in: [src/types.ts:433](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L433)

Bump even if there are no commits

#### Default

```ts
false
```

***

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:419](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L419)

Set log level

***

### otp?

> `optional` **otp**: `string`

Defined in: [src/types.ts:382](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L382)

NPM OTP (e.g. `123456`)

#### Inherited from

`PublishConfig.otp`

***

### packageManager?

> `optional` **packageManager**: [`PackageManager`](../type-aliases/PackageManager.md)

Defined in: [src/types.ts:366](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L366)

Package manager (e.g. `pnpm`, `npm`, `yarn` or `bun`)

#### Inherited from

`PublishConfig.packageManager`

***

### packages?

> `optional` **packages**: `string`[]

Defined in: [src/types.ts:386](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L386)

Glob pattern matching for packages to publish

#### Inherited from

`PublishConfig.packages`

***

### private?

> `optional` **private**: `boolean`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.5.1/node\_modules/changelogen/dist/index.d.mts:39

#### Inherited from

`PublishConfig.private`

***

### registry?

> `optional` **registry**: `string`

Defined in: [src/types.ts:370](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L370)

NPM registry URL (e.g. `https://registry.npmjs.org/`)

#### Inherited from

`PublishConfig.registry`

***

### safetyCheck?

> `optional` **safetyCheck**: `boolean`

Defined in: [src/types.ts:399](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L399)

Skip safety check

#### Default

```ts
false
```

#### Inherited from

`PublishConfig.safetyCheck`

***

### suffix?

> `optional` **suffix**: `string`

Defined in: [src/types.ts:428](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L428)

Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)

***

### tag?

> `optional` **tag**: `string`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.5.1/node\_modules/changelogen/dist/index.d.mts:38

NPM tag (e.g. `latest`)

#### Inherited from

`PublishConfig.tag`

***

### token?

> `optional` **token**: `string`

Defined in: [src/types.ts:394](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L394)

NPM token (e.g. `123456`) - only supported for pnpm and npm

#### Inherited from

`PublishConfig.token`
