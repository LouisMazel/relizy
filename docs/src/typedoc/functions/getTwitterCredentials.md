[relizy](../globals.md) / getTwitterCredentials

# Function: getTwitterCredentials()

> **getTwitterCredentials**(`options`): [`ResolvedTwitterCredentials`](../interfaces/ResolvedTwitterCredentials.md) \| `null`

Defined in: [src/core/twitter.ts:16](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/core/twitter.ts#L16)

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
