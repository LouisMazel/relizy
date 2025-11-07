[relizy](../globals.md) / getDefaultConfig

# Function: getDefaultConfig()

> **getDefaultConfig**(): `object`

Defined in: [src/core/config.ts:12](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/core/config.ts#L12)

## Returns

`object`

### bump

> **bump**: `Required`\<`Omit`\<[`BumpConfig`](../interfaces/BumpConfig.md), `"preid"`\>\>

### changelog

> **changelog**: `Required`\<[`ChangelogConfig`](../interfaces/ChangelogConfig.md)\>

### cwd

> **cwd**: `string`

### excludeAuthors

> **excludeAuthors**: `never`[] = `[]`

### logLevel

> **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

### noAuthors

> **noAuthors**: `boolean` = `false`

### publish

> **publish**: `object`

#### publish.args

> **args**: `never`[] = `[]`

#### publish.private

> **private**: `boolean` = `false`

### release

> **release**: `Required`\<[`ReleaseConfig`](../interfaces/ReleaseConfig.md)\>

### scopeMap

> **scopeMap**: `object` = `{}`

### templates

> **templates**: `object`

#### templates.commitMessage

> **commitMessage**: `string` = `'chore(release): bump version to {{newVersion}}'`

#### templates.emptyChangelogContent

> **emptyChangelogContent**: `string` = `'No relevant changes for this release'`

#### templates.tagBody

> **tagBody**: `string` = `'v{{newVersion}}'`

#### templates.tagMessage

> **tagMessage**: `string` = `'Bump version to v{{newVersion}}'`

### tokens

> **tokens**: `object`

#### tokens.github

> **github**: `string` \| `undefined`

#### tokens.gitlab

> **gitlab**: `string` \| `undefined`

### types

> **types**: `Record`\<`string`, `boolean` \| \{ `semver?`: `SemverBumpType`; `title`: `string`; \}\>
