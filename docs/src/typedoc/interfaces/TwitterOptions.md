[relizy](../globals.md) / TwitterOptions

# Interface: TwitterOptions

Defined in: [src/types.ts:627](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L627)

## Properties

### changelog

> **changelog**: `string`

Defined in: [src/types.ts:639](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L639)

Changelog content

***

### changelogUrl?

> `optional` **changelogUrl**: `string`

Defined in: [src/types.ts:647](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L647)

Full changelog URL (e.g., https://example.com/changelog)

***

### credentials

> **credentials**: `object`

Defined in: [src/types.ts:651](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L651)

Twitter credentials (all fields required)

#### accessToken

> **accessToken**: `string`

#### accessTokenSecret

> **accessTokenSecret**: `string`

#### apiKey

> **apiKey**: `string`

#### apiSecret

> **apiSecret**: `string`

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:665](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L665)

Run without side effects

#### Default

```ts
false
```

***

### projectName

> **projectName**: `string`

Defined in: [src/types.ts:635](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L635)

Project name

***

### release

> **release**: [`PostedRelease`](PostedRelease.md)

Defined in: [src/types.ts:631](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L631)

Release information

***

### releaseUrl?

> `optional` **releaseUrl**: `string`

Defined in: [src/types.ts:643](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L643)

Release URL (GitHub/GitLab)

***

### twitterMessage

> **twitterMessage**: `string`

Defined in: [src/types.ts:660](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L660)

Custom Twitter message template
