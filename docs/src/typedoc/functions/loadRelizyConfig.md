[relizy](../globals.md) / loadRelizyConfig

# Function: loadRelizyConfig()

> **loadRelizyConfig**(`options?`): `Promise`\<[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)\>

Defined in: [src/core/config.ts:140](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/core/config.ts#L140)

## Parameters

### options?

#### baseConfig?

[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

#### configFile?

`string`

#### overrides?

\{ `bump?`: \{ `clean?`: `boolean`; `dependencyTypes?`: (`"dependencies"` \| `"peerDependencies"` \| `"devDependencies"` \| `undefined`)[]; `preid?`: `string`; `type?`: `ReleaseType`; `yes?`: `boolean`; \}; `changelog?`: \{ `formatCmd?`: `string`; `includeCommitBody?`: `boolean`; `rootChangelog?`: `boolean`; \}; `cwd?`: `string`; `excludeAuthors?`: (`string` \| `undefined`)[]; `from?`: `string`; `hideAuthorEmail?`: `boolean`; `hooks?`: \{ `before:bump?`: `string` \| \{ \}; `before:changelog?`: `string` \| \{ \}; `before:commit-and-tag?`: `string` \| \{ \}; `before:provider-release?`: `string` \| \{ \}; `before:publish?`: `string` \| \{ \}; `before:push?`: `string` \| \{ \}; `before:release?`: `string` \| \{ \}; `before:slack?`: `string` \| \{ \}; `before:social?`: `string` \| \{ \}; `before:twitter?`: `string` \| \{ \}; `error:bump?`: `string` \| \{ \}; `error:changelog?`: `string` \| \{ \}; `error:commit-and-tag?`: `string` \| \{ \}; `error:provider-release?`: `string` \| \{ \}; `error:publish?`: `string` \| \{ \}; `error:push?`: `string` \| \{ \}; `error:release?`: `string` \| \{ \}; `error:slack?`: `string` \| \{ \}; `error:social?`: `string` \| \{ \}; `error:twitter?`: `string` \| \{ \}; `generate:changelog?`: \{ \}; `success:bump?`: `string` \| \{ \}; `success:changelog?`: `string` \| \{ \}; `success:commit-and-tag?`: `string` \| \{ \}; `success:provider-release?`: `string` \| \{ \}; `success:publish?`: `string` \| \{ \}; `success:push?`: `string` \| \{ \}; `success:release?`: `string` \| \{ \}; `success:slack?`: `string` \| \{ \}; `success:social?`: `string` \| \{ \}; `success:twitter?`: `string` \| \{ \}; \}; `logLevel?`: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`; `monorepo?`: \{ `ignorePackageNames?`: (`string` \| `undefined`)[]; `packages?`: (`string` \| `undefined`)[]; `versionMode?`: [`VersionMode`](../type-aliases/VersionMode.md); \}; `newVersion?`: `string`; `noAuthors?`: `boolean`; `publish?`: \{ `access?`: `"public"` \| `"restricted"`; `args?`: (`string` \| `undefined`)[]; `buildCmd?`: `string`; `otp?`: `string`; `packageManager?`: [`PackageManager`](../type-aliases/PackageManager.md); `packages?`: (`string` \| `undefined`)[]; `private?`: `boolean`; `registry?`: `string`; `safetyCheck?`: `boolean`; `tag?`: `string`; `token?`: `string`; \}; `release?`: \{ `changelog?`: `boolean`; `clean?`: `boolean`; `commit?`: `boolean`; `gitTag?`: `boolean`; `noVerify?`: `boolean`; `providerRelease?`: `boolean`; `publish?`: `boolean`; `push?`: `boolean`; `social?`: `boolean`; \}; `repo?`: \{ `domain?`: `string`; `provider?`: [`GitProvider`](../type-aliases/GitProvider.md); `repo?`: `string`; `token?`: `string`; \}; `safetyCheck?`: `boolean`; `scopeMap?`: \{\[`key`: `string`\]: `string` \| `undefined`; \}; `signTags?`: `boolean`; `social?`: \{ `changelogUrl?`: `string`; `slack?`: \{ `channel?`: `string`; `credentials?`: \{ `token?`: ... \| ...; \}; `enabled?`: `boolean`; `messageTemplate?`: `string`; `onlyStable?`: `boolean`; \}; `twitter?`: \{ `credentials?`: \{ `accessToken?`: ... \| ...; `accessTokenSecret?`: ... \| ...; `apiKey?`: ... \| ...; `apiSecret?`: ... \| ...; \}; `enabled?`: `boolean`; `messageTemplate?`: `string`; `onlyStable?`: `boolean`; \}; \}; `templates?`: \{ `commitMessage?`: `string`; `emptyChangelogContent?`: `string`; `slackMessage?`: `string`; `tagBody?`: `string`; `tagMessage?`: `string`; `twitterMessage?`: `string`; \}; `to?`: `string`; `tokens?`: \{ `github?`: `string`; `gitlab?`: `string`; `slack?`: `string`; `twitter?`: \{ `accessToken?`: `string`; `accessTokenSecret?`: `string`; `apiKey?`: `string`; `apiSecret?`: `string`; \}; \}; `types?`: \{\[`key`: `string`\]: `false` \| \{ `semver?`: `SemverBumpType`; `title?`: `string`; \} \| `undefined`; \}; \}

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

\{ `before:bump?`: `string` \| \{ \}; `before:changelog?`: `string` \| \{ \}; `before:commit-and-tag?`: `string` \| \{ \}; `before:provider-release?`: `string` \| \{ \}; `before:publish?`: `string` \| \{ \}; `before:push?`: `string` \| \{ \}; `before:release?`: `string` \| \{ \}; `before:slack?`: `string` \| \{ \}; `before:social?`: `string` \| \{ \}; `before:twitter?`: `string` \| \{ \}; `error:bump?`: `string` \| \{ \}; `error:changelog?`: `string` \| \{ \}; `error:commit-and-tag?`: `string` \| \{ \}; `error:provider-release?`: `string` \| \{ \}; `error:publish?`: `string` \| \{ \}; `error:push?`: `string` \| \{ \}; `error:release?`: `string` \| \{ \}; `error:slack?`: `string` \| \{ \}; `error:social?`: `string` \| \{ \}; `error:twitter?`: `string` \| \{ \}; `generate:changelog?`: \{ \}; `success:bump?`: `string` \| \{ \}; `success:changelog?`: `string` \| \{ \}; `success:commit-and-tag?`: `string` \| \{ \}; `success:provider-release?`: `string` \| \{ \}; `success:publish?`: `string` \| \{ \}; `success:push?`: `string` \| \{ \}; `success:release?`: `string` \| \{ \}; `success:slack?`: `string` \| \{ \}; `success:social?`: `string` \| \{ \}; `success:twitter?`: `string` \| \{ \}; \}

Hooks config

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

#### overrides.hooks.before:slack?

`string` \| \{ \}

#### overrides.hooks.before:social?

`string` \| \{ \}

#### overrides.hooks.before:twitter?

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

#### overrides.hooks.error:slack?

`string` \| \{ \}

#### overrides.hooks.error:social?

`string` \| \{ \}

#### overrides.hooks.error:twitter?

`string` \| \{ \}

#### overrides.hooks.generate:changelog?

\{ \}

#### overrides.hooks.success:bump?

`string` \| \{ \}

#### overrides.hooks.success:changelog?

`string` \| \{ \}

#### overrides.hooks.success:commit-and-tag?

`string` \| \{ \}

#### overrides.hooks.success:provider-release?

`string` \| \{ \}

#### overrides.hooks.success:publish?

`string` \| \{ \}

#### overrides.hooks.success:push?

`string` \| \{ \}

#### overrides.hooks.success:release?

`string` \| \{ \}

#### overrides.hooks.success:slack?

`string` \| \{ \}

#### overrides.hooks.success:social?

`string` \| \{ \}

#### overrides.hooks.success:twitter?

`string` \| \{ \}

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

\{ `access?`: `"public"` \| `"restricted"`; `args?`: (`string` \| `undefined`)[]; `buildCmd?`: `string`; `otp?`: `string`; `packageManager?`: [`PackageManager`](../type-aliases/PackageManager.md); `packages?`: (`string` \| `undefined`)[]; `private?`: `boolean`; `registry?`: `string`; `safetyCheck?`: `boolean`; `tag?`: `string`; `token?`: `string`; \}

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

#### overrides.publish.packageManager?

[`PackageManager`](../type-aliases/PackageManager.md)

Package manager (e.g. `pnpm`, `npm`, `yarn` or `bun`)

#### overrides.publish.packages?

(`string` \| `undefined`)[]

Glob pattern matching for packages to publish

#### overrides.publish.private?

`boolean`

#### overrides.publish.registry?

`string`

NPM registry URL (e.g. `https://registry.npmjs.org/`)

#### overrides.publish.safetyCheck?

`boolean`

Skip safety check

**Default**

```ts
false
```

#### overrides.publish.tag?

`string`

NPM tag (e.g. `latest`)

#### overrides.publish.token?

`string`

NPM token (e.g. `123456`) - only supported for pnpm and npm

#### overrides.release?

\{ `changelog?`: `boolean`; `clean?`: `boolean`; `commit?`: `boolean`; `gitTag?`: `boolean`; `noVerify?`: `boolean`; `providerRelease?`: `boolean`; `publish?`: `boolean`; `push?`: `boolean`; `social?`: `boolean`; \}

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

#### overrides.release.gitTag?

`boolean`

Create tag

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

#### overrides.release.social?

`boolean`

Post release announcements to social media platforms

**Default**

```ts
false
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

#### overrides.social?

\{ `changelogUrl?`: `string`; `slack?`: \{ `channel?`: `string`; `credentials?`: \{ `token?`: ... \| ...; \}; `enabled?`: `boolean`; `messageTemplate?`: `string`; `onlyStable?`: `boolean`; \}; `twitter?`: \{ `credentials?`: \{ `accessToken?`: ... \| ...; `accessTokenSecret?`: ... \| ...; `apiKey?`: ... \| ...; `apiSecret?`: ... \| ...; \}; `enabled?`: `boolean`; `messageTemplate?`: `string`; `onlyStable?`: `boolean`; \}; \}

Social media configuration

#### overrides.social.changelogUrl?

`string`

URL to full changelog (e.g., https://example.com/changelog)
This URL will be included in social media posts to allow users to view the complete changelog

#### overrides.social.slack?

\{ `channel?`: `string`; `credentials?`: \{ `token?`: ... \| ...; \}; `enabled?`: `boolean`; `messageTemplate?`: `string`; `onlyStable?`: `boolean`; \}

Slack configuration

#### overrides.social.slack.channel?

`string`

Slack channel ID or name (e.g., "#releases" or "C1234567890")

#### overrides.social.slack.credentials?

\{ `token?`: ... \| ...; \}

Slack credentials (optional - falls back to environment variables)

#### overrides.social.slack.credentials.token?

... \| ...

Slack Bot Token or User OAuth Token
Required scopes: chat:write, chat:write.public (for public channels)

#### overrides.social.slack.enabled?

`boolean`

Enable Slack posting

**Default**

```ts
false
```

#### overrides.social.slack.messageTemplate?

`string`

Custom message template
Available variables: {{projectName}}, {{version}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}

#### overrides.social.slack.onlyStable?

`boolean`

Skip Slack posting for prerelease versions (alpha, beta, rc, etc.)
Only stable versions will be posted to Slack

**Default**

```ts
true
```

#### overrides.social.twitter?

\{ `credentials?`: \{ `accessToken?`: ... \| ...; `accessTokenSecret?`: ... \| ...; `apiKey?`: ... \| ...; `apiSecret?`: ... \| ...; \}; `enabled?`: `boolean`; `messageTemplate?`: `string`; `onlyStable?`: `boolean`; \}

Twitter configuration

#### overrides.social.twitter.credentials?

\{ `accessToken?`: ... \| ...; `accessTokenSecret?`: ... \| ...; `apiKey?`: ... \| ...; `apiSecret?`: ... \| ...; \}

Twitter credentials (optional - falls back to environment variables)

#### overrides.social.twitter.credentials.accessToken?

... \| ...

Twitter Access Token

#### overrides.social.twitter.credentials.accessTokenSecret?

... \| ...

Twitter Access Token Secret

#### overrides.social.twitter.credentials.apiKey?

... \| ...

Twitter API Key (Consumer Key)

#### overrides.social.twitter.credentials.apiSecret?

... \| ...

Twitter API Secret (Consumer Secret)

#### overrides.social.twitter.enabled?

`boolean`

Enable Twitter posting

**Default**

```ts
false
```

#### overrides.social.twitter.messageTemplate?

`string`

Custom message template
Available variables: {{projectName}}, {{version}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}

#### overrides.social.twitter.onlyStable?

`boolean`

Skip Twitter posting for prerelease versions (alpha, beta, rc, etc.)
Only stable versions will be posted to Twitter

**Default**

```ts
true
```

#### overrides.templates?

\{ `commitMessage?`: `string`; `emptyChangelogContent?`: `string`; `slackMessage?`: `string`; `tagBody?`: `string`; `tagMessage?`: `string`; `twitterMessage?`: `string`; \}

Templates config

#### overrides.templates.commitMessage?

`string`

Commit message template

#### overrides.templates.emptyChangelogContent?

`string`

Empty changelog content

#### overrides.templates.slackMessage?

`string`

Slack message template (optional - if not provided, uses rich blocks format)
Available variables: {{projectName}}, {{version}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}

#### overrides.templates.tagBody?

`string`

Not used with "independent" version mode

#### overrides.templates.tagMessage?

`string`

Tag message template

#### overrides.templates.twitterMessage?

`string`

Twitter message template
Available variables: {{projectName}}, {{version}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}

#### overrides.to?

`string`

End tag

#### overrides.tokens?

\{ `github?`: `string`; `gitlab?`: `string`; `slack?`: `string`; `twitter?`: \{ `accessToken?`: `string`; `accessTokenSecret?`: `string`; `apiKey?`: `string`; `apiSecret?`: `string`; \}; \}

API tokens configuration

#### overrides.tokens.github?

`string`

GitHub token for creating releases
Environment variables: GITHUB_TOKEN, GH_TOKEN, RELIZY_GITHUB_TOKEN

#### overrides.tokens.gitlab?

`string`

GitLab token for creating releases
Environment variables: GITLAB_TOKEN, GITLAB_API_TOKEN, CI_JOB_TOKEN, RELIZY_GITLAB_TOKEN

#### overrides.tokens.slack?

`string`

Slack bot token for posting messages
Environment variables: SLACK_TOKEN, RELIZY_SLACK_TOKEN

#### overrides.tokens.twitter?

\{ `accessToken?`: `string`; `accessTokenSecret?`: `string`; `apiKey?`: `string`; `apiSecret?`: `string`; \}

Twitter API credentials for posting tweets
Environment variables: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
Or with RELIZY_ prefix: RELIZY_TWITTER_API_KEY, etc.

#### overrides.tokens.twitter.accessToken?

`string`

#### overrides.tokens.twitter.accessTokenSecret?

`string`

#### overrides.tokens.twitter.apiKey?

`string`

#### overrides.tokens.twitter.apiSecret?

`string`

#### overrides.types?

\{\[`key`: `string`\]: `false` \| \{ `semver?`: `SemverBumpType`; `title?`: `string`; \} \| `undefined`; \}

## Returns

`Promise`\<[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)\>
