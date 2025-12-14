[relizy](../globals.md) / getDefaultConfig

# Function: getDefaultConfig()

> **getDefaultConfig**(): `object`

Defined in: [src/core/config.ts:13](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/core/config.ts#L13)

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

#### publish.safetyCheck

> **safetyCheck**: `boolean` = `false`

### release

> **release**: `Required`\<[`ReleaseConfig`](../interfaces/ReleaseConfig.md)\>

### safetyCheck

> **safetyCheck**: `boolean` = `true`

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

> **tagMessage**: `string` = `'Bump version to {{newVersion}}'`

### tokens

> **tokens**: `object`

#### tokens.github

> **github**: `string` \| `undefined`

#### tokens.gitlab

> **gitlab**: `string` \| `undefined`

### types

> **types**: `Record`\<`string`, `false` \| \{ `semver?`: `SemverBumpType`; `title`: `string`; \}\>
