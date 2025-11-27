[relizy](../globals.md) / ChangelogOptions

# Interface: ChangelogOptions

Defined in: [src/types.ts:222](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L222)

## Extends

- [`ChangelogConfig`](ChangelogConfig.md)

## Properties

### bumpResult?

> `optional` **bumpResult**: [`BumpResultTruthy`](BumpResultTruthy.md)

Defined in: [src/types.ts:239](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L239)

Bump result

***

### config?

> `optional` **config**: [`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

Defined in: [src/types.ts:243](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L243)

Use custom config

***

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:252](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L252)

Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)

#### Default

```ts
'relizy'
```

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:235](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L235)

Run without side effects

#### Default

```ts
false
```

***

### force

> **force**: `boolean`

Defined in: [src/types.ts:257](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L257)

Generate changelog for all packages even if there are no commits

#### Default

```ts
false
```

***

### formatCmd?

> `optional` **formatCmd**: `string`

Defined in: [src/types.ts:210](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L210)

Command to format the changelog (e.g. `prettier --write CHANGELOG.md`).

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`formatCmd`](ChangelogConfig.md#formatcmd)

***

### from?

> `optional` **from**: `string`

Defined in: [src/types.ts:226](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L226)

Start tag

***

### includeCommitBody?

> `optional` **includeCommitBody**: `boolean`

Defined in: [src/types.ts:220](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L220)

Include commit body in the changelog.

#### Default

```ts
true
```

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`includeCommitBody`](ChangelogConfig.md#includecommitbody)

***

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:247](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L247)

Set log level

***

### rootChangelog?

> `optional` **rootChangelog**: `boolean`

Defined in: [src/types.ts:215](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L215)

Generate changelog at root level with all changes

#### Default

```ts
true
```

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`rootChangelog`](ChangelogConfig.md#rootchangelog)

***

### suffix?

> `optional` **suffix**: `string`

Defined in: [src/types.ts:261](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L261)

Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)

***

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:230](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L230)

End tag
