[relizy](../globals.md) / PublishOptions

# Interface: PublishOptions

Defined in: [src/types.ts:297](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L297)

## Extends

- [`PublishConfig`](../type-aliases/PublishConfig.md)

## Properties

### access?

> `optional` **access**: `"public"` \| `"restricted"`

Defined in: [src/types.ts:282](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L282)

NPM access level (e.g. `public` or `restricted`)

#### Inherited from

`PublishConfig.access`

***

### args?

> `optional` **args**: `string`[]

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:37

#### Inherited from

`PublishConfig.args`

***

### buildCmd?

> `optional` **buildCmd**: `string`

Defined in: [src/types.ts:294](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L294)

Command to build your packages before publishing (e.g. `pnpm build`)

#### Inherited from

`PublishConfig.buildCmd`

***

### bumpedPackages?

> `optional` **bumpedPackages**: [`PackageInfo`](PackageInfo.md)[]

Defined in: [src/types.ts:310](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L310)

Bumped packages

***

### config?

> `optional` **config**: [`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

Defined in: [src/types.ts:306](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L306)

Use custom config

***

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:319](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L319)

Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)

#### Default

```ts
'relizy'
```

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:302](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L302)

Run without side effects

#### Default

```ts
false
```

***

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:314](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L314)

Set log level

***

### otp?

> `optional` **otp**: `string`

Defined in: [src/types.ts:286](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L286)

NPM OTP (e.g. `123456`)

#### Inherited from

`PublishConfig.otp`

***

### packages?

> `optional` **packages**: `string`[]

Defined in: [src/types.ts:290](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L290)

Glob pattern matching for packages to publish

#### Inherited from

`PublishConfig.packages`

***

### private?

> `optional` **private**: `boolean`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:39

#### Inherited from

`PublishConfig.private`

***

### registry?

> `optional` **registry**: `string`

Defined in: [src/types.ts:274](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L274)

NPM registry URL (e.g. `https://registry.npmjs.org/`)

#### Inherited from

`PublishConfig.registry`

***

### tag?

> `optional` **tag**: `string`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:38

NPM tag (e.g. `latest`)

#### Inherited from

`PublishConfig.tag`
