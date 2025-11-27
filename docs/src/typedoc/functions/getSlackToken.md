[relizy](../globals.md) / getSlackToken

# Function: getSlackToken()

> **getSlackToken**(`options`): `string` \| `null`

Defined in: [src/core/slack.ts:9](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/core/slack.ts#L9)

Get Slack token from config
Priority: social.slack.credentials > config.tokens.slack > environment variables (handled in config.ts)

## Parameters

### options

#### socialCredentials?

[`SlackCredentials`](../interfaces/SlackCredentials.md)

#### tokenCredential?

`string`

## Returns

`string` \| `null`
