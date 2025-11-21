[relizy](../globals.md) / SlackSocialConfig

# Interface: SlackSocialConfig

Defined in: [src/types.ts:581](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L581)

## Properties

### channel?

> `optional` **channel**: `string`

Defined in: [src/types.ts:596](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L596)

Slack channel ID or name (e.g., "#releases" or "C1234567890")

***

### credentials?

> `optional` **credentials**: [`SlackCredentials`](SlackCredentials.md)

Defined in: [src/types.ts:605](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L605)

Slack credentials (optional - falls back to environment variables)

***

### enabled?

> `optional` **enabled**: `boolean`

Defined in: [src/types.ts:586](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L586)

Enable Slack posting

#### Default

```ts
false
```

***

### messageTemplate?

> `optional` **messageTemplate**: `string`

Defined in: [src/types.ts:601](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L601)

Custom message template
Available variables: {{projectName}}, {{version}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}

***

### onlyStable?

> `optional` **onlyStable**: `boolean`

Defined in: [src/types.ts:592](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L592)

Skip Slack posting for prerelease versions (alpha, beta, rc, etc.)
Only stable versions will be posted to Slack

#### Default

```ts
true
```
