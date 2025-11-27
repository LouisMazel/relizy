[relizy](../globals.md) / ReleaseOptions

# Interface: ReleaseOptions

Defined in: [src/types.ts:484](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L484)

## Extends

- [`ReleaseConfig`](ReleaseConfig.md).[`BumpConfig`](BumpConfig.md).[`ChangelogConfig`](ChangelogConfig.md).[`PublishConfig`](../type-aliases/PublishConfig.md)

## Properties

### access?

> `optional` **access**: `"public"` \| `"restricted"`

Defined in: [src/types.ts:378](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L378)

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

Defined in: [src/types.ts:390](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L390)

Command to build your packages before publishing (e.g. `pnpm build`)

#### Inherited from

`PublishConfig.buildCmd`

***

### changelog?

> `optional` **changelog**: `boolean`

Defined in: [src/types.ts:451](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L451)

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

Defined in: [src/types.ts:471](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L471)

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

Defined in: [src/types.ts:441](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L441)

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

Defined in: [src/types.ts:505](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L505)

#### Default

```ts
'relizy'
```

***

### dependencyTypes?

> `optional` **dependencyTypes**: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[]

Defined in: [src/types.ts:168](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L168)

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

Defined in: [src/types.ts:489](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L489)

Run without side effects

#### Default

```ts
false
```

***

### force?

> `optional` **force**: `boolean`

Defined in: [src/types.ts:510](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L510)

Bump even if there are no commits

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

Defined in: [src/types.ts:492](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L492)

***

### gitTag?

> `optional` **gitTag**: `boolean`

Defined in: [src/types.ts:476](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L476)

Create tag

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`gitTag`](ReleaseConfig.md#gittag)

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

Defined in: [src/types.ts:501](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L501)

***

### noVerify?

> `optional` **noVerify**: `boolean`

Defined in: [src/types.ts:466](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L466)

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

Defined in: [src/types.ts:382](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L382)

NPM OTP (e.g. `123456`)

#### Inherited from

`PublishConfig.otp`

***

### packageManager?

> `optional` **packageManager**: [`PackageManager`](../type-aliases/PackageManager.md)

Defined in: [src/types.ts:366](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L366)

Package manager (e.g. `pnpm`, `npm`, `yarn` or `bun`)

#### Inherited from

`PublishConfig.packageManager`

***

### packages?

> `optional` **packages**: `string`[]

Defined in: [src/types.ts:386](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L386)

Glob pattern matching for packages to publish

#### Inherited from

`PublishConfig.packages`

***

### preid?

> `optional` **preid**: `string`

Defined in: [src/types.ts:158](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L158)

Prerelease identifier (e.g. 'beta', 'alpha')

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`preid`](BumpConfig.md#preid)

***

### private?

> `optional` **private**: `boolean`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.5.1/node\_modules/changelogen/dist/index.d.mts:39

#### Inherited from

`PublishConfig.private`

***

### provider?

> `optional` **provider**: [`GitProvider`](../type-aliases/GitProvider.md)

Defined in: [src/types.ts:519](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L519)

Git provider (e.g. `github` or `gitlab`)

#### Default

```ts
'github'
```

***

### providerRelease?

> `optional` **providerRelease**: `boolean`

Defined in: [src/types.ts:456](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L456)

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

Defined in: [src/types.ts:461](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L461)

Publish release to your registry

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`publish`](ReleaseConfig.md#publish)

***

### publishToken?

> `optional` **publishToken**: `string`

Defined in: [src/types.ts:528](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L528)

NPM token (e.g. "123456")

***

### push?

> `optional` **push**: `boolean`

Defined in: [src/types.ts:446](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L446)

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

Defined in: [src/types.ts:370](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L370)

NPM registry URL (e.g. `https://registry.npmjs.org/`)

#### Inherited from

`PublishConfig.registry`

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

### safetyCheck?

> `optional` **safetyCheck**: `boolean`

Defined in: [src/types.ts:524](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L524)

Skip safety check

#### Default

```ts
true
```

#### Overrides

`PublishConfig.safetyCheck`

***

### social?

> `optional` **social**: `boolean`

Defined in: [src/types.ts:481](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L481)

Post release announcements to social media platforms

#### Default

```ts
false
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`social`](ReleaseConfig.md#social)

***

### suffix?

> `optional` **suffix**: `string`

Defined in: [src/types.ts:514](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L514)

Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)

***

### tag?

> `optional` **tag**: `string`

Defined in: node\_modules/.pnpm/changelogen@0.6.2\_magicast@0.5.1/node\_modules/changelogen/dist/index.d.mts:38

NPM tag (e.g. `latest`)

#### Inherited from

`PublishConfig.tag`

***

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:495](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L495)

***

### token?

> `optional` **token**: `string`

Defined in: [src/types.ts:498](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L498)

#### Overrides

`PublishConfig.token`

***

### type?

> `optional` **type**: `ReleaseType`

Defined in: [src/types.ts:154](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L154)

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

Defined in: [src/types.ts:173](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L173)

Skip confirmation prompt about bumping packages

#### Default

```ts
true
```

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`yes`](BumpConfig.md#yes)
