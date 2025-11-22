[relizy](../globals.md) / BumpOptions

# Interface: BumpOptions

Defined in: [src/types.ts:176](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L176)

## Extends

- [`BumpConfig`](BumpConfig.md)

## Properties

### clean?

> `optional` **clean**: `boolean`

Defined in: [src/types.ts:163](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L163)

Check if there are any changes to commit before bumping.

#### Default

```ts
true
```

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`clean`](BumpConfig.md#clean)

***

### config?

> `optional` **config**: [`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

Defined in: [src/types.ts:185](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L185)

Use custom config

***

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:199](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L199)

Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)

#### Default

```ts
'relizy'
```

***

### dependencyTypes?

> `optional` **dependencyTypes**: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[]

Defined in: [src/types.ts:168](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L168)

Include dependencies when bumping.

#### Default

```ts
['dependencies']
```

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`dependencyTypes`](BumpConfig.md#dependencytypes)

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:181](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L181)

Run without side effects

#### Default

```ts
false
```

***

### force?

> `optional` **force**: `boolean`

Defined in: [src/types.ts:194](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L194)

Bump all packages even if there are no commits

#### Default

```ts
false
```

***

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:189](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L189)

Set log level

***

### preid?

> `optional` **preid**: `string`

Defined in: [src/types.ts:158](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L158)

Prerelease identifier (e.g. 'beta', 'alpha')

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`preid`](BumpConfig.md#preid)

***

### suffix?

> `optional` **suffix**: `string`

Defined in: [src/types.ts:203](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L203)

Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)

***

### type?

> `optional` **type**: `ReleaseType`

Defined in: [src/types.ts:154](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L154)

Release type (e.g. 'major', 'minor', 'patch', 'prerelease', 'prepatch', 'preminor', 'premajor')

#### Default

```ts
'release'
```

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`type`](BumpConfig.md#type)

***

### yes?

> `optional` **yes**: `boolean`

Defined in: [src/types.ts:173](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L173)

Skip confirmation prompt about bumping packages

#### Default

```ts
true
```

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`yes`](BumpConfig.md#yes)
