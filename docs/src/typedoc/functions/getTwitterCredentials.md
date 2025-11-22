[relizy](../globals.md) / getTwitterCredentials

# Function: getTwitterCredentials()

> **getTwitterCredentials**(`options`): [`ResolvedTwitterCredentials`](../interfaces/ResolvedTwitterCredentials.md) \| `null`

Defined in: [src/core/twitter.ts:16](https://github.com/LouisMazel/relizy/blob/e825440947cdf546c2bcfbd3c3752ac669c25476/src/core/twitter.ts#L16)

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
