[relizy](../globals.md) / PublishOptions

# Interface: PublishOptions

Defined in: [src/types.ts:314](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L314)

## Extends

- [`PublishConfig`](../type-aliases/PublishConfig.md)

## Properties

### access?

> `optional` **access**: `"public"` \| `"restricted"`

Defined in: [src/types.ts:296](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L296)

NPM access level (e.g. `public` or `restricted`)

#### Default

```ts
undefined
```

#### Inherited from

`PublishConfig.access`

---

### args?

> `optional` **args**: `string`[]

Defined in: node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/index.d.mts:37

#### Inherited from

`PublishConfig.args`

---

### buildCmd?

> `optional` **buildCmd**: `string`

Defined in: [src/types.ts:311](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L311)

Command to build your packages before publishing (e.g. `pnpm build`)

#### Default

```ts
undefined
```

#### Inherited from

`PublishConfig.buildCmd`

---

### bumpedPackages?

> `optional` **bumpedPackages**: [`PackageInfo`](PackageInfo.md)[]

Defined in: [src/types.ts:329](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L329)

Bumped packages

#### Default

```ts
undefined
```

---

### config?

> `optional` **config**: [`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

Defined in: [src/types.ts:324](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L324)

Use custom config

#### Default

```ts
undefined
```

---

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:339](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L339)

Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)

#### Default

```ts
'relizy'
```

---

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:319](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L319)

Run without side effects

#### Default

```ts
false
```

---

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:334](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L334)

Set log level

#### Default

```ts
undefined
```

---

### otp?

> `optional` **otp**: `string`

Defined in: [src/types.ts:301](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L301)

NPM OTP (e.g. `123456`)

#### Default

```ts
undefined
```

#### Inherited from

`PublishConfig.otp`

---

### packages?

> `optional` **packages**: `string`[]

Defined in: [src/types.ts:306](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L306)

Glob pattern matching for packages to publish

#### Default

```ts
undefined
```

#### Inherited from

`PublishConfig.packages`

---

### private?

> `optional` **private**: `boolean`

Defined in: node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/index.d.mts:39

#### Inherited from

`PublishConfig.private`

---

### registry?

> `optional` **registry**: `string`

Defined in: [src/types.ts:286](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L286)

NPM registry URL (e.g. `https://registry.npmjs.org/`)

#### Default

```ts
undefined
```

#### Inherited from

`PublishConfig.registry`

---

### tag?

> `optional` **tag**: `string`

Defined in: node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/index.d.mts:38

NPM tag (e.g. `latest`)

#### Default

```ts
undefined
```

#### Inherited from

`PublishConfig.tag`
