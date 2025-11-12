[relizy](../globals.md) / BumpOptions

# Interface: BumpOptions

Defined in: [src/types.ts:144](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L144)

## Extends

- [`BumpConfig`](BumpConfig.md)

## Properties

### clean?

> `optional` **clean**: `boolean`

Defined in: [src/types.ts:131](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L131)

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

Defined in: [src/types.ts:153](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L153)

Use custom config

***

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:167](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L167)

Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)

#### Default

```ts
'relizy'
```

***

### dependencyTypes?

> `optional` **dependencyTypes**: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[]

Defined in: [src/types.ts:136](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L136)

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

Defined in: [src/types.ts:149](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L149)

Run without side effects

#### Default

```ts
false
```

***

### force?

> `optional` **force**: `boolean`

Defined in: [src/types.ts:162](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L162)

Bump all packages even if there are no commits

#### Default

```ts
false
```

***

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:157](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L157)

Set log level

***

### preid?

> `optional` **preid**: `string`

Defined in: [src/types.ts:126](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L126)

Prerelease identifier (e.g. 'beta', 'alpha')

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`preid`](BumpConfig.md#preid)

***

### suffix?

> `optional` **suffix**: `string`

Defined in: [src/types.ts:171](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L171)

Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)

***

### type?

> `optional` **type**: `ReleaseType`

Defined in: [src/types.ts:122](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L122)

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

Defined in: [src/types.ts:141](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L141)

Skip confirmation prompt about bumping packages

#### Default

```ts
true
```

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`yes`](BumpConfig.md#yes)
