[relizy](../globals.md) / getDefaultConfig

# Function: getDefaultConfig()

> **getDefaultConfig**(): `object`

Defined in: [src/core/config.ts:13](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/core/config.ts#L13)

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

### social

> **social**: `object`

#### social.slack

> **slack**: `object`

#### social.slack.enabled

> **enabled**: `boolean` = `false`

#### social.slack.onlyStable

> **onlyStable**: `boolean` = `true`

#### social.twitter

> **twitter**: `object`

#### social.twitter.enabled

> **enabled**: `boolean` = `false`

#### social.twitter.onlyStable

> **onlyStable**: `boolean` = `true`

### templates

> **templates**: `object`

#### templates.commitMessage

> **commitMessage**: `string` = `'chore(release): bump version to {{newVersion}}'`

#### templates.emptyChangelogContent

> **emptyChangelogContent**: `string` = `'No relevant changes for this release'`

#### templates.slackMessage

> **slackMessage**: `undefined` = `undefined`

#### templates.tagBody

> **tagBody**: `string` = `'v{{newVersion}}'`

#### templates.tagMessage

> **tagMessage**: `string` = `'Bump version to {{newVersion}}'`

#### templates.twitterMessage

> **twitterMessage**: `string` = `'🚀 {{projectName}} {{version}} is out!\n\n{{changelog}}\n\n📦 {{releaseUrl}}'`

### tokens

> **tokens**: `object`

#### tokens.github

> **github**: `string` \| `undefined`

#### tokens.gitlab

> **gitlab**: `string` \| `undefined`

#### tokens.slack

> **slack**: `string` \| `undefined`

#### tokens.twitter

> **twitter**: `object`

#### tokens.twitter.accessToken

> **accessToken**: `string` \| `undefined`

#### tokens.twitter.accessTokenSecret

> **accessTokenSecret**: `string` \| `undefined`

#### tokens.twitter.apiKey

> **apiKey**: `string` \| `undefined`

#### tokens.twitter.apiSecret

> **apiSecret**: `string` \| `undefined`

### types

> **types**: `Record`\<`string`, `false` \| \{ `semver?`: `SemverBumpType`; `title`: `string`; \}\>
