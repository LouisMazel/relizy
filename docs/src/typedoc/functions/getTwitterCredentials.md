[relizy](../globals.md) / getTwitterCredentials

# Function: getTwitterCredentials()

> **getTwitterCredentials**(`options`): [`ResolvedTwitterCredentials`](../interfaces/ResolvedTwitterCredentials.md) \| `null`

Defined in: [src/core/twitter.ts:16](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/core/twitter.ts#L16)

Get Twitter credentials from config
Priority: social.twitter.credentials > config.tokens.twitter > environment variables (handled in config.ts)

## Parameters

### options

#### socialCredentials?

[`TwitterCredentials`](../interfaces/TwitterCredentials.md)

#### tokenCredentials?

[`TwitterCredentials`](../interfaces/TwitterCredentials.md)

## Returns

[`ResolvedTwitterCredentials`](../interfaces/ResolvedTwitterCredentials.md) \| `null`
