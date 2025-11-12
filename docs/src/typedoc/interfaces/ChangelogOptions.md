[relizy](../globals.md) / ChangelogOptions

# Interface: ChangelogOptions

Defined in: [src/types.ts:190](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L190)

## Extends

- [`ChangelogConfig`](ChangelogConfig.md)

## Properties

### bumpedPackages?

> `optional` **bumpedPackages**: [`PackageInfo`](PackageInfo.md)[]

Defined in: [src/types.ts:207](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L207)

Bumped packages

***

### config?

> `optional` **config**: [`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

Defined in: [src/types.ts:211](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L211)

Use custom config

***

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:220](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L220)

Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)

#### Default

```ts
'relizy'
```

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:203](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L203)

Run without side effects

#### Default

```ts
false
```

***

### formatCmd?

> `optional` **formatCmd**: `string`

Defined in: [src/types.ts:178](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L178)

Command to format the changelog (e.g. `prettier --write CHANGELOG.md`).

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`formatCmd`](ChangelogConfig.md#formatcmd)

***

### from?

> `optional` **from**: `string`

Defined in: [src/types.ts:194](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L194)

Start tag

***

### includeCommitBody?

> `optional` **includeCommitBody**: `boolean`

Defined in: [src/types.ts:188](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L188)

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

Defined in: [src/types.ts:215](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L215)

Set log level

***

### rootChangelog?

> `optional` **rootChangelog**: `boolean`

Defined in: [src/types.ts:183](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L183)

Generate changelog at root level with all changes

#### Default

```ts
true
```

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`rootChangelog`](ChangelogConfig.md#rootchangelog)

***

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:198](https://github.com/LouisMazel/relizy/blob/9bfb2389d6fd5bfa94eb3574d1c2ca26c112b2e5/src/types.ts#L198)

End tag
