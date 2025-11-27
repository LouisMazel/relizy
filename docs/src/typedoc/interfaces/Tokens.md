[relizy](../globals.md) / Tokens

# Interface: Tokens

Defined in: [src/types.ts:763](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L763)

API tokens configuration

## Properties

### github?

> `optional` **github**: `string`

Defined in: [src/types.ts:768](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L768)

GitHub token for creating releases
Environment variables: GITHUB_TOKEN, GH_TOKEN, RELIZY_GITHUB_TOKEN

***

### gitlab?

> `optional` **gitlab**: `string`

Defined in: [src/types.ts:773](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L773)

GitLab token for creating releases
Environment variables: GITLAB_TOKEN, GITLAB_API_TOKEN, CI_JOB_TOKEN, RELIZY_GITLAB_TOKEN

***

### slack?

> `optional` **slack**: `string`

Defined in: [src/types.ts:789](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L789)

Slack bot token for posting messages
Environment variables: SLACK_TOKEN, RELIZY_SLACK_TOKEN

***

### twitter?

> `optional` **twitter**: `object`

Defined in: [src/types.ts:779](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/types.ts#L779)

Twitter API credentials for posting tweets
Environment variables: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
Or with RELIZY_ prefix: RELIZY_TWITTER_API_KEY, etc.

#### accessToken?

> `optional` **accessToken**: `string`

#### accessTokenSecret?

> `optional` **accessTokenSecret**: `string`

#### apiKey?

> `optional` **apiKey**: `string`

#### apiSecret?

> `optional` **apiSecret**: `string`
