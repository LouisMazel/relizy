[relizy](../globals.md) / loadRelizyConfig

# Function: loadRelizyConfig()

> **loadRelizyConfig**(`options?`): `Promise`\<[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)\>

Defined in: [src/core/config.ts:107](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/config.ts#L107)

## Parameters

### options?

#### baseConfig?

[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

#### configName?

`string`

#### overrides?

\{ `bump?`: \{ `clean?`: `boolean`; `dependencyTypes?`: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"` \| `undefined`)[]; `preid?`: `string`; `type?`: `ReleaseType`; `yes?`: `boolean`; \}; `changelog?`: \{ `formatCmd?`: `string`; `includeCommitBody?`: `boolean`; `rootChangelog?`: `boolean`; \}; `cwd?`: `string`; `excludeAuthors?`: (`string` \| `undefined`)[]; `from?`: `string`; `hideAuthorEmail?`: `boolean`; `hooks?`: \{ `after:bump?`: `string` \| \{ \}; `after:changelog?`: `string` \| \{ \}; `after:commit-and-tag?`: `string` \| \{ \}; `after:provider-release?`: `string` \| \{ \}; `after:publish?`: `string` \| \{ \}; `after:push?`: `string` \| \{ \}; `after:release?`: `string` \| \{ \}; `before:bump?`: `string` \| \{ \}; `before:changelog?`: `string` \| \{ \}; `before:commit-and-tag?`: `string` \| \{ \}; `before:provider-release?`: `string` \| \{ \}; `before:publish?`: `string` \| \{ \}; `before:push?`: `string` \| \{ \}; `before:release?`: `string` \| \{ \}; `error:bump?`: `string` \| \{ \}; `error:changelog?`: `string` \| \{ \}; `error:commit-and-tag?`: `string` \| \{ \}; `error:provider-release?`: `string` \| \{ \}; `error:publish?`: `string` \| \{ \}; `error:push?`: `string` \| \{ \}; `error:release?`: `string` \| \{ \}; `generate:changelog?`: \{ \}; \}; `logLevel?`: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`; `monorepo?`: \{ `ignorePackageNames?`: (`string` \| `undefined`)[]; `packages?`: (`string` \| `undefined`)[]; `versionMode?`: [`VersionMode`](../type-aliases/VersionMode.md); \}; `newVersion?`: `string`; `noAuthors?`: `boolean`; `publish?`: \{ `access?`: `"public"` \| `"restricted"`; `args?`: (`string` \| `undefined`)[]; `buildCmd?`: `string`; `otp?`: `string`; `packages?`: (`string` \| `undefined`)[]; `private?`: `boolean`; `registry?`: `string`; `tag?`: `string`; \}; `release?`: \{ `changelog?`: `boolean`; `clean?`: `boolean`; `commit?`: `boolean`; `noVerify?`: `boolean`; `providerRelease?`: `boolean`; `publish?`: `boolean`; `push?`: `boolean`; \}; `repo?`: \{ `domain?`: `string`; `provider?`: [`GitProvider`](../type-aliases/GitProvider.md); `repo?`: `string`; `token?`: `string`; \}; `safetyCheck?`: `boolean`; `scopeMap?`: \{\[`key`: `string`\]: `string` \| `undefined`; \}; `signTags?`: `boolean`; `templates?`: \{ `commitMessage?`: `string`; `emptyChangelogContent?`: `string`; `tagBody?`: `string`; `tagMessage?`: `string`; \}; `to?`: `string`; `tokens?`: \{ `bitbucket?`: `string`; `github?`: `string`; `gitlab?`: `string`; \}; `types?`: \{\[`key`: `string`\]: `boolean` \| \{ `semver?`: `SemverBumpType`; `title?`: `string`; \} \| `undefined`; \}; \}

#### overrides.bump?

\{ `clean?`: `boolean`; `dependencyTypes?`: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"` \| `undefined`)[]; `preid?`: `string`; `type?`: `ReleaseType`; `yes?`: `boolean`; \}

Bump config

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

Changelog config

#### overrides.changelog.formatCmd?

`string`

Command to format the changelog (e.g. `prettier --write CHANGELOG.md`).

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

#### overrides.hideAuthorEmail?

`boolean`

#### overrides.hooks?

\{ `after:bump?`: `string` \| \{ \}; `after:changelog?`: `string` \| \{ \}; `after:commit-and-tag?`: `string` \| \{ \}; `after:provider-release?`: `string` \| \{ \}; `after:publish?`: `string` \| \{ \}; `after:push?`: `string` \| \{ \}; `after:release?`: `string` \| \{ \}; `before:bump?`: `string` \| \{ \}; `before:changelog?`: `string` \| \{ \}; `before:commit-and-tag?`: `string` \| \{ \}; `before:provider-release?`: `string` \| \{ \}; `before:publish?`: `string` \| \{ \}; `before:push?`: `string` \| \{ \}; `before:release?`: `string` \| \{ \}; `error:bump?`: `string` \| \{ \}; `error:changelog?`: `string` \| \{ \}; `error:commit-and-tag?`: `string` \| \{ \}; `error:provider-release?`: `string` \| \{ \}; `error:publish?`: `string` \| \{ \}; `error:push?`: `string` \| \{ \}; `error:release?`: `string` \| \{ \}; `generate:changelog?`: \{ \}; \}

Hooks config

#### overrides.hooks.after:bump?

`string` \| \{ \}

#### overrides.hooks.after:changelog?

`string` \| \{ \}

#### overrides.hooks.after:commit-and-tag?

`string` \| \{ \}

#### overrides.hooks.after:provider-release?

`string` \| \{ \}

#### overrides.hooks.after:publish?

`string` \| \{ \}

#### overrides.hooks.after:push?

`string` \| \{ \}

#### overrides.hooks.after:release?

`string` \| \{ \}

#### overrides.hooks.before:bump?

`string` \| \{ \}

#### overrides.hooks.before:changelog?

`string` \| \{ \}

#### overrides.hooks.before:commit-and-tag?

`string` \| \{ \}

#### overrides.hooks.before:provider-release?

`string` \| \{ \}

#### overrides.hooks.before:publish?

`string` \| \{ \}

#### overrides.hooks.before:push?

`string` \| \{ \}

#### overrides.hooks.before:release?

`string` \| \{ \}

#### overrides.hooks.error:bump?

`string` \| \{ \}

#### overrides.hooks.error:changelog?

`string` \| \{ \}

#### overrides.hooks.error:commit-and-tag?

`string` \| \{ \}

#### overrides.hooks.error:provider-release?

`string` \| \{ \}

#### overrides.hooks.error:publish?

`string` \| \{ \}

#### overrides.hooks.error:push?

`string` \| \{ \}

#### overrides.hooks.error:release?

`string` \| \{ \}

#### overrides.hooks.generate:changelog?

\{ \}

#### overrides.logLevel?

`"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Set log level

**Default**

```ts
'default'
```

#### overrides.monorepo?

\{ `ignorePackageNames?`: (`string` \| `undefined`)[]; `packages?`: (`string` \| `undefined`)[]; `versionMode?`: [`VersionMode`](../type-aliases/VersionMode.md); \}

Monorepo config

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

Publish config

#### overrides.publish.access?

`"public"` \| `"restricted"`

NPM access level (e.g. `public` or `restricted`)

#### overrides.publish.args?

(`string` \| `undefined`)[]

#### overrides.publish.buildCmd?

`string`

Command to build your packages before publishing (e.g. `pnpm build`)

#### overrides.publish.otp?

`string`

NPM OTP (e.g. `123456`)

#### overrides.publish.packages?

(`string` \| `undefined`)[]

Glob pattern matching for packages to publish

#### overrides.publish.private?

`boolean`

#### overrides.publish.registry?

`string`

NPM registry URL (e.g. `https://registry.npmjs.org/`)

#### overrides.publish.tag?

`string`

NPM tag (e.g. `latest`)

#### overrides.release?

\{ `changelog?`: `boolean`; `clean?`: `boolean`; `commit?`: `boolean`; `noVerify?`: `boolean`; `providerRelease?`: `boolean`; `publish?`: `boolean`; `push?`: `boolean`; \}

Release config

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

Repo config

#### overrides.repo.domain?

`string`

Git domain (e.g. `github.com`)

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

#### overrides.repo.token?

`string`

Git token

#### overrides.safetyCheck?

`boolean`

The safety check will verify if tokens or others required for release are set (depends on the release options)

**Default**

```ts
true
```

#### overrides.scopeMap?

\{\[`key`: `string`\]: `string` \| `undefined`; \}

#### overrides.signTags?

`boolean`

#### overrides.templates?

\{ `commitMessage?`: `string`; `emptyChangelogContent?`: `string`; `tagBody?`: `string`; `tagMessage?`: `string`; \}

Templates config

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
