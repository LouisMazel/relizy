[relizy](../globals.md) / ReleaseOptions

# Interface: ReleaseOptions

Defined in: [src/types.ts:380](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L380)

## Extends

- [`ReleaseConfig`](ReleaseConfig.md).[`BumpConfig`](BumpConfig.md).[`ChangelogConfig`](ChangelogConfig.md).[`PublishConfig`](../type-aliases/PublishConfig.md)

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

### changelog?

> `optional` **changelog**: `boolean`

Defined in: [src/types.ts:357](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L357)

Generate changelog files (CHANGELOG.md)

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`changelog`](ReleaseConfig.md#changelog)

---

### clean?

> `optional` **clean**: `boolean`

Defined in: [src/types.ts:377](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L377)

Determine if the working directory is clean and if it is not clean, exit

#### Default

```ts
false
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`clean`](ReleaseConfig.md#clean)

---

### commit?

> `optional` **commit**: `boolean`

Defined in: [src/types.ts:347](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L347)

Commit changes and create tag

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`commit`](ReleaseConfig.md#commit)

---

### configName?

> `optional` **configName**: `string`

Defined in: [src/types.ts:405](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L405)

#### Default

```ts
'relizy'
```

---

### dependencyTypes?

> `optional` **dependencyTypes**: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"`)[]

Defined in: [src/types.ts:137](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L137)

Include dependencies when bumping.

#### Default

```ts
['dependencies']
```

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`dependencyTypes`](BumpConfig.md#dependencytypes)

---

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:385](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L385)

Run without side effects

#### Default

```ts
false
```

---

### force?

> `optional` **force**: `boolean`

Defined in: [src/types.ts:410](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L410)

Bump even if there are no commits

#### Default

```ts
false
```

---

### formatCmd?

> `optional` **formatCmd**: `string`

Defined in: [src/types.ts:183](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L183)

Command to format the changelog (e.g. `prettier --write CHANGELOG.md`).

#### Default

```ts
undefined
```

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`formatCmd`](ChangelogConfig.md#formatcmd)

---

### from?

> `optional` **from**: `string`

Defined in: [src/types.ts:389](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L389)

#### Default

```ts
undefined
```

---

### includeCommitBody?

> `optional` **includeCommitBody**: `boolean`

Defined in: [src/types.ts:193](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L193)

Include commit body in the changelog.

#### Default

```ts
true
```

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`includeCommitBody`](ChangelogConfig.md#includecommitbody)

---

### logLevel?

> `optional` **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/types.ts:401](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L401)

#### Default

```ts
undefined
```

---

### noVerify?

> `optional` **noVerify**: `boolean`

Defined in: [src/types.ts:372](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L372)

Skip git verification while committing by using --no-verify flag

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`noVerify`](ReleaseConfig.md#noverify)

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

### preid?

> `optional` **preid**: `string`

Defined in: [src/types.ts:127](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L127)

Prerelease identifier (e.g. 'beta', 'alpha')

#### Default

```ts
undefined
```

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`preid`](BumpConfig.md#preid)

---

### private?

> `optional` **private**: `boolean`

Defined in: node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/index.d.mts:39

#### Inherited from

`PublishConfig.private`

---

### providerRelease?

> `optional` **providerRelease**: `boolean`

Defined in: [src/types.ts:362](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L362)

Publish release to your repository (github or gitlab)

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`providerRelease`](ReleaseConfig.md#providerrelease)

---

### publish?

> `optional` **publish**: `boolean`

Defined in: [src/types.ts:367](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L367)

Publish release to your registry

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`publish`](ReleaseConfig.md#publish)

---

### push?

> `optional` **push**: `boolean`

Defined in: [src/types.ts:352](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L352)

Push changes to your repository (commit and tag(s))

#### Default

```ts
true
```

#### Inherited from

[`ReleaseConfig`](ReleaseConfig.md).[`push`](ReleaseConfig.md#push)

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

### rootChangelog?

> `optional` **rootChangelog**: `boolean`

Defined in: [src/types.ts:188](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L188)

Generate changelog at root level with all changes

#### Default

```ts
true
```

#### Inherited from

[`ChangelogConfig`](ChangelogConfig.md).[`rootChangelog`](ChangelogConfig.md#rootchangelog)

---

### suffix?

> `optional` **suffix**: `string`

Defined in: [src/types.ts:415](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L415)

Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)

#### Default

```ts
undefined
```

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

---

### to?

> `optional` **to**: `string`

Defined in: [src/types.ts:393](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L393)

#### Default

```ts
undefined
```

---

### token?

> `optional` **token**: `string`

Defined in: [src/types.ts:397](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L397)

#### Default

```ts
undefined
```

---

### type?

> `optional` **type**: `ReleaseType`

Defined in: [src/types.ts:122](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L122)

Release type (e.g. 'major', 'minor', 'patch', 'prerelease', 'prepatch', 'preminor', 'premajor')

#### Default

```ts
'release'
```

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`type`](BumpConfig.md#type)

---

### yes?

> `optional` **yes**: `boolean`

Defined in: [src/types.ts:142](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L142)

Skip confirmation prompt about bumping packages

#### Default

```ts
true
```

#### Inherited from

[`BumpConfig`](BumpConfig.md).[`yes`](BumpConfig.md#yes)
