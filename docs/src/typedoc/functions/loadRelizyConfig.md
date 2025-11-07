[relizy](../globals.md) / loadRelizyConfig

# Function: loadRelizyConfig()

> **loadRelizyConfig**(`options?`): `Promise`\<[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)\>

Defined in: [src/core/config.ts:106](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/core/config.ts#L106)

## Parameters

### options?

#### baseConfig?

[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

#### configName?

`string`

#### overrides?

\{ `bump?`: \{ `clean?`: `boolean`; `dependencyTypes?`: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"` \| `undefined`)[]; `preid?`: `string`; `type?`: `ReleaseType`; `yes?`: `boolean`; \}; `changelog?`: \{ `formatCmd?`: `string`; `includeCommitBody?`: `boolean`; `rootChangelog?`: `boolean`; \}; `cwd?`: `string`; `excludeAuthors?`: (`string` \| `undefined`)[]; `from?`: `string`; `hideAuthorEmail?`: `boolean`; `logLevel?`: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`; `monorepo?`: \{ `ignorePackageNames?`: (`string` \| `undefined`)[]; `packages?`: (`string` \| `undefined`)[]; `versionMode?`: [`VersionMode`](../type-aliases/VersionMode.md); \}; `newVersion?`: `string`; `noAuthors?`: `boolean`; `publish?`: \{ `access?`: `"public"` \| `"restricted"`; `args?`: (`string` \| `undefined`)[]; `buildCmd?`: `string`; `otp?`: `string`; `packages?`: (`string` \| `undefined`)[]; `private?`: `boolean`; `registry?`: `string`; `tag?`: `string`; \}; `release?`: \{ `changelog?`: `boolean`; `clean?`: `boolean`; `commit?`: `boolean`; `noVerify?`: `boolean`; `providerRelease?`: `boolean`; `publish?`: `boolean`; `push?`: `boolean`; \}; `repo?`: \{ `domain?`: `string`; `provider?`: [`GitProvider`](../type-aliases/GitProvider.md); `repo?`: `string`; `token?`: `string`; \}; `scopeMap?`: \{\[`key`: `string`\]: `string` \| `undefined`; \}; `signTags?`: `boolean`; `templates?`: \{ `commitMessage?`: `string`; `emptyChangelogContent?`: `string`; `tagBody?`: `string`; `tagMessage?`: `string`; \}; `to?`: `string`; `tokens?`: \{ `bitbucket?`: `string`; `github?`: `string`; `gitlab?`: `string`; \}; `types?`: \{\[`key`: `string`\]: `boolean` \| \{ `semver?`: `SemverBumpType`; `title?`: `string`; \} \| `undefined`; \}; \}

#### overrides.bump?

\{ `clean?`: `boolean`; `dependencyTypes?`: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"` \| `undefined`)[]; `preid?`: `string`; `type?`: `ReleaseType`; `yes?`: `boolean`; \}

**Default**

```ts
undefined
```

#### overrides.bump.clean?

`boolean`

Check if there are any changes to commit before bumping.

**Default**

```ts
true
```

#### overrides.bump.dependencyTypes?

(`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"` \| `undefined`)[]

Include dependencies when bumping.

**Default**

```ts
['dependencies']
```

#### overrides.bump.preid?

`string`

Prerelease identifier (e.g. 'beta', 'alpha')

**Default**

```ts
undefined
```

#### overrides.bump.type?

`ReleaseType`

Release type (e.g. 'major', 'minor', 'patch', 'prerelease', 'prepatch', 'preminor', 'premajor')

**Default**

```ts
'release'
```

#### overrides.bump.yes?

`boolean`

Skip confirmation prompt about bumping packages

**Default**

```ts
true
```

#### overrides.changelog?

\{ `formatCmd?`: `string`; `includeCommitBody?`: `boolean`; `rootChangelog?`: `boolean`; \}

**Default**

```ts
undefined
```

#### overrides.changelog.formatCmd?

`string`

Command to format the changelog (e.g. `prettier --write CHANGELOG.md`).

**Default**

```ts
undefined
```

#### overrides.changelog.includeCommitBody?

`boolean`

Include commit body in the changelog.

**Default**

```ts
true
```

#### overrides.changelog.rootChangelog?

`boolean`

Generate changelog at root level with all changes

**Default**

```ts
true
```

#### overrides.cwd?

`string`

Current working directory

**Default**

```ts
process.cwd()
```

#### overrides.excludeAuthors?

(`string` \| `undefined`)[]

#### overrides.from?

`string`

Start tag

**Default**

```ts
undefined
```

#### overrides.hideAuthorEmail?

`boolean`

#### overrides.logLevel?

`"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

**Default**

```ts
undefined
```

#### overrides.monorepo?

\{ `ignorePackageNames?`: (`string` \| `undefined`)[]; `packages?`: (`string` \| `undefined`)[]; `versionMode?`: [`VersionMode`](../type-aliases/VersionMode.md); \}

**Default**

```ts
undefined
```

#### overrides.monorepo.ignorePackageNames?

(`string` \| `undefined`)[]

Package names to ignore.

**Default**

```ts
[]
```

#### overrides.monorepo.packages?

(`string` \| `undefined`)[]

Glob pattern matching for packages to bump.

#### overrides.monorepo.versionMode?

[`VersionMode`](../type-aliases/VersionMode.md)

Version mode for the monorepo.

#### overrides.newVersion?

`string`

#### overrides.noAuthors?

`boolean`

#### overrides.publish?

\{ `access?`: `"public"` \| `"restricted"`; `args?`: (`string` \| `undefined`)[]; `buildCmd?`: `string`; `otp?`: `string`; `packages?`: (`string` \| `undefined`)[]; `private?`: `boolean`; `registry?`: `string`; `tag?`: `string`; \}

**Default**

```ts
undefined
```

#### overrides.publish.access?

`"public"` \| `"restricted"`

NPM access level (e.g. `public` or `restricted`)

**Default**

```ts
undefined
```

#### overrides.publish.args?

(`string` \| `undefined`)[]

#### overrides.publish.buildCmd?

`string`

Command to build your packages before publishing (e.g. `pnpm build`)

**Default**

```ts
undefined
```

#### overrides.publish.otp?

`string`

NPM OTP (e.g. `123456`)

**Default**

```ts
undefined
```

#### overrides.publish.packages?

(`string` \| `undefined`)[]

Glob pattern matching for packages to publish

**Default**

```ts
undefined
```

#### overrides.publish.private?

`boolean`

#### overrides.publish.registry?

`string`

NPM registry URL (e.g. `https://registry.npmjs.org/`)

**Default**

```ts
undefined
```

#### overrides.publish.tag?

`string`

NPM tag (e.g. `latest`)

**Default**

```ts
undefined
```

#### overrides.release?

\{ `changelog?`: `boolean`; `clean?`: `boolean`; `commit?`: `boolean`; `noVerify?`: `boolean`; `providerRelease?`: `boolean`; `publish?`: `boolean`; `push?`: `boolean`; \}

**Default**

```ts
undefined
```

#### overrides.release.changelog?

`boolean`

Generate changelog files (CHANGELOG.md)

**Default**

```ts
true
```

#### overrides.release.clean?

`boolean`

Determine if the working directory is clean and if it is not clean, exit

**Default**

```ts
false
```

#### overrides.release.commit?

`boolean`

Commit changes and create tag

**Default**

```ts
true
```

#### overrides.release.noVerify?

`boolean`

Skip git verification while committing by using --no-verify flag

**Default**

```ts
true
```

#### overrides.release.providerRelease?

`boolean`

Publish release to your repository (github or gitlab)

**Default**

```ts
true
```

#### overrides.release.publish?

`boolean`

Publish release to your registry

**Default**

```ts
true
```

#### overrides.release.push?

`boolean`

Push changes to your repository (commit and tag(s))

**Default**

```ts
true
```

#### overrides.repo?

\{ `domain?`: `string`; `provider?`: [`GitProvider`](../type-aliases/GitProvider.md); `repo?`: `string`; `token?`: `string`; \}

**Default**

```ts
undefined
```

#### overrides.repo.domain?

`string`

Git domain (e.g. `github.com`)

**Default**

```ts
undefined
```

#### overrides.repo.provider?

[`GitProvider`](../type-aliases/GitProvider.md)

Git provider (e.g. `github` or `gitlab`)

**Default**

```ts
'github'
```

#### overrides.repo.repo?

`string`

Git repository (e.g. `user/repo`)

**Default**

```ts
undefined
```

#### overrides.repo.token?

`string`

Git token

**Default**

```ts
undefined
```

#### overrides.scopeMap?

\{\[`key`: `string`\]: `string` \| `undefined`; \}

#### overrides.signTags?

`boolean`

#### overrides.templates?

\{ `commitMessage?`: `string`; `emptyChangelogContent?`: `string`; `tagBody?`: `string`; `tagMessage?`: `string`; \}

**Default**

```ts
undefined
```

#### overrides.templates.commitMessage?

`string`

Commit message template

#### overrides.templates.emptyChangelogContent?

`string`

Empty changelog content

#### overrides.templates.tagBody?

`string`

Not used with "independent" version mode

#### overrides.templates.tagMessage?

`string`

Tag message template

#### overrides.to?

`string`

End tag

**Default**

```ts
undefined
```

#### overrides.tokens?

\{ `bitbucket?`: `string`; `github?`: `string`; `gitlab?`: `string`; \}

#### overrides.tokens.bitbucket?

`string`

#### overrides.tokens.github?

`string`

#### overrides.tokens.gitlab?

`string`

#### overrides.types?

\{\[`key`: `string`\]: `boolean` \| \{ `semver?`: `SemverBumpType`; `title?`: `string`; \} \| `undefined`; \}

## Returns

`Promise`\<[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)\>
