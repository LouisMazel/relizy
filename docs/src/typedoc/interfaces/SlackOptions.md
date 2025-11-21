[relizy](../globals.md) / SlackOptions

# Interface: SlackOptions

Defined in: [src/types.ts:668](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L668)

## Properties

### changelog

> **changelog**: `string`

Defined in: [src/types.ts:680](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L680)

Changelog content

***

### changelogUrl?

> `optional` **changelogUrl**: `string`

Defined in: [src/types.ts:688](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L688)

Full changelog URL (e.g., https://example.com/changelog)

***

### channel

> **channel**: `string`

Defined in: [src/types.ts:692](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L692)

Slack channel ID or name

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [src/types.ts:705](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L705)

Run without side effects

#### Default

```ts
false
```

***

### messageTemplate?

> `optional` **messageTemplate**: `string`

Defined in: [src/types.ts:700](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L700)

Custom message template

***

### projectName

> **projectName**: `string`

Defined in: [src/types.ts:676](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L676)

Project name

***

### release

> **release**: [`PostedRelease`](PostedRelease.md)

Defined in: [src/types.ts:672](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L672)

Release information

***

### releaseUrl?

> `optional` **releaseUrl**: `string`

Defined in: [src/types.ts:684](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L684)

Release URL (GitHub/GitLab)

***

### token

> **token**: `string`

Defined in: [src/types.ts:696](https://github.com/LouisMazel/relizy/blob/2ef57034ec548cda308d10a2d236a6c6bd3b5888/src/types.ts#L696)

Slack token (required)
