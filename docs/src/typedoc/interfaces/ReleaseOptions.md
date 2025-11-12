[relizy](../globals.md) / ReleaseOptions

# Interface: ReleaseOptions

Defined in: [src/types.ts:360](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L360)

## Extends

- [`ReleaseConfig`](ReleaseConfig.md).[`BumpConfig`](BumpConfig.md).[`ChangelogConfig`](ChangelogConfig.md).[`PublishConfig`](../type-aliases/PublishConfig.md)

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

### changelog?

> `optional` **changelog**: `boolean`

Defined in: [src/types.ts:337](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L337)

Generate changelog files (CHANGELOG.md)

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`changelog`](ReleaseConfig.md#changelog)

***

### clean?

> `optional` **clean**: `boolean`

Defined in: [src/types.ts:357](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L357)

Determine if the working directory is clean and if it is not clean, exit

#### Default

```ts
false
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`clean`](ReleaseConfig.md#clean)

***

### commit?

> `optional` **commit**: `boolean`

Defined in: [src/types.ts:327](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L327)

Commit changes and create tag

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`commit`](ReleaseConfig.md#commit)

***

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:381](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L381)

#### Default

```ts
'relizy'
```

***

### dependencyTypes?

> `optional` **dependencyTypes**: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[]

Defined in: [src/types.ts:136](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L136)

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

Defined in: [src/types.ts:365](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L365)

Run without side effects

#### Default

```ts
false
```

***

### force?

> `optional` **force**: `boolean`

Defined in: [src/types.ts:386](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L386)

Bump even if there are no commits

#### Default

```ts
false
```

***

### formatCmd?

> `optional` **formatCmd**: `string`

Defined in: [src/types.ts:178](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L178)

Command to format the changelog (e.g. `prettier --write CHANGELOG.md`).

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`formatCmd`](ChangelogConfig.md#formatcmd)

***

### from?

> `optional` **from**: `string`

Defined in: [src/types.ts:368](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L368)

***

### includeCommitBody?

> `optional` **includeCommitBody**: `boolean`

Defined in: [src/types.ts:188](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L188)

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

Defined in: [src/types.ts:377](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L377)

***

### noVerify?

> `optional` **noVerify**: `boolean`

Defined in: [src/types.ts:352](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L352)

Skip git verification while committing by using --no-verify flag

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`noVerify`](ReleaseConfig.md#noverify)

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

### preid?

> `optional` **preid**: `string`

Defined in: [src/types.ts:126](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L126)

Prerelease identifier (e.g. 'beta', 'alpha')

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`preid`](BumpConfig.md#preid)

***

### private?

> `optional` **private**: `boolean`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:39

#### Inherited from

`PublishConfig.private`

***

### provider?

> `optional` **provider**: [`GitProvider`](../type-aliases/GitProvider.md)

Defined in: [src/types.ts:395](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L395)

Git provider (e.g. `github` or `gitlab`)

#### Default

```ts
'github'
```

***

### providerRelease?

> `optional` **providerRelease**: `boolean`

Defined in: [src/types.ts:342](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L342)

Publish release to your repository (github or gitlab)

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`providerRelease`](ReleaseConfig.md#providerrelease)

***

### publish?

> `optional` **publish**: `boolean`

Defined in: [src/types.ts:347](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L347)

Publish release to your registry

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`publish`](ReleaseConfig.md#publish)

***

### push?

> `optional` **push**: `boolean`

Defined in: [src/types.ts:332](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L332)

Push changes to your repository (commit and tag(s))

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`push`](ReleaseConfig.md#push)

***

### registry?

> `optional` **registry**: `string`

Defined in: [src/types.ts:274](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L274)

NPM registry URL (e.g. `https://registry.npmjs.org/`)

#### Inherited from

`PublishConfig.registry`

***

### rootChangelog?

> `optional` **rootChangelog**: `boolean`

Defined in: [src/types.ts:183](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L183)

Generate changelog at root level with all changes

#### Default

```ts
true
```

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`rootChangelog`](ChangelogConfig.md#rootchangelog)

***

### safetyCheck?

> `optional` **safetyCheck**: `boolean`

Defined in: [src/types.ts:400](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L400)

Skip safety check

#### Default

```ts
true
```

***

### suffix?

> `optional` **suffix**: `string`

Defined in: [src/types.ts:390](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L390)

Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)

***

### tag?

> `optional` **tag**: `string`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.3.5/node\_modules/changelogen/dist/index.d.mts:38

NPM tag (e.g. `latest`)

#### Inherited from

`PublishConfig.tag`

***

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:371](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L371)

***

### token?

> `optional` **token**: `string`

Defined in: [src/types.ts:374](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L374)

***

### type?

> `optional` **type**: `ReleaseType`

Defined in: [src/types.ts:122](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L122)

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

Defined in: [src/types.ts:141](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L141)

Skip confirmation prompt about bumping packages

#### Default

```ts
true
```

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`yes`](BumpConfig.md#yes)
